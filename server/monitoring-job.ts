/**
 * monitoring-job.ts
 *
 * Server-side background job that runs every 5 minutes to:
 * 1. Detect alarm events that expired without confirmation
 *    -> If the account was offline (no heartbeat): mark as "not_sent"
 *    -> If the account was online but user didn't respond: mark as "missed"
 * 2. Escalate accounts with an unconfirmed alarm/check-in event, by how long
 *    the expected answer has been missing
 *    -> Send progressive warning messages to emergency contacts via WhatsApp
 *
 * Tudo chaveado por CONTA (openId): a pergunta do switch é "esta PESSOA está
 * respondendo?", não "este aparelho está ligado?". Ver
 * docs/design/2026-07-12-monitoring-account-ownership.md.
 *
 * A escada do Passo 2 mede a idade do EVENTO não confirmado, não a ausência de
 * heartbeat — o heartbeat só corre com o app em primeiro plano e media a coisa
 * errada nos dois sentidos (ruído para quem responde e fecha o app; silêncio
 * total para quem deixa o app aberto e não responde). Ver docs/claude/alarmes.md.
 *
 * Warning escalation levels (horas desde que a resposta era esperada):
 *   Level 1 (30min) -> Aviso leve: um alarme sem confirmação
 *   Level 2 (2h)    -> Preocupação moderada
 *   Level 3 (6h+)   -> Alerta sério: possível emergência
 */
import {
  claimWarning,
  deleteAlarmEvent,
  getAccountLiveness,
  getAccountsWithUnconfirmedEvents,
  getExpiredPendingEvents,
  getMissedCheckinEvents,
  getMissedMedicationEvents,
  getWarningHistory,
  markEventWarningSent,
  purgeStaleData,
  releaseWarning,
  updateAlarmEventStatus,
  updateWarningResult,
} from "./db-monitoring";
import { getUserByOpenId, getUserData } from "./db";
import { purgeAbandonedAnonymousAccounts } from "./db-account";
import { sendWhatsAppMessage, isWhatsAppApiConfigured } from "./whatsapp";
import { getActiveCaregiversForMonitored } from "./db-links";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoPush } from "./push";
import type { EmergencyContactRecord } from "../drizzle/schema";
import { formatEventTime } from "./_core/format-event-time";
import { parseLatLng } from "./_core/parse-lat-lng";

// Grace period: how long after scheduledAt we wait before resolving a pending event.
// Precisa cobrir só o caminho feliz do cliente: countdown máximo de 60s
// (timerDuration) + retries de rede do confirmEvent (~1min no pior caso).
// 5min cobre com folga; os 15min antigos empurravam o alerta ao cuidador para
// 15–20min depois do horário (grace + cadência do job) — tempo demais para um
// dead man's switch. Resposta tardia real ainda corrige o status depois
// (updateAlarmEventStatusByAlarmId aceita 'responded' sobre missed/not_sent).
const GRACE_PERIOD_MINUTES = 5;

// Look-back (horas) compartilhado por toda escalação orientada a evento:
// Passos 2, 3 e 4. Evento mais velho que isso não escala mais — uma instalação
// abandonada para de avisar a família em vez de avisar para sempre.
const EVENT_LOOKBACK_HOURS = 48;

// Limiares da escada, em horas desde que a resposta era ESPERADA (não desde o
// último heartbeat). Fracionário permitido: 0.5 = 30 min.
const WARNING_LEVELS = [
  { level: 1, hours: 0.5, label: "aviso leve" },
  { level: 2, hours: 2,   label: "preocupação moderada" },
  { level: 3, hours: 6,   label: "alerta sério" },
];

// Minimum interval between warnings of the same level (hours)
const MIN_WARNING_INTERVAL_HOURS = 2;

// O check-in diário é um alarme sintético do cliente (lib/checkin-service.ts):
// tem o mesmo id fixo aqui, no routers-monitoring e no cliente, mas NÃO vive na
// lista de alarmes do usuário. Por isso ele nunca passa pela checagem de agenda
// abaixo — "ausente da lista" é o estado normal dele, não prova de cancelamento.
const CHECKIN_ALARM_ID = "checkin-daily";

