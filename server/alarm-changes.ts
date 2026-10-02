/**
 * alarm-changes.ts
 *
 * Depois que o backup é gravado: compara a lista anterior com a nova, registra
 * o que o usuário tirou do ar e avisa os cuidadores vinculados.
 *
 * Best-effort de ponta a ponta: o backup do usuário já foi gravado e NÃO pode
 * falhar por causa de um registro ou de um push.
 */
import { buildAlarmChangePush, diffAlarms, type AlarmChange } from "./_core/alarm-diff";
import { insertAlarmChanges } from "./db-alarm-changes";
import { getActiveCaregiversForMonitored } from "./db-links";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoPush } from "./push";

/**
 * Máx. 5 pushes de mudança por minuto por conta: um cliente com defeito (ou
 * mal-intencionado) alternando alarmes não pode virar spam no cuidador. Só o
 * PUSH é limitado — a mudança é sempre gravada.
 */
const PUSH_WINDOW_MS = 60_000;
const PUSH_LIMIT = 5;
const pushLog = new Map<string, number[]>();

function isPushRateLimited(openId: string): boolean {
  const now = Date.now();
  const recent = (pushLog.get(openId) ?? []).filter((ts) => now - ts < PUSH_WINDOW_MS);
  if (recent.length >= PUSH_LIMIT) {
    pushLog.set(openId, recent);
    return true;
  }
  recent.push(now);
  pushLog.set(openId, recent);
  return false;
}

async function pushToCaregivers(
  openId: string,
  personName: string,
  changes: AlarmChange[]
): Promise<void> {
  const message = buildAlarmChangePush(personName, changes);
  if (!message) return;
  if (isPushRateLimited(openId)) return;

  const caregivers = await getActiveCaregiversForMonitored(openId);
  if (caregivers.length === 0) return;
  const tokens = await getPushTokensForOpenIds(caregivers.map((c) => c.caregiverOpenId));
  if (tokens.length === 0) {
    // Mesmo aviso dos outros pushes ao cuidador: sem token o alerta some em
    // silêncio. Sem openId no log (LGPD).
    console.warn(
      `[AlarmChanges] ${caregivers.length} cuidador(es) vinculado(s), 0 push tokens — push NÃO enviado.`
    );
    return;
  }
  await sendExpoPush(
    tokens.map((t) => t.token),
    { ...message, data: { type: "alarm_changed", url: "/(caregiver-tabs)/alerts" } }
  );
}

export async function recordAndNotifyAlarmChanges(args: {
  openId: string;
  previousAlarms: unknown;
  nextAlarms: unknown;
  personName: string;
}): Promise<void> {
  const changes = diffAlarms(args.previousAlarms, args.nextAlarms);
  if (changes.length === 0) return;

  try {
    await insertAlarmChanges(changes.map((c) => ({ openId: args.openId, ...c })));
  } catch (err) {
    console.warn("[AlarmChanges] falha ao registrar mudanças de alarme:", err);
  }

  try {
    await pushToCaregivers(args.openId, args.personName, changes);
  } catch (err) {
    console.warn("[AlarmChanges] falha ao avisar o cuidador:", err);
  }
}
