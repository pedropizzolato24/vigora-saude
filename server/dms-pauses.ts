/**
 * dms-pauses.ts
 *
 * Pausas do dead man's switch (Fase 4, D9). Não existe aviso de desinstalação no
 * Android nem no iOS; sem pausa, a família seria avisada todo dia, para sempre,
 * sobre um celular abandonado. Três motivos pausam uma conta:
 *  - logged_out: o app avisa no logout (monitoring.deviceSignedOut, Tarefa 8);
 *  - app_removed: a verificação diária (ping silencioso) encontrou
 *    DeviceNotRegistered no ticket ou no recibo E a conta ficou sem nenhum token.
 *    Conta de app antigo, que nunca registrou token, não é pingada nem pausada;
 *  - no_signal: 48 h sem nenhum sinal do aparelho.
 *
 * Pausar apaga só os eventos pendentes FUTUROS (ver pauseDms) e cada cuidador
 * vinculado recebe UM aviso por pausa. Qualquer sinal do aparelho retoma (ver
 * touchLiveness / recordHeartbeat em db-monitoring.ts).
 *
 * O servidor nunca faz o alarme tocar nem manda mensagem ao idoso.
 */
import { pickPersonName } from "./_core/alarm-diff";
import { runEach, runSteps } from "./_core/job-isolation";
import { getUserByOpenId, getUserData } from "./db";
import { getActiveCaregiversForMonitored } from "./db-links";
import {
  type DmsPauseReason,
  getAccountLiveness,
  getPausesNeedingNotice,
  getPreRegisterCandidates,
  getStaleUnpausedMonitoredAccounts,
  markPauseNoticeSent,
  pauseDms,
} from "./db-monitoring";
import {
  countPushTokens,
  deletePushToken,
  getPushTokensForOpenIds,
  getPushTokensWithOwner,
} from "./db-push";
import { fetchExpoReceipts, sendExpoDataPush, sendExpoPush } from "./push";

/** Conta parada há mais que isto pausa sem avisar o cuidador (instalação abandonada). */
const SILENT_PAUSE_AFTER_DAYS = 7;

export const PAUSE_NOTICE_TITLE = "Avisos pausados — Vigora";
const PAUSE_NOTICE_ROUTE = "/(caregiver-tabs)/person";

const DAY_MS = 24 * 60 * 60 * 1000;
/** O Expo guarda os recibos por 24 h; passou disso o ticket é descartado. */
const TICKET_TTL_MS = DAY_MS;
/** Limite de ids por consulta de recibos (o Expo aceita 1000). */
const RECEIPT_BATCH = 300;

export type DmsPausesResult = { paused: number; noticesSent: number; pinged: number };

// Estado em memória do processo. Perdê-lo num deploy só atrasa a verificação em
// um dia (o ping recomeça) e descarta recibos pendentes.
let lastPingAt = 0;
const pendingTickets = new Map<string, { token: string; openId: string; sentAt: number }>();

export const __testing = {
  reset() {
    lastPingAt = 0;
    pendingTickets.clear();
  },
};

/** Textos exatos da spec 5.5. Sem nome de remédio nem dado de saúde. */
export function buildPauseNoticeBody(reason: DmsPauseReason, name: string): string {
  switch (reason) {
    case "logged_out":
      return `${name} saiu da conta do Vigora no celular. Os avisos automáticos estão pausados até ${name} entrar de novo.`;
    case "app_removed":
      return `O Vigora parece ter sido removido do celular de ${name}. Os avisos automáticos estão pausados.`;
    case "no_signal":
      return `O celular de ${name} não dá sinal há 2 dias. Os avisos automáticos estão pausados até ele voltar a se comunicar.`;
  }
}

/**
 * Token que o Expo disse estar morto: apaga e, se a conta ficou SEM nenhum
 * token, pausa como app removido. Quem reinstalou tem um token novo (não pausa).
 */
async function handleDeadToken(token: string, openId: string): Promise<boolean> {
  await deletePushToken(token);
  if ((await countPushTokens(openId)) > 0) return false;
  return pauseDms(openId, "app_removed");
}

async function checkReceipts(now: Date, result: DmsPausesResult): Promise<void> {
  for (const [id, ticket] of pendingTickets) {
    if (now.getTime() - ticket.sentAt > TICKET_TTL_MS) pendingTickets.delete(id);
  }
  const ids = [...pendingTickets.keys()];
  let failed = 0;
  for (let i = 0; i < ids.length; i += RECEIPT_BATCH) {
    const batch = ids.slice(i, i + RECEIPT_BATCH);
    const receipts = await fetchExpoReceipts(batch);
    // Recibo que ainda não saiu fica na fila para a rodada seguinte.
    const answered = batch.filter((id) => receipts[id]);
    failed += await runEach(answered, "Recibo da verificação diária", async (id) => {
      const ticket = pendingTickets.get(id);
      pendingTickets.delete(id);
      const receipt = receipts[id];
      if (!ticket || receipt.status !== "error") return;
      if (receipt.details?.error === "DeviceNotRegistered") {
        if (await handleDeadToken(ticket.token, ticket.openId)) result.paused++;
      }
    });
  }
  if (failed > 0) throw new Error("recibos falharam");
}