/**
 * O alarme que pré-registrou este evento ainda está de pé na agenda da conta?
 *
 * `syncAlarmsToServer` só CRIA evento para alarme habilitado — quando o usuário
 * desativa ou apaga um alarme, o evento já pré-registrado ficava pendente,
 * vencia e escalava como 'missed'/'not_sent'. A família recebia WhatsApp por um
 * alarme desligado de propósito, e alarme falso ensina a ignorar o verdadeiro.
 *
 * A agenda autoritativa é `user_data.alarms` (sobe no cloud backup).
 *
 * Conservador de propósito: só responde `false` com PROVA POSITIVA de que o
 * alarme saiu do ar. Sem agenda no servidor (conta que nunca sincronizou, blob
 * corrompido) devolve `true` e o evento escala como antes — falso positivo
 * assusta a família, falso negativo cala o dead man's switch.
 */
export function isAlarmStillArmed(alarms: unknown, alarmId: string): boolean {
  if (!Array.isArray(alarms)) return true;
  const found = alarms.find(
    (a): a is { id: string; enabled?: boolean } =>
      !!a && typeof a === "object" && (a as { id?: unknown }).id === alarmId
  );
  if (!found) return false;
  // `enabled` ausente = formato antigo, conta como armado.
  return found.enabled !== false;
}

// --- Job health (dead man's switch self-monitoring) -----------------------
// The whole escalation depends on this job running. Previously a thrown error
// was swallowed into console.error with no signal, so a persistently failing
// job (DB down, etc.) would silently disarm the switch. We track run health
// here and expose it via /api/health so an external uptime monitor can alert.

// Consecutive failures tolerated before /api/health reports unhealthy.
const MAX_HEALTHY_FAILURES = 2;
// No successful run within 3 cycles (15 min) => stale => unhealthy.
const STALE_MS = 15 * 60 * 1000;

type JobHealthState = {
  lastRunAt: number;
  lastSuccessAt: number;
  consecutiveFailures: number;
  lastError: string | null;
};

const jobHealth: JobHealthState = {
  lastRunAt: 0,
  lastSuccessAt: 0,
  consecutiveFailures: 0,
  lastError: null,
};

/**
 * Pure health verdict from a job-health snapshot. Unhealthy when too many
 * consecutive failures OR when a previously-running job went stale (scheduler
 * stuck). Returns healthy before the first run so boot-time health checks pass.
 */
export function computeMonitoringHealth(state: JobHealthState, now: number) {
  const stale = state.lastRunAt > 0 && now - state.lastRunAt > STALE_MS;
  const healthy = state.consecutiveFailures <= MAX_HEALTHY_FAILURES && !stale;
  return { ...state, stale, healthy };
}

/** Current monitoring-job health (consumed by /api/health). */
export function getMonitoringHealth() {
  return computeMonitoringHealth(jobHealth, Date.now());
}

/**
 * A warning that reached NOBODY (no WhatsApp delivered, no caregiver push)
 * should release its dedup claim so the next run retries, instead of being
 * recorded as sent and blocking this level for MIN_WARNING_INTERVAL_HOURS.
 */
export function shouldRetryWarning(totalSent: number, pushed: number): boolean {
  return totalSent === 0 && pushed === 0;
}

function formatOfflineDuration(unansweredHours: number): string {
  if (unansweredHours < 1) {
    const minutes = Math.round(unansweredHours * 60);
    return `${minutes} minutos`;
  }
  const hours = Math.round(unansweredHours);
  return `${hours} hora${hours !== 1 ? "s" : ""}`;
}

/**
 * Perfil de escalação da conta: nome e contatos de emergência consentidos.
 * Vem de user_data (lar autoritativo por conta) com fallback do nome da
 * conta (users.name). ANATEL opt-in: só contatos que não recusaram alertas
 * (legado/undefined é mantido; só o false explícito exclui). Manual SOS não
 * passa por aqui.
 */
