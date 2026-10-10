/**
 * routers-managed-alarms.ts
 *
 * O modo gerenciado: um cuidador cuida dos alarmes do idoso, com o
 * consentimento dele. Este arquivo tem (1) o ACORDO — pedir, cancelar, aceitar,
 * recusar, parar — e (2) a LISTA gerenciada (criar/editar/apagar/ack, acrescentada
 * na Tarefa 7). Spec: docs/superpowers/specs/2026-10-06-fase-4-cuidador-gerencia-alarmes-design.md.
 *
 * AUTORIZAÇÃO (o que os testes de IDOR travam):
 *  - Rotas do cuidador: o chamador precisa ser userType "caregiver" COM vínculo
 *    ativo. O idoso alvo vem do vínculo (getActiveLinkForCaregiver), NUNCA do
 *    input — nenhuma rota de cuidador recebe `monitoredOpenId`.
 *  - Rotas do idoso: userType diferente de "caregiver". O acordo é sempre o do
 *    openId do chamador; um `requestId` do cliente só vale se for o pedido aberto
 *    DESTE idoso (de outra conta = NOT_FOUND).
 *  - Só o cuidador que PEDIU mexe no pedido/acordo; outro cuidador vinculado é
 *    FORBIDDEN.
 *
 * Push nunca segura a resposta (void ….catch) e nunca leva nome de remédio.
 * Logs de erro só com nome+código: a mensagem de um erro do drizzle traz os
 * parâmetros da query (openId, nome do lembrete).
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MANAGEMENT_REQUEST_TTL_DAYS, type ManagedAlarm } from "../shared/managed-alarm.js";
import { pickPersonName } from "./_core/alarm-diff";
import { sanitizeAcceptedList } from "./_core/managed-alarm-schema";
import { protectedProcedure, router } from "./_core/trpc";
import { getUserByOpenId, getUserData } from "./db";
import {
  activateManagement,
  createManagementRequest,
  endManagement,
  getActiveManagementForMonitored,
  getOpenManagementForMonitored,
} from "./db-alarm-management";
import { getActiveCaregiversForMonitored, getActiveLinkForCaregiver } from "./db-links";
import { getManagedList } from "./db-managed-alarm-list";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoPush } from "./push";
import type { User } from "../drizzle/schema";

// --- Utilitários locais --------------------------------------------------------------

/** Só campos seguros no log (a mensagem de um erro de banco traz os parâmetros). */
function safeErr(err: unknown): string {
  const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
  return `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim();
}

/** Rate limit por usuário, em memória do processo (mesmo padrão de routers-links). */
function makeRateLimiter(windowMs: number, limit: number) {
  const buckets = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (buckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
    if (recent.length >= limit) {
      buckets.set(key, recent);
      return true;
    }
    recent.push(now);
    buckets.set(key, recent);
    return false;
  };
}

const isRequestRateLimited = makeRateLimiter(60_000, 5);

/** Nome do cuidador nos textos de push. */
function caregiverNameOf(user: { name?: string | null } | null | undefined): string {
  return user?.name?.trim() || "Seu cuidador";
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface VisiblePush {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/**
 * Notificação visível para as contas dadas. Fire-and-forget: o fetch da Expo não
 * tem timeout e não pode segurar a resposta nem desfazer o acordo.
 */
function firePush(openIds: string[], message: VisiblePush): void {
  void (async () => {
    const tokens = await getPushTokensForOpenIds(openIds);
    if (tokens.length === 0) return;
    await sendExpoPush(
      tokens.map((t) => t.token),
      message
    );
  })().catch((err) => {
    console.warn("[ManagedAlarms] push falhou:", safeErr(err));
  });
}

// --- Autorização ---------------------------------------------------------------------

/** O chamador é cuidador COM vínculo ativo; devolve o vínculo (o idoso vem dele). */
async function requireCaregiverLink(user: User) {
  if (user.userType !== "caregiver") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas um cuidador pode usar esta função." });
  }
  const link = await getActiveLinkForCaregiver(user.openId);
  if (!link) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Você não está vinculado a nenhuma pessoa monitorada.",
    });
  }
  return link;
}

/** O chamador é a pessoa monitorada (qualquer conta que não seja de cuidador). */
function requireMonitored(user: User): void {
  if (user.userType === "caregiver") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Apenas a pessoa monitorada pode usar esta função.",
    });
  }
}

/**
 * Acordo aberto (pendente ou ativo) do idoso. Se existir e não for deste
 * cuidador, FORBIDDEN: outro cuidador vinculado não mexe no pedido do colega.
 * Sem acordo aberto devolve null.
 */
async function getMyOpenAgreement(user: User, monitoredOpenId: string) {
  const open = await getOpenManagementForMonitored(monitoredOpenId);
  if (open && open.caregiverOpenId !== user.openId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Quem cuida dos alarmes desta pessoa é outro cuidador.",
    });
  }
  return open;
}

export interface MineResponse {
  pendingRequest: { id: number; caregiverName: string } | null;
  management: { id: number; caregiverOpenId: string; caregiverName: string; since: number } | null;
  list: { version: number; alarms: ManagedAlarm[] } | null;
}

const NO_AGREEMENT: MineResponse = { pendingRequest: null, management: null, list: null };

export const managedAlarmsRouter = router({
  // =================== CUIDADOR ===================

  /**
   * Cuidador: o acordo (se houver) do idoso do vínculo e, com acordo ativo, a
   * lista gerenciada com o estado de entrega. Outro cuidador vinculado também
   * vê (só leitura, `isMine: false`).
   */
  forCaregiver: protectedProcedure.query(async ({ ctx }) => {
    const link = await requireCaregiverLink(ctx.user);
    const monitoredOpenId = link.monitoredOpenId;
    const [open, data, monitored] = await Promise.all([
      getOpenManagementForMonitored(monitoredOpenId),
      getUserData(monitoredOpenId),
      getUserByOpenId(monitoredOpenId),
    ]);
    const monitoredName = pickPersonName(data?.anamnesis, monitored?.name);
    if (!open) {
      return { monitoredOpenId, monitoredName, management: null, list: null };
    }

    const isMine = open.caregiverOpenId === ctx.user.openId;
    const manager = isMine ? ctx.user : await getUserByOpenId(open.caregiverOpenId);
    const status = open.status === "active" ? ("active" as const) : ("pending" as const);
    const management = {
      id: open.id,
      status,
      caregiverOpenId: open.caregiverOpenId,
      isMine,
      managerName: manager?.name?.trim() || null,
      requestedAt: open.requestedAt.getTime(),
      respondedAt: open.respondedAt ? open.respondedAt.getTime() : null,
      expiresAt: status === "pending" ? open.requestedAt.getTime() + MANAGEMENT_REQUEST_TTL_DAYS * DAY_MS : null,
    };

    let list: {
      version: number;
      alarms: ManagedAlarm[];
      appliedVersion: number;
      failedAlarmIds: string[];
      appliedAt: number | null;
      updatedAt: number;
    } | null = null;
    if (status === "active") {
      const row = await getManagedList(monitoredOpenId);
      if (row) {
        list = {
          version: row.version,
          alarms: row.alarms as ManagedAlarm[],
          appliedVersion: row.appliedVersion,
          failedAlarmIds: row.failedAlarmIds as string[],
          appliedAt: row.appliedAt ? row.appliedAt.getTime() : null,
          updatedAt: row.updatedAt.getTime(),
        };
      }
    }
    return { monitoredOpenId, monitoredName, management, list };
  }),

  /** Cuidador: pede para cuidar dos alarmes do idoso do vínculo. */
  request: protectedProcedure.mutation(async ({ ctx }) => {
    const link = await requireCaregiverLink(ctx.user);
    if (isRequestRateLimited(ctx.user.openId)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Muitos pedidos em pouco tempo. Aguarde um instante.",
      });
    }
    if (await getOpenManagementForMonitored(link.monitoredOpenId)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Já existe um pedido ou acordo para esta pessoa.",
      });
    }
    const row = await createManagementRequest(ctx.user.openId, link.monitoredOpenId);
    firePush([link.monitoredOpenId], {
      title: `Pedido de ${caregiverNameOf(ctx.user)}`,
      body: "Toque para ver",
      data: { type: "management_request" },
    });
    return { id: row.id, status: "pending" as const };
  }),

  /** Cuidador: cancela o pedido que ele mesmo fez e ainda não foi respondido. */
  cancelRequest: protectedProcedure.mutation(async ({ ctx }) => {
    const link = await requireCaregiverLink(ctx.user);
    const open = await getMyOpenAgreement(ctx.user, link.monitoredOpenId);
    if (!open) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Não há pedido aberto." });
    }
    if (open.status !== "pending") {
      throw new TRPCError({ code: "CONFLICT", message: "O pedido já foi respondido." });
    }
    await endManagement(open.id, "cancelled");
    return { success: true } as const;
  }),

  /** Cuidador: para de cuidar dos alarmes (acordo ativo, o dele). O idoso é avisado. */
  stopManaging: protectedProcedure.mutation(async ({ ctx }) => {
    const link = await requireCaregiverLink(ctx.user);
    const open = await getMyOpenAgreement(ctx.user, link.monitoredOpenId);
    if (!open) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Não há acordo ativo." });
    }
    if (open.status !== "active") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "O pedido ainda não foi aceito. Cancele o pedido em vez de parar.",
      });
    }
    await endManagement(open.id, "stopped_by_caregiver");
    firePush([link.monitoredOpenId], {
      title: "Alarmes",
      body: `${caregiverNameOf(ctx.user)} parou de cuidar dos seus alarmes.`,
      data: { type: "management_ended" },
    });
    return { success: true } as const;
  }),

  // =================== IDOSO ===================

  /**
   * Idoso: o pedido pendente (para o diálogo), o acordo ativo (para o cartão e
   * as listas só leitura) e a lista gerenciada. Se o cuidador do acordo já não
   * está vinculado, encerra o acordo na hora (`unlinked`) em vez de deixar as
   * listas do idoso travadas.
   */
  mine: protectedProcedure.query(async ({ ctx }): Promise<MineResponse> => {
    requireMonitored(ctx.user);
    const openId = ctx.user.openId;
    const open = await getOpenManagementForMonitored(openId);
    if (!open) return NO_AGREEMENT;

    const caregivers = await getActiveCaregiversForMonitored(openId);
    if (!caregivers.some((c) => c.caregiverOpenId === open.caregiverOpenId)) {
      await endManagement(open.id, "unlinked");
      return NO_AGREEMENT;
    }

    const caregiverName = caregiverNameOf(await getUserByOpenId(open.caregiverOpenId));
    if (open.status === "pending") {
      return { pendingRequest: { id: open.id, caregiverName }, management: null, list: null };
    }
    const row = await getManagedList(openId);
    return {
      pendingRequest: null,
      management: {
        id: open.id,
        caregiverOpenId: open.caregiverOpenId,
        caregiverName,
        since: (open.respondedAt ?? open.requestedAt).getTime(),
      },
      list: row ? { version: row.version, alarms: row.alarms as ManagedAlarm[] } : null,
    };
  }),

  /**
   * Idoso: responde ao pedido. Aceite manda a LISTA ATUAL do aparelho (vira a
   * versão 1 já confirmada); nada some, nada é recriado. Recusa encerra com
   * `declined`. Lista ilegível recusa o aceite sem ativar nada.
   */
  respond: protectedProcedure
    .input(
      z.object({
        requestId: z.number().int().positive(),
        accept: z.boolean(),
        alarms: z.array(z.unknown()).max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireMonitored(ctx.user);
      const openId = ctx.user.openId;

      // requestId vem do cliente: só vale se for o pedido aberto DESTE idoso.
      const open = await getOpenManagementForMonitored(openId);
      if (!open || open.id !== input.requestId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Este pedido não existe mais." });
      }
      if (open.status !== "pending") {
        throw new TRPCError({ code: "CONFLICT", message: "Este pedido já foi respondido." });
      }
      const caregivers = await getActiveCaregiversForMonitored(openId);
      if (!caregivers.some((c) => c.caregiverOpenId === open.caregiverOpenId)) {
        await endManagement(open.id, "unlinked");
        throw new TRPCError({ code: "NOT_FOUND", message: "Este pedido não existe mais." });
      }

      const monitoredName = pickPersonName((await getUserData(openId))?.anamnesis, ctx.user.name);

      if (!input.accept) {
        await endManagement(open.id, "declined");
        firePush([open.caregiverOpenId], {
          title: "Alarmes",
          body: `${monitoredName} preferiu continuar cuidando dos próprios alarmes.`,
          data: { type: "management_declined" },
        });
        return { success: true, accepted: false } as const;
      }

      if (!Array.isArray(input.alarms)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível ler seus alarmes." });
      }
      const list = sanitizeAcceptedList(input.alarms);
      await activateManagement(open.id, list, openId);

      firePush([open.caregiverOpenId], {
        title: "Alarmes",
        body: `${monitoredName} aceitou. Agora você cuida dos alarmes de ${monitoredName}.`,
        data: { type: "management_accepted", url: "/(caregiver-tabs)/managed-alarms" },
      });
      const others = caregivers
        .map((c) => c.caregiverOpenId)
        .filter((id) => id !== open.caregiverOpenId);
      if (others.length > 0) {
        const manager = await getUserByOpenId(open.caregiverOpenId);
        firePush(others, {
          title: "Alarmes",
          body: `${caregiverNameOf(manager)} passou a cuidar dos alarmes de ${monitoredName}.`,
          data: { type: "management_changed" },
        });
      }
      return { success: true, accepted: true } as const;
    }),

  /** Idoso: para o modo gerenciado (Configurações → "Parar"). O cuidador é avisado. */
  stopBeingManaged: protectedProcedure.mutation(async ({ ctx }) => {
    requireMonitored(ctx.user);
    const active = await getActiveManagementForMonitored(ctx.user.openId);
    if (!active) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum acordo ativo." });
    }
    await endManagement(active.id, "stopped_by_monitored");
    const monitoredName = pickPersonName((await getUserData(ctx.user.openId))?.anamnesis, ctx.user.name);
    firePush([active.caregiverOpenId], {
      title: "Alarmes",
      body: `${monitoredName} voltou a cuidar dos próprios alarmes.`,
      data: { type: "management_ended" },
    });
    return { success: true } as const;
  }),
});
