/**
 * managed-alarms-housekeeping.ts
 *
 * Manutenção do acordo de gerenciamento de alarmes (Fase 4), a cada rodada do
 * monitoring-job (5 min):
 *
 *  1. Pedido `pending` há mais de 7 dias vence (`expired`) e o cuidador é avisado.
 *     Só encerra o que ainda é o pedido aberto do idoso: se ele aceitou entre a
 *     consulta e o encerramento, o acordo ativo não é tocado.
 *  2. Notificação visível de reserva (D7): o cuidador gravou a lista, o servidor
 *     mandou o push silencioso e, 10 min depois, o celular do idoso ainda não
 *     confirmou. Manda "Abra o Vigora para as mudanças valerem". Sem nome de
 *     remédio, e uma só vez por versão (`visibleNoticeSentForVersion`).
 *
 * O servidor nunca faz o alarme tocar: esta notificação só convida o idoso a
 * abrir o app, que é quem aplica e confirma a lista.
 */
import { pickPersonName } from "./_core/alarm-diff";
import { runEach, runSteps } from "./_core/job-isolation";
import { getUserByOpenId, getUserData } from "./db";
import {
  endManagement,
  getExpiredManagementRequests,
  getOpenManagementForMonitored,
} from "./db-alarm-management";
import { getListsNeedingVisibleNotice, markVisibleNoticeSent } from "./db-managed-alarm-list";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoPush } from "./push";

export type HousekeepingResult = { expired: number; visibleNotices: number };

/** Mesmo nome que o resto do servidor usa para o idoso nos avisos ao cuidador. */
async function monitoredName(openId: string): Promise<string> {
  const [data, user] = await Promise.all([getUserData(openId), getUserByOpenId(openId)]);
  return pickPersonName(data?.anamnesis, user?.name);
}

async function expireRequests(now: Date, result: HousekeepingResult): Promise<void> {
  const expired = await getExpiredManagementRequests(now);
  const failed = await runEach(expired, "Pedido de gerenciamento vencido", async (request) => {
    const open = await getOpenManagementForMonitored(request.monitoredOpenId);
    if (!open || open.id !== request.id || open.status !== "pending") return;

    await endManagement(request.id, "expired");
    result.expired++;

    const tokens = await getPushTokensForOpenIds([request.caregiverOpenId]);
    if (tokens.length === 0) return;
    const name = await monitoredName(request.monitoredOpenId);
    await sendExpoPush(
      tokens.map((t) => t.token),
      {
        title: "Alarmes",
        body: `O pedido para cuidar dos alarmes de ${name} venceu.`,
        data: { type: "management_expired" },
      }
    );
  });
  if (failed > 0) throw new Error("pedidos falharam");
}

async function sendVisibleNotices(now: Date, result: HousekeepingResult): Promise<void> {
  const lists = await getListsNeedingVisibleNotice(now);
  const failed = await runEach(lists, "Aviso visível de alarmes atualizados", async (list) => {
    const tokens = await getPushTokensForOpenIds([list.monitoredOpenId]);
    if (tokens.length > 0) {
      const author = (await getUserByOpenId(list.updatedByOpenId))?.name?.trim() || "Seu cuidador";
      const accepted = await sendExpoPush(
        tokens.map((t) => t.token),
        {
          title: "Alarmes atualizados",
          body: `${author} atualizou seus alarmes. Abra o Vigora para as mudanças valerem.`,
          data: { type: "managed_alarms_updated", version: list.version },
        }
      );
      // A Expo recusou: não marca, a rodada seguinte tenta de novo.
      if (accepted === 0) {
        console.warn("[Acordo] aviso visível não foi aceito pela Expo — tenta de novo na próxima rodada");
        return;
      }
      result.visibleNotices++;
    }
    // Sem token nenhum (app antigo) não há o que reenviar: marca e segue.
    await markVisibleNoticeSent(list.monitoredOpenId, list.version);
  });
  if (failed > 0) throw new Error("avisos falharam");
}

export async function runManagementHousekeeping(now: Date): Promise<HousekeepingResult> {
  const result: HousekeepingResult = { expired: 0, visibleNotices: 0 };
  await runSteps("Manutenção do acordo", [
    ["pedidos vencidos", () => expireRequests(now, result)],
    ["aviso visível", () => sendVisibleNotices(now, result)],
  ]);
  return result;
}