async function getAccountProfile(openId: string): Promise<{
  userName: string;
  contacts: EmergencyContactRecord[];
}> {
  const [data, user] = await Promise.all([
    getUserData(openId),
    getUserByOpenId(openId),
  ]);
  const anamnesis = (data?.anamnesis ?? null) as { fullName?: string } | null;
  const userName = anamnesis?.fullName || user?.name || "";
  const contacts = ((data?.emergencyContacts ?? []) as EmergencyContactRecord[]).filter(
    (c) => c && c.consentToAlerts !== false
  );
  return { userName, contacts };
}

/**
 * Build a progressive warning message based on escalation level.
 */
function buildWarningMessage(
  userName: string,
  level: number,
  unansweredHours: number,
  locationUrl?: string
): string {
  const name = userName || "O usuário do Vigora";
  const duration = formatOfflineDuration(unansweredHours);

  let header: string;
  let body: string;

  // A escada fala do ALARME sem resposta, não de uso do app: "sem atividade no
  // aplicativo" descrevia algo esperado (responder e fechar o app) e soava como
  // alarme falso para quem recebe. O que exige ação é a resposta que não veio.
  if (level === 1) {
    header = "⚠️ AVISO - Vigora";
    body =
      `${name} não confirmou um alarme de saúde previsto há aproximadamente ${duration}.\n\n` +
      `Isso pode indicar que o celular está desligado, sem bateria ou sem conexão — ` +
      `ou que a pessoa não conseguiu responder.\n\n` +
      `Recomendamos entrar em contato para verificar se está tudo bem.`;
  } else if (level === 2) {
    header = "⚠️⚠️ ATENÇÃO - Vigora";
    body =
      `${name} está sem responder aos alarmes de saúde há aproximadamente ${duration}.\n\n` +
      `Por favor, tente entrar em contato com urgência.`;
  } else {
    header = "🚨 ALERTA SÉRIO - Vigora";
    body =
      `${name} está sem responder aos alarmes de saúde há mais de ${duration}.\n\n` +
      `Esta situação requer atenção imediata. ` +
      `Considere acionar serviços de emergência se não conseguir contato.`;
  }

  let message = `${header}\n\n${body}`;

  if (locationUrl) {
    message += `\n\n📍 Última localização registrada:\n${locationUrl}`;
  }

  message += `\n\n- Enviado automaticamente pelo Vigora`;
  return message;
}

/** Short push title for an unanswered-alarm warning, by escalation level. */
function buildWarningPushTitle(level: number): string {
  if (level === 1) return "⚠️ Aviso — Vigora";
  if (level === 2) return "⚠️ Atenção — Vigora";
  return "🚨 Alerta sério — Vigora";
}

/** Short push body: há quanto tempo a resposta esperada não vem. */
function buildWarningPushBody(userName: string, unansweredHours: number): string {
  const name = userName || "A pessoa que você acompanha";
  return `${name} está sem responder aos alarmes há ${formatOfflineDuration(unansweredHours)}. Toque para ver os detalhes.`;
}

/**
 * Send a warning message to a single contact via WhatsApp.
 *
 * Returns whether the message was sent, and the error when it was not.
 */
async function sendToContact(
  contact: { name: string; phone: string; whatsapp?: boolean },
  message: string
): Promise<{ sent: boolean; error?: string }> {
  if (!isWhatsAppApiConfigured()) {
    return { sent: false, error: "WhatsApp Business API not configured" };
  }
  if (!contact.whatsapp || !contact.phone) {
    return { sent: false, error: "Contact has no WhatsApp number" };
  }

  const result = await sendWhatsAppMessage(contact.phone, message);
  if (result.success) {
    // No PII in logs: contact name/phone are personal data (LGPD). The masked
    // recipient + message id are already logged by sendWhatsAppMessage.
    console.log(`[Monitor] ✅ WhatsApp delivered to an emergency contact`);
    return { sent: true };
  }
  console.warn(`[Monitor] ⚠️ WhatsApp delivery failed for a contact:`, result.error);
  return { sent: false, error: result.error };
}