async function pingDevices(now: Date, result: DmsPausesResult): Promise<void> {
  if (now.getTime() - lastPingAt < DAY_MS) return;

  // Mesma população do pré-registro: idoso não pausado e com sinal recente.
  const candidates = await getPreRegisterCandidates(now);
  const tokens = await getPushTokensWithOwner(candidates.map((c) => c.openId));
  lastPingAt = now.getTime();
  if (tokens.length === 0) return;

  const ownerOf = new Map(tokens.map((t) => [t.token, t.openId]));
  const sent = await sendExpoDataPush(
    tokens.map((t) => t.token),
    { type: "ping" }
  );
  const failed = await runEach(sent, "Verificação diária do aparelho", async (r) => {
    const openId = ownerOf.get(r.token);
    if (!openId) return;
    if (r.deviceNotRegistered) {
      if (await handleDeadToken(r.token, openId)) result.paused++;
    } else if (r.ticketId) {
      pendingTickets.set(r.ticketId, { token: r.token, openId, sentAt: now.getTime() });
      result.pinged++;
    }
  });
  if (failed > 0) throw new Error("verificação falhou");
}

async function pauseSilentAccounts(now: Date, result: DmsPausesResult): Promise<void> {
  const stale = await getStaleUnpausedMonitoredAccounts(now);
  const silentBefore = now.getTime() - SILENT_PAUSE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const failed = await runEach(stale, "Pausa por falta de sinal", async (openId) => {
    if (!(await pauseDms(openId, "no_signal"))) return;
    result.paused++;
    // Instalação abandonada há mais de 7 dias: pausa sem avisar o cuidador
    // (o aviso fica marcado como enviado e a rotina de avisos não a pega).
    const liveness = await getAccountLiveness(openId);
    if (liveness && liveness.lastSeenAt.getTime() < silentBefore) {
      await markPauseNoticeSent(openId);
    }
  });
  if (failed > 0) throw new Error("contas falharam");
}

async function sendPauseNotices(result: DmsPausesResult): Promise<void> {
  const pending = await getPausesNeedingNotice();
  const failed = await runEach(pending, "Aviso de pausa", async ({ openId, reason }) => {
    const caregivers = await getActiveCaregiversForMonitored(openId);
    const tokens =
      caregivers.length > 0
        ? await getPushTokensForOpenIds(caregivers.map((c) => c.caregiverOpenId))
        : [];
    // Sem cuidador ou cuidador sem nenhum aparelho: não há a quem avisar —
    // marca como avisado para não tentar a cada rodada para sempre.
    if (tokens.length > 0) {
      const [data, user] = await Promise.all([getUserData(openId), getUserByOpenId(openId)]);
      const accepted = await sendExpoPush(
        tokens.map((t) => t.token),
        {
          title: PAUSE_NOTICE_TITLE,
          body: buildPauseNoticeBody(reason, pickPersonName(data?.anamnesis, user?.name)),
          data: { type: "dms_paused", url: PAUSE_NOTICE_ROUTE },
        }
      );
      // Expo recusou todos: NÃO marca. Cuidador que acha que o switch está armado
      // é pior que um aviso repetido na rodada seguinte.
      if (accepted === 0) {
        console.warn("[Pausas] aviso de pausa não chegou a nenhum cuidador — tenta de novo na próxima rodada");
        return;
      }
      result.noticesSent++;
    }
    await markPauseNoticeSent(openId);
  });
  if (failed > 0) throw new Error("avisos falharam");
}

export async function runDmsPauses(now: Date): Promise<DmsPausesResult> {
  const result: DmsPausesResult = { paused: 0, noticesSent: 0, pinged: 0 };
  // Ordem: recibos e ping podem pausar (app_removed); depois a pausa por 48 h;
  // os avisos vêm por último para sair na mesma rodada em que a pausa nasceu.
  // Cada passo falha isolado; a rotina rejeita no fim, sem o texto dos erros.
  await runSteps("Pausas", [
    ["recibos", () => checkReceipts(now, result)],
    ["verificação diária", () => pingDevices(now, result)],
    ["sem sinal", () => pauseSilentAccounts(now, result)],
    ["avisos", () => sendPauseNotices(result)],
  ]);
  return result;
}
