/**
 * dms-preregister.ts
 *
 * O servidor pré-registra o PRÓXIMO disparo de cada alarme das contas de idoso.
 *
 * Até a Fase 4 só o celular pré-registrava (syncAlarmsToServer). Idoso que passa
 * dias sem abrir o app não tinha evento pendente: o alarme que não tocou nunca
 * escalava. Aqui o servidor sabe o que era esperado, sem nunca fazer o alarme
 * tocar nem mandar mensagem ao idoso (quem toca é sempre o celular).
 *
 * De onde vem a lista:
 *  - conta GERENCIADA: `appliedAlarms` menos `failedAlarmIds` (o que o celular
 *    confirmou ter agendado). Alarme que o cuidador criou e o celular ainda não
 *    confirmou NUNCA é cobrado, e `user_data.alarms` é ignorado;
 *  - conta comum: os alarmes ligados do backup (`user_data.alarms`).
 *
 * Só o próximo disparo, e só se cair nas próximas 24 h (um alarme toca no máximo
 * uma vez por dia, como o celular já registra). Conta pausada ou com mais de
 * 48 h sem sinal nem entra na consulta (ver getPreRegisterCandidates).
 */
import { DEFAULT_TIME_ZONE, nextFireMs } from "../shared/alarm-schedule";
import { SAME_FIRING_WINDOW_MINUTES, type ManagedAlarm } from "../shared/managed-alarm";
import { DEFAULT_GRACE_MINUTES } from "./_core/event-kind";
import { runEach } from "./_core/job-isolation";
import {
  deleteFuturePendingEvents,
  ensureServerAlarmEvent,
  getPreRegisterCandidates,
  type PreRegisterCandidate,
} from "./db-monitoring";

const HORIZON_MS = 24 * 60 * 60 * 1000;
/** Atrasos de aviso que o check-in aceita (`CHECKIN_ESCALATE_OPTIONS` do app). */
const CHECKIN_GRACE_OPTIONS: readonly number[] = [5, 10, 15, 30];
const REPEATS: readonly string[] = ["daily", "weekdays", "weekends", "custom"];
/** `alarm_events.alarmId` é varchar(64). */
const MAX_ALARM_ID_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 255;
/** HH:MM de 00:00 a 23:59; "25:99" não viraria um horário real. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ChargeableAlarm = {
  id: string;
  time: string;
  description: string;
  repeat: ManagedAlarm["repeat"];
  customDays: number[];
  isCheckin: boolean;
  graceMinutes: number;
};

/** Alarmes LIGADOS de uma lista JSON de origem não confiável. Item ruim é ignorado. */
function readEnabledAlarms(raw: unknown): ChargeableAlarm[] {
  if (!Array.isArray(raw)) return [];
  const out: ChargeableAlarm[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    if (a.enabled !== true) continue;
    if (typeof a.id !== "string" || a.id.length === 0 || a.id.length > MAX_ALARM_ID_LENGTH) continue;
    if (typeof a.time !== "string" || !TIME_PATTERN.test(a.time)) continue;
    out.push({
      id: a.id,
      time: a.time,
      description: typeof a.description === "string" ? a.description : "",
      // Valor desconhecido dispara todo dia, como firingJsDays faz no app.
      repeat: REPEATS.includes(a.repeat as string) ? (a.repeat as ManagedAlarm["repeat"]) : "daily",
      customDays: Array.isArray(a.customDays)
        ? a.customDays.filter((d): d is number => Number.isInteger(d))
        : [],
      isCheckin: a.kind === "checkin",
      graceMinutes: CHECKIN_GRACE_OPTIONS.includes(a.escalateAfterMinutes as number)
        ? (a.escalateAfterMinutes as number)
        : DEFAULT_GRACE_MINUTES,
    });
  }
  return out;
}

function readIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

/** O que o servidor cobra desta conta. Ver o cabeçalho do arquivo. */
export function alarmsToCharge(candidate: PreRegisterCandidate): ChargeableAlarm[] {
  if (candidate.managed) {
    const failed = new Set(readIds(candidate.managed.failedAlarmIds));
    return readEnabledAlarms(candidate.managed.appliedAlarms).filter((a) => !failed.has(a.id));
  }
  return readEnabledAlarms(candidate.alarms);
}

/**
 * O fuso vem do aparelho (entrada não confiável): nome inválido faz o Intl
 * lançar RangeError, e isso derrubaria o pré-registro de uma conta inteira.
 */
export function resolveTimeZone(timeZone: string | null): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone });
    return timeZone;
  } catch {
    // Sem o valor no log: é texto vindo do cliente.
    console.warn("[PreRegistro] fuso inválido guardado na conta — usando o padrão");
    return DEFAULT_TIME_ZONE;
  }
}

export async function runPreRegistration(now: Date): Promise<{ registered: number }> {
  const candidates = await getPreRegisterCandidates(now);
  let registered = 0;

  const failedAccounts = await runEach(candidates, "Pré-registro de conta", async (account) => {
    const timeZone = resolveTimeZone(account.timezone);

    // Alarme que o celular não conseguiu agendar não é cobrado, e o evento que
    // ele registrou antes da mudança também sai.
    if (account.managed) {
      const failedIds = readIds(account.managed.failedAlarmIds);
      if (failedIds.length > 0) await deleteFuturePendingEvents(account.openId, failedIds, now);
    }

    const failedAlarms = await runEach(alarmsToCharge(account), "Pré-registro de alarme", async (alarm) => {
      const fireMs = nextFireMs(
        { time: alarm.time, enabled: true, repeat: alarm.repeat, customDays: alarm.customDays },
        timeZone,
        now
      );
      if (fireMs === null || fireMs - now.getTime() > HORIZON_MS) return;

      const outcome = await ensureServerAlarmEvent(
        {
          openId: account.openId,
          alarmId: alarm.id,
          alarmDescription: (alarm.description || alarm.time).slice(0, MAX_DESCRIPTION_LENGTH),
          scheduledAt: new Date(fireMs),
          timezone: timeZone,
          status: "pending",
          // Mesmo contrato de monitoring.createEvent: remédio não leva kind nem grace.
          ...(alarm.isCheckin ? { kind: "checkin", graceMinutes: alarm.graceMinutes } : {}),
        },
        SAME_FIRING_WINDOW_MINUTES
      );
      if (outcome === "created") registered++;
    });
    if (failedAlarms > 0) throw new Error("alarmes da conta falharam");
  });

  // Sem a mensagem dos erros: o `lastError` do job aparece em /api/health.
  if (failedAccounts > 0) throw new Error(`Pré-registro: ${failedAccounts} conta(s) falharam`);
  return { registered };
}