/** Open IDs of every caregiver actively linked to the monitored person. */
async function getLinkedCaregiverOpenIds(
  monitoredOpenId: string
): Promise<string[]> {
  const caregivers = await getActiveCaregiversForMonitored(monitoredOpenId);
  return caregivers.map((c) => c.caregiverOpenId);
}

/**
 * Deliver an in-app push alert to every device of the given caregivers.
 * Returns the number of pushes Expo accepted.
 *
 * Runs independently of the WhatsApp escalation: a monitored person may have a
 * linked caregiver but no emergency contacts (or vice-versa), and each channel
 * must reach its own recipients.
 */
async function sendPushToCaregivers(
  caregiverOpenIds: string[],
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<number> {
  if (caregiverOpenIds.length === 0) return 0;
  const tokens = await getPushTokensForOpenIds(caregiverOpenIds);
  // Mesmo motivo do aviso em routers-monitoring.ts: cuidador vinculado sem
  // token = escalação silenciosamente sem destino. Sem openId no log (LGPD).
  if (tokens.length === 0) {
    console.warn(
      `[Monitoring] escalação: ${caregiverOpenIds.length} cuidador(es) vinculado(s), 0 push tokens — push NÃO enviado.`
    );
    return 0;
  }
  return sendExpoPush(tokens.map((t) => t.token), { title, body, data });
}

/**
 * Determine the appropriate warning level based on offline hours.
 * Returns null if no warning should be sent yet.
 */
function getWarningLevel(unansweredHours: number): number | null {
  let level: number | null = null;
  for (const threshold of WARNING_LEVELS) {
    if (unansweredHours >= threshold.hours) {
      level = threshold.level;
    }
  }
  return level;
}

/**
 * Main monitoring job - called every 5 minutes by the scheduler.
 */
export async function runMonitoringJob(): Promise<void> {
  const now = new Date();
  jobHealth.lastRunAt = now.getTime();
  console.log(`[Monitor] Running monitoring job at ${now.toISOString()}`);

  // Cada passo roda isolado. Em 24/07/2026 uma query quebrada logo no início do
  // Passo 1 (account_liveness sem a coluna batteryExempt, da migração 0012 que
  // nunca foi aplicada) abortou o try único que envolvia os quatro e levou o job
  // inteiro junto — o dead man's switch ficou 27h desarmado.
  //
  // Isolar NÃO afrouxa o alarme: todo passo que falha entra em `failures`, e o
  // ciclo continua sendo contabilizado como falha no fim, então /api/health fica
  // unhealthy exatamente como antes. A diferença é que os passos sadios rodam.
  const failures: string[] = [];
  const recordFailure = (passo: string, error: unknown) => {
    failures.push(`${passo}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`[Monitor] ${passo} falhou:`, error);
  };

  try {
    // -- Step 1: Resolve expired pending alarm events --------------------------
    const expiredEvents = await getExpiredPendingEvents(GRACE_PERIOD_MINUTES);
    console.log(`[Monitor] Found ${expiredEvents.length} expired pending events`);

    // Agenda por conta, lida uma vez por execução: várias contas costumam ter
    // vários eventos vencidos no mesmo ciclo.
    const agendaPorConta = new Map<string, unknown>();
    const getAgenda = async (openId: string) => {
      if (!agendaPorConta.has(openId)) {
        agendaPorConta.set(openId, (await getUserData(openId))?.alarms);
      }
      return agendaPorConta.get(openId);
    };

    for (const event of expiredEvents) {
      // Isolado por evento: uma linha problemática não pode travar a resolução
      // de todas as outras. Esta é a fila que mantém o estado dos alarmes
      // andando — se ela congela, o switch morre para todo mundo, não só para
      // o dono do evento ruim.
      try {
        // O alarme foi desativado/apagado depois de pré-registrar este disparo?
        // Então ele não era esperado: apaga em vez de resolver. Sem isto o
        // evento órfão virava 'missed' e escalava para contatos e cuidadores.
        if (
          event.alarmId !== CHECKIN_ALARM_ID &&
          !isAlarmStillArmed(await getAgenda(event.openId), event.alarmId)
        ) {
          await deleteAlarmEvent(event.id);
          console.log(
            `[Monitor] Event ${event.id} (alarm ${event.alarmId}) -> apagado (alarme desativado ou removido pelo usuário)`
          );
          continue;
        }

        const liveness = await getAccountLiveness(event.openId);
        // Vida DEPOIS do horário do disparo. Sem sinal a partir de scheduledAt,
        // não há evidência de que o alarme sequer tocou (celular desligado, sem
        // bateria, sem conexão) → 'not_sent'. O critério antigo (heartbeat até
        // 30min ANTES do horário) classificava "desligou o celular 1min antes
        // do alarme" como 'missed' — e o cuidador recebia "não respondeu ao
        // alarme", que é falso.
        const accountOnline =
          liveness &&
          liveness.lastSeenAt.getTime() >= event.scheduledAt.getTime();

        if (!accountOnline) {
          await updateAlarmEventStatus(event.id, "not_sent");
          console.log(
            `[Monitor] Event ${event.id} (alarm ${event.alarmId}) -> not_sent (account offline)`
          );
        } else {
          await updateAlarmEventStatus(event.id, "missed");
          console.log(
            `[Monitor] Event ${event.id} (alarm ${event.alarmId}) -> missed (user didn't respond)`
          );
        }
      } catch (error) {
        recordFailure(`Passo 1 (evento ${event.id})`, error);
      }
    }
  } catch (error) {
    recordFailure("Passo 1 (resolver eventos vencidos)", error);
  }

  try {
    // -- Step 2: Escalation ladder over UNCONFIRMED EVENTS ----------------------
    // A escada é ancorada na idade do evento esperado que ficou sem resposta —
    // NÃO na ausência de heartbeat. O heartbeat só corre com o app em primeiro
    // plano, então ele media a coisa errada nos dois sentidos: quem responde ao
    // alarme e fecha o app ficava "offline" para sempre (ruído), e quem deixa o
    // app ABERTO sem responder nunca entrava na lista de inativos — a família
    // NUNCA era avisada (buraco). Um heartbeat de fundo não resolveria: o
    // WorkManager tem mínimo de 15min e o Doze pode não executá-lo, justamente
    // no cenário noturno em que o switch mais importa.
    //
    // O heartbeat segue vivo para o que ele de fato sustenta: classificar
    // missed vs not_sent no Passo 1 e mostrar "visto por último" ao cuidador.
    const accountsAtRisk = await getAccountsWithUnconfirmedEvents(EVENT_LOOKBACK_HOURS);
    console.log(`[Monitor] Found ${accountsAtRisk.length} accounts with unconfirmed events`);

    for (const account of accountsAtRisk) {
      // Idade do disparo mais antigo sem confirmação — os limiares (30min/2h/6h)
      // passam a contar a partir da hora em que a resposta era esperada.
      const unansweredHours =
        (now.getTime() - account.oldestUnconfirmedAt.getTime()) / (1000 * 60 * 60);

      const warningLevel = getWarningLevel(unansweredHours);
      if (warningLevel === null) continue;

      // Check if we already sent a warning at this level recently
      const warnings = await getWarningHistory(account.openId, 10);
      const recentWarningAtLevel = warnings.find(
        (w) =>
          w.level === warningLevel &&
          now.getTime() - w.sentAt.getTime() <
            MIN_WARNING_INTERVAL_HOURS * 60 * 60 * 1000
      );
      if (recentWarningAtLevel) {
        console.log(
          `[Monitor] Account ${account.openId}: level ${warningLevel} warning already sent recently, skipping`
        );
        continue;
      }

      // Escalation profile (name + consented contacts) from user_data
      const { userName, contacts } = await getAccountProfile(account.openId);
      const caregiverOpenIds = await getLinkedCaregiverOpenIds(account.openId);

      // Two independent recipient sets: WhatsApp reaches emergency contacts,
      // push reaches linked caregivers. Skip only when neither has anyone.
      if (contacts.length === 0 && caregiverOpenIds.length === 0) {
        console.log(
          `[Monitor] Account ${account.openId}: no consented contacts or caregivers, skipping`
        );
        continue;
      }

      // Build location URL if available (last fix stored on the liveness row).
      // A escada não depende mais da linha de liveness para decidir escalar, mas
      // a última localização conhecida ainda ajuda quem vai atrás da pessoa.
      let locationUrl: string | undefined;
      const liveness = await getAccountLiveness(account.openId);
      // parseLatLng (e não split(",")) porque esta URL entra no corpo da
      // mensagem enviada sob o remetente confiável do Vigora: qualquer texto
      // com vírgula virava link arbitrário. O heartbeat já saneia na entrada;
      // isto cobre as linhas gravadas ANTES desta correção.
      const coords = parseLatLng(liveness?.lastLocation);
      if (coords) {
        locationUrl = `https://maps.google.com/?q=${encodeURIComponent(coords)}`;
      }

      // Claim the warning slot BEFORE sending. A concurrent run that reads
      // warningHistory after this insert will see the row and skip its own send,
      // closing the TOCTOU window to a DB round-trip rather than the entire send loop.
      // The claim dedups both channels (WhatsApp + push) for this level.
      const claimId = await claimWarning({
        openId: account.openId,
        level: warningLevel,
        // A coluna se chama offlineHours por herança (a escada media ausência
        // de heartbeat); o valor agora é há quanto tempo a resposta esperada
        // não vem. Renomear a coluna exigiria migração sem ganho funcional.
        offlineHours: unansweredHours,
        locationIncluded: !!locationUrl,
      });

      const message = buildWarningMessage(
        userName,
        warningLevel,
        unansweredHours,
        locationUrl
      );

      console.log(
        `[Monitor] Sending level ${warningLevel} warning for account ${account.openId} (${unansweredHours}h sem resposta)`
      );
      console.log(`[Monitor] WhatsApp configured: ${isWhatsAppApiConfigured()}`);

      let totalSent = 0;
      let totalFailed = 0;

      for (const contact of contacts) {
        const result = await sendToContact(
          { name: contact.name, phone: contact.phone, whatsapp: contact.whatsapp },
          message
        );

        if (result.sent) {
          totalSent++;
        } else {
          totalFailed++;
          console.warn(`[Monitor] ❌ Could not reach a contact:`, result.error);
        }

        // Small delay between contacts
        await new Promise((r) => setTimeout(r, 500));
      }

      // In-app push to linked caregivers (real-time companion to WhatsApp).
      const pushTitle = buildWarningPushTitle(warningLevel);
      const pushBody = buildWarningPushBody(userName, unansweredHours);
      const pushed = await sendPushToCaregivers(caregiverOpenIds, pushTitle, pushBody, {
        type: "monitoring_warning",
        level: warningLevel,
        url: "/(caregiver-tabs)/alerts",
      });

      if (claimId !== null) {
        if (shouldRetryWarning(totalSent, pushed)) {
          // Reached NOBODY (WhatsApp + push both failed). Release the dedup
          // claim so the next run (~5 min) retries instead of this level going
          // silent for MIN_WARNING_INTERVAL_HOURS.
          await releaseWarning(claimId);
          console.error(
            `[Monitor] ⛔ Warning level ${warningLevel} for account ${account.openId} reached NOBODY (0 WhatsApp, 0 push) — claim released for retry next run`
          );
        } else {
          await updateWarningResult(claimId, totalSent, !!locationUrl);
        }
      }

      console.log(
        `[Monitor] Warning sent: ${totalSent} contacts reached via WhatsApp, ${totalFailed} failed; ${pushed} caregiver push(es) delivered`
      );
    }
  } catch (error) {
    recordFailure("Passo 2 (avisos de inatividade)", error);
  }

  try {
    // -- Step 3: Escalate missed check-in events --------------------------------
    // Scoped to 'checkin-daily' to avoid cascading on every missed medication alarm.
    // warningSent=false means the client did not handle escalation (device was offline).
    // Look back EVENT_LOOKBACK_HOURS so events that missed a job run still get caught.
    const missedCheckins = await getMissedCheckinEvents("checkin-daily", EVENT_LOOKBACK_HOURS);
    console.log(`[Monitor] Found ${missedCheckins.length} missed check-in events to escalate`);

    for (const event of missedCheckins) {
      const { userName, contacts } = await getAccountProfile(event.openId);
      const caregiverOpenIds = await getLinkedCaregiverOpenIds(event.openId);
      if (contacts.length === 0 && caregiverOpenIds.length === 0) {
        console.log(`[Monitor] Step 3: no consented contacts or caregivers for account ${event.openId}, skipping`);
        await markEventWarningSent(event.id);
        continue;
      }

      const name = userName || "O usuário do Vigora";
      const scheduledStr = formatEventTime(event.scheduledAt, event.timezone);
      const message =
        `⚠️ CHECK-IN NÃO RESPONDIDO - Vigora\n\n` +
        `${name} não respondeu ao check-in de saúde previsto para ${scheduledStr}.\n\n` +
        `Por favor, entre em contato para verificar se está tudo bem.\n\n` +
        `- Enviado automaticamente pelo Vigora`;

      console.log(`[Monitor] Step 3: escalating check-in for account ${event.openId}`);

      let totalSent = 0;
      for (const contact of contacts) {
        const result = await sendToContact(
          { name: contact.name, phone: contact.phone, whatsapp: contact.whatsapp },
          message
        );
        if (result.sent) totalSent++;
        await new Promise((r) => setTimeout(r, 500));
      }

      const pushed = await sendPushToCaregivers(
        caregiverOpenIds,
        "⚠️ Check-in não respondido — Vigora",
        `${name} não respondeu ao check-in das ${scheduledStr}. Toque para ver os detalhes.`,
        { type: "missed_checkin", url: "/(caregiver-tabs)/alerts" }
      );

      await markEventWarningSent(event.id);
      console.log(`[Monitor] Step 3: escalated check-in event ${event.id}, ${totalSent} contacts reached, ${pushed} caregiver push(es) delivered`);
    }
  } catch (error) {
    recordFailure("Passo 3 (check-ins perdidos)", error);
  }

  try {
    // -- Step 4: Escalate unanswered MEDICATION alarms (missed | not_sent) ------
    // Backstop do dead man's switch para quando a escalação no cliente não rodou
    // (app morreu logo após o disparo). warningSent=true é setado pelo cliente
    // quando ELE escala (confirmAlarmMissed), então aqui só caem os que ninguém
    // alertou. 'not_sent' (sem sinal de vida após o horário) também escala AQUI
    // — antes ficava só para a escada de inatividade do Passo 2 (30min+), e o
    // cuidador de um celular desligado esperava meia hora pelo primeiro aviso.
    // A cópia distingue: 'missed' = "não respondeu"; 'not_sent' = "não foi
    // entregue — celular pode estar desligado" (nunca acusar de não responder
    // um alarme que não tocou). Look-back 48h.
    const missedAlarms = await getMissedMedicationEvents("checkin-daily", EVENT_LOOKBACK_HOURS);
    console.log(`[Monitor] Found ${missedAlarms.length} unanswered medication alarms to escalate`);

    for (const event of missedAlarms) {
      const { userName, contacts } = await getAccountProfile(event.openId);
      const caregiverOpenIds = await getLinkedCaregiverOpenIds(event.openId);
      if (contacts.length === 0 && caregiverOpenIds.length === 0) {
        await markEventWarningSent(event.id);
        continue;
      }

      const name = userName || "O usuário do Vigora";
      const scheduledStr = formatEventTime(event.scheduledAt, event.timezone);
      const desc = event.alarmDescription || "alarme de medicamento";
      const notSent = event.status === "not_sent";
      const message = notSent
        ? `⚠️ ALARME NÃO ENTREGUE - Vigora\n\n` +
          `O alarme "${desc}" de ${name}, previsto para ${scheduledStr}, não pôde ser entregue — o celular pode estar desligado, sem bateria ou sem conexão.\n\n` +
          `Por favor, entre em contato para verificar se está tudo bem.\n\n` +
          `- Enviado automaticamente pelo Vigora`
        : `⚠️ ALARME NÃO RESPONDIDO - Vigora\n\n` +
          `${name} não confirmou o alarme "${desc}" previsto para ${scheduledStr}.\n\n` +
          `Por favor, entre em contato para verificar se está tudo bem.\n\n` +
          `- Enviado automaticamente pelo Vigora`;

      let totalSent = 0;
      for (const contact of contacts) {
        const result = await sendToContact(
          { name: contact.name, phone: contact.phone, whatsapp: contact.whatsapp },
          message
        );
        if (result.sent) totalSent++;
        await new Promise((r) => setTimeout(r, 500));
      }

      const pushed = await sendPushToCaregivers(
        caregiverOpenIds,
        notSent ? "⚠️ Alarme não entregue — Vigora" : "⚠️ Alarme não respondido — Vigora",
        notSent
          ? `O celular de ${name} pode estar desligado ou sem conexão — o alarme das ${scheduledStr} não foi entregue. Toque para ver os detalhes.`
          : `${name} não respondeu ao alarme das ${scheduledStr}. Toque para ver os detalhes.`,
        { type: "missed_alarm", url: "/(caregiver-tabs)/alerts" }
      );

      await markEventWarningSent(event.id);
      console.log(`[Monitor] Step 4: escalated ${event.status} alarm ${event.id}, ${totalSent} contacts reached, ${pushed} caregiver push(es) delivered`);
    }
  } catch (error) {
    recordFailure("Passo 4 (alarmes de medicação perdidos)", error);
  }

  if (failures.length === 0) {
    jobHealth.lastSuccessAt = Date.now();
    jobHealth.consecutiveFailures = 0;
    jobHealth.lastError = null;
    console.log(`[Monitor] Job completed successfully`);
    return;
  }

  // Um passo isolado que falhou ainda reprova o ciclo inteiro: sem isto,
  // trocaríamos uma falha barulhenta por uma silenciosa e /api/health seguiria
  // verde com o switch parcialmente morto.
  jobHealth.consecutiveFailures += 1;
  jobHealth.lastError = failures.join(" | ");
  console.error(
    `[Monitor] Job failed (${jobHealth.consecutiveFailures} consecutive): ${jobHealth.lastError}`
  );
  if (jobHealth.consecutiveFailures > MAX_HEALTHY_FAILURES) {
    console.error(
      `[Monitor] 🚨 Dead man's switch job failed ${jobHealth.consecutiveFailures}x in a row — /api/health is now reporting UNHEALTHY. Investigate the monitoring scheduler/DB immediately.`
    );
  }
}

