/**
 * managed-alarm-schema.ts
 *
 * Validação da lista de alarmes gerenciada (Fase 4). São as MESMAS regras do
 * formulário do app (`lib/alarm-form.ts` + `AlarmFormModal`), aplicadas no
 * servidor porque o cliente nunca é confiável:
 *  - `time` "HH:MM" (a hora pode vir com um dígito — o formulário já gravou
 *    "8:30" no passado — e sai padronizada com dois);
 *  - `repeat` ∈ daily/weekdays/weekends/custom; `custom` exige pelo menos um dia
 *    em 0..6 (0 = domingo);
 *  - check-in é sempre diário, com nome fixo, e o atraso ∈ 5/10/15/30; remédio
 *    não tem atraso;
 *  - nome até 80 caracteres.
 *
 * Duas portas de entrada, com a mesma forma de saída (`ManagedAlarm`):
 *  - `managedAlarmInputSchema` + `normalizeManagedAlarm`: o cuidador cria/edita
 *    (nome acima de 80 é RECUSADO; o id é do servidor);
 *  - `sanitizeAcceptedList`: o idoso aceita o pedido mandando a lista dele (nome
 *    acima de 80 é CORTADO — recusar travaria um aceite legítimo; nada pode sumir).
 * Chaves desconhecidas (`notificationId`, `nativeAlarmUids`, um `id` mandado por
 * quem não pode escolher o id…) são descartadas, nunca gravadas.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MANAGED_ALARMS_MAX,
  MANAGED_DESCRIPTION_MAX,
  type ManagedAlarm,
} from "../../shared/managed-alarm.js";

/** Hora com um ou dois dígitos (o formulário aceita "8:30") e minutos com dois. */
const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** "8:30" -> "08:30". */
function padTime(time: string): string {
  const [hour, minute] = time.split(":");
  return `${hour.padStart(2, "0")}:${minute}`;
}

const alarmShape = {
  time: z.string().regex(TIME_PATTERN).transform(padTime),
  description: z.string().max(MANAGED_DESCRIPTION_MAX),
  enabled: z.boolean(),
  repeat: z.enum(["daily", "weekdays", "weekends", "custom"]),
  customDays: z.array(z.number().int().min(0).max(6)).max(7).nullish(),
  sound: z.boolean(),
  vibration: z.boolean(),
  kind: z.enum(["medication", "checkin"]).nullish(),
  escalateAfterMinutes: z
    .union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)])
    .nullish(),
};

/** "Personalizado" sem nenhum dia não tem quando tocar (o formulário também bloqueia). */
function requireCustomDays(
  alarm: { repeat: string; kind?: string | null; customDays?: number[] | null },
  ctx: z.RefinementCtx,
): void {
  // O check-in não tem escolha de repetição: é forçado a diário em normalizeManagedAlarm.
  if (alarm.kind === "checkin") return;
  if (alarm.repeat === "custom" && (alarm.customDays ?? []).length === 0) {
    ctx.addIssue({ code: "custom", path: ["customDays"], message: "Escolha pelo menos um dia." });
  }
}

/** Alarme SEM id: o que o cuidador manda para criar ou editar. */
export const managedAlarmInputSchema = z.object(alarmShape).superRefine(requireCustomDays);

/** Alarme COM id (1..64 caracteres: cabe em `alarm_events.alarmId`). */
export const managedAlarmSchema = z
  .object({ id: z.string().min(1).max(64), ...alarmShape })
  .superRefine(requireCustomDays);

export type ManagedAlarmInput = z.infer<typeof managedAlarmInputSchema>;

/**
 * Forma canônica gravada na lista. Check-in: sempre diário, `customDays` vazio,
 * nome "Check-in" (como `formForSave` no app). Remédio: sem atraso de check-in;
 * `customDays` só vale em "personalizado" (ordenado, sem repetição) e é `[]` nos
 * demais. `kind` fica como veio (ausente = remédio).
 */
export function normalizeManagedAlarm(alarm: ManagedAlarmInput, id: string): ManagedAlarm {
  const base = {
    id,
    time: alarm.time,
    enabled: alarm.enabled,
    sound: alarm.sound,
    vibration: alarm.vibration,
  };

  if (alarm.kind === "checkin") {
    return {
      ...base,
      description: "Check-in",
      repeat: "daily",
      customDays: [],
      kind: "checkin",
      ...(alarm.escalateAfterMinutes ? { escalateAfterMinutes: alarm.escalateAfterMinutes } : {}),
    };
  }

  const customDays =
    alarm.repeat === "custom" ? [...new Set(alarm.customDays ?? [])].sort((a, b) => a - b) : [];
  return {
    ...base,
    description: alarm.description,
    repeat: alarm.repeat,
    customDays,
    ...(alarm.kind ? { kind: alarm.kind } : {}),
  };
}

const UNREADABLE_LIST = "Não foi possível ler seus alarmes.";

function unreadable(): TRPCError {
  return new TRPCError({ code: "BAD_REQUEST", message: UNREADABLE_LIST });
}

/**
 * Lista que o idoso manda ao aceitar o pedido. Valida cada item com as regras
 * acima, corta nome acima de 80 caracteres (não recusa) e devolve a lista
 * canônica. Qualquer item ilegível — sem id, horário inválido, repetição
 * desconhecida, dias personalizados vazios, id repetido —, lista que não é lista
 * ou mais de 24 alarmes recusa o aceite inteiro com `BAD_REQUEST`: ativar com uma
 * lista pela metade apagaria alarmes dele em silêncio.
 */
export function sanitizeAcceptedList(raw: unknown): ManagedAlarm[] {
  if (!Array.isArray(raw)) throw unreadable();
  if (raw.length > MANAGED_ALARMS_MAX) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Limite de ${MANAGED_ALARMS_MAX} alarmes atingido.`,
    });
  }

  const seen = new Set<string>();
  return raw.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw unreadable();
    const candidate = item as Record<string, unknown>;
    const clipped =
      typeof candidate.description === "string"
        ? { ...candidate, description: candidate.description.slice(0, MANAGED_DESCRIPTION_MAX) }
        : candidate;

    const parsed = managedAlarmSchema.safeParse(clipped);
    if (!parsed.success || seen.has(parsed.data.id)) throw unreadable();
    seen.add(parsed.data.id);

    const { id, ...input } = parsed.data;
    return normalizeManagedAlarm(input, id);
  });
}
