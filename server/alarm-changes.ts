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

/**
 * Só campos seguros: a mensagem de um erro do drizzle traz os parâmetros da
 * query (openId, nome do lembrete) — nunca vai para o log.
 */
function safeErr(err: unknown): string {
  const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
  return `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim();
}

/** `alarmId` vem do cliente sem limite; a coluna é varchar(64). */
const MAX_ALARM_ID_LENGTH = 64;

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
  changes: AlarmChange[],
  author?: { openId: string; name: string }
): Promise<void> {
  const message = buildAlarmChangePush(personName, changes, author?.name);
  if (!message) return;
  if (isPushRateLimited(openId)) return;

  // O autor da mudança (um cuidador) sabe o que fez: só os outros são avisados.
  const caregivers = (await getActiveCaregiversForMonitored(openId)).filter(
    (c) => c.caregiverOpenId !== author?.openId
  );
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

  // Um id grande demais derrubaria o insert em lote inteiro; não trunca (não
  // casaria com nada).
  const storable = changes.filter((c) => c.alarmId.length <= MAX_ALARM_ID_LENGTH);
  try {
    await insertAlarmChanges(storable.map((c) => ({ openId: args.openId, ...c })));
  } catch (err) {
    console.warn("[AlarmChanges] falha ao registrar mudanças de alarme:", safeErr(err));
  }

  // Fire-and-forget: o fetch do Expo não tem timeout e não pode segurar o backup.
  void pushToCaregivers(args.openId, args.personName, changes).catch((err) => {
    console.warn("[AlarmChanges] falha ao avisar o cuidador:", safeErr(err));
  });
}

/**
 * O cuidador do acordo mudou a lista gerenciada do idoso. Grava cada mudança
 * com o cuidador como autor e avisa os OUTROS cuidadores vinculados. O backup
 * do celular (`userData.put`) não repete isto: com o acordo ativo ele pula o
 * diff, senão o celular da Maria, ao aplicar o que a Ana apagou, geraria
 * "Maria apagou…".
 *
 * Best-effort como o resto do módulo: a lista já foi gravada e NÃO pode falhar
 * por causa de um registro ou de um push.
 */
export async function recordCaregiverAlarmChanges(args: {
  monitoredOpenId: string;
  authorOpenId: string;
  authorName: string;
  personName: string;
  changes: AlarmChange[];
}): Promise<void> {
  if (args.changes.length === 0) return;

  const storable = args.changes.filter((c) => c.alarmId.length <= MAX_ALARM_ID_LENGTH);
  try {
    await insertAlarmChanges(
      storable.map((c) => ({
        openId: args.monitoredOpenId,
        ...c,
        changedByOpenId: args.authorOpenId,
      }))
    );
  } catch (err) {
    console.warn("[AlarmChanges] falha ao registrar mudanças do cuidador:", safeErr(err));
  }

  void pushToCaregivers(args.monitoredOpenId, args.personName, args.changes, {
    openId: args.authorOpenId,
    name: args.authorName,
  }).catch((err) => {
    console.warn("[AlarmChanges] falha ao avisar os outros cuidadores:", safeErr(err));
  });
}