/**
 * Start the monitoring job scheduler.
 * Runs every 5 minutes.
 */
export function startMonitoringScheduler(): void {
  const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  console.log("[Monitor] Starting monitoring scheduler (every 5 minutes)");

  // Run immediately on startup
  runMonitoringJob().catch(console.error);

  // Then run every 5 minutes
  setInterval(() => {
    runMonitoringJob().catch(console.error);
  }, INTERVAL_MS);

  // Data retention purge (LGPD minimization): daily, plus once on startup.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const runPurge = () =>
    purgeStaleData()
      .then((r) =>
        console.log(
          `[Monitor] Retention purge: ${r.alarmEvents} alarm events, ${r.warningLog} warnings, ${r.locationsCleared} stale locations cleared`
        )
      )
      // Contas anônimas abandonadas param de "existir" para o switch (e para a
      // base — LGPD). Encadeado após o purge principal, mesma cadência diária.
      .then(() => purgeAbandonedAnonymousAccounts())
      .then((n) => {
        if (n > 0) console.log(`[Monitor] Purged ${n} abandoned anonymous account(s)`);
      })
      .catch((e) => console.error("[Monitor] Retention purge failed:", e));
  runPurge();
  const purgeTimer = setInterval(runPurge, DAY_MS);
  if (typeof purgeTimer.unref === "function") purgeTimer.unref();
}
