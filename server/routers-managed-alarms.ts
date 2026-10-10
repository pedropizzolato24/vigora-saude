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
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MANAGED_ALARMS_MAX,
  MANAGEMENT_REQUEST_TTL_DAYS,
  type ManagedAlarm,
} from "../shared/managed-alarm.js";
import { diffAlarms, pickPersonName, type AlarmChange } from "./_core/alarm-diff";
import {
  managedAlarmInputSchema,
  normalizeManagedAlarm,
  sanitizeAcceptedList,
} from "./_core/managed-alarm-schema";
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
import { recordCaregiverAlarmChanges } from "./alarm-changes";
import {
  ManagedListConflictError,
  getManagedList,
  recordManagedAck,
  writeManagedList,
} from "./db-managed-alarm-list";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoDataPush, sendExpoPush } from "./push";
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

/** 30 gravações por minuto por cuidador (spec 4.2). */
const isWriteRateLimited = makeRateLimiter(60_000, 30);

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

/**
 * Para gravar a lista: existe acordo ATIVO do idoso do vínculo E o gerente é
 * este cuidador. Qualquer outra situação (sem acordo, pendente, encerrado, de
 * outro cuidador) é FORBIDDEN, como pede a spec 4.2.
 */
async function requireMyActiveAgreement(user: User, monitoredOpenId: string) {
  const open = await getOpenManagementForMonitored(monitoredOpenId);
  if (!open || open.status !== "active" || open.caregiverOpenId !== user.openId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Você não cuida dos alarmes desta pessoa.",
    });
  }
  return open;
}

const STALE_LIST_MESSAGE = "A lista mudou. Confira de novo.";

/**
 * Lê a lista do idoso e confere a versão que o cuidador estava vendo. O
 * `UPDATE … WHERE version = baseVersion` do banco (commitList) cobre a corrida
 * entre a leitura e a gravação.
 */
async function loadListForWrite(monitoredOpenId: string, baseVersion: number): Promise<ManagedAlarm[]> {
  const row = await getManagedList(monitoredOpenId);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Não encontramos os alarmes desta pessoa." });
  }
  if (row.version !== baseVersion) {
    throw new TRPCError({ code: "CONFLICT", message: STALE_LIST_MESSAGE });
  }
  return row.alarms as ManagedAlarm[];
}

/**
 * Grava a lista nova e dispara o que vem depois SEM segurar a resposta: o push
 * silencioso ao idoso (só tipo e versão — nenhum alarme viaja no push) e o
 * registro da mudança com o cuidador como autor (que avisa os OUTROS cuidadores).
 */
async function commitList(args: {
  caregiver: User;
  monitoredOpenId: string;
  baseVersion: number;
  next: ManagedAlarm[];
  changes: AlarmChange[];
}): Promise<{ version: number }> {
  let version: number;
  try {
    version = await writeManagedList(args.monitoredOpenId, args.baseVersion, args.next, args.caregiver.openId);
  } catch (err) {
    if (err instanceof ManagedListConflictError) {
      throw new TRPCError({ code: "CONFLICT", message: STALE_LIST_MESSAGE });
    }
    throw err;
  }

  void (async () => {
    const tokens = await getPushTokensForOpenIds([args.monitoredOpenId]);
    if (tokens.length === 0) return;
    // Não apaga token com DeviceNotRegistered aqui: quem decide "app removido"
    // é a verificação diária (Tarefa 10), que também olha os recibos.
    await sendExpoDataPush(
      tokens.map((t) => t.token),
      { type: "managed_alarms_updated", version }
    );
  })().catch((err) => {
    console.warn("[ManagedAlarms] push silencioso falhou:", safeErr(err));
  });

  if (args.changes.length > 0) {
    void (async () => {
      const [data, monitored] = await Promise.all([
        getUserData(args.monitoredOpenId),
        getUserByOpenId(args.monitoredOpenId),
      ]);
      await recordCaregiverAlarmChanges({
        monitoredOpenId: args.monitoredOpenId,
        authorOpenId: args.caregiver.openId,
        authorName: caregiverNameOf(args.caregiver),
        personName: pickPersonName(data?.anamnesis, monitored?.name),
        changes: args.changes,
      });
    })().catch((err) => {
      console.warn("[ManagedAlarms] registro da mudança falhou:", safeErr(err));
    });
  }

  return { version };
}

/** Entrada comum das três gravações: autoriza, limita e confere a versão. */
async function openWrite(user: User, baseVersion: number) {
  const link = await requireCaregiverLink(user);
  await requireMyActiveAgreement(user, link.monitoredOpenId);
  if (isWriteRateLimited(user.openId)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Muitas mudanças em pouco tempo. Aguarde um instante.",
    });
  }
  const current = await loadListForWrite(link.monitoredOpenId, baseVersion);
  return { monitoredOpenId: link.monitoredOpenId, current };
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

  // =================== LISTA GERENCIADA ===================

  /** Cuidador do acordo: cria um alarme. O id é um UUID gerado aqui (o AlarmKit do iOS exige UUID). */
  createAlarm: protectedProcedure
    .input(z.object({ baseVersion: z.number().int().nonnegative(), alarm: managedAlarmInputSchema }))
    .mutation(async ({ ctx, input }) => {
      const { monitoredOpenId, current } = await openWrite(ctx.user, input.baseVersion);
      if (current.length >= MANAGED_ALARMS_MAX) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Limite de ${MANAGED_ALARMS_MAX} alarmes atingido.`,
        });
      }
      const alarm = normalizeManagedAlarm(input.alarm, randomUUID());
      return commitList({
        caregiver: ctx.user,
        monitoredOpenId,
        baseVersion: input.baseVersion,
        next: [...current, alarm],
        changes: [
          {
            alarmId: alarm.id,
            alarmDescription: alarm.description,
            changeType: "created",
            oldTime: null,
            newTime: alarm.time,
          },
        ],
      });
    }),

  /** Cuidador do acordo: edita um alarme (inclui ligar/desligar). O id procurado é só da lista do idoso do vínculo. */
  updateAlarm: protectedProcedure
    .input(
      z.object({
        baseVersion: z.number().int().nonnegative(),
        alarmId: z.string().min(1).max(64),
        alarm: managedAlarmInputSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { monitoredOpenId, current } = await openWrite(ctx.user, input.baseVersion);
      if (!current.some((a) => a.id === input.alarmId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alarme não encontrado." });
      }
      const updated = normalizeManagedAlarm(input.alarm, input.alarmId);
      const next = current.map((a) => (a.id === input.alarmId ? updated : a));
      return commitList({
        caregiver: ctx.user,
        monitoredOpenId,
        baseVersion: input.baseVersion,
        next,
        changes: diffAlarms(current, next),
      });
    }),

  /** Cuidador do acordo: apaga um alarme. */
  deleteAlarm: protectedProcedure
    .input(
      z.object({
        baseVersion: z.number().int().nonnegative(),
        alarmId: z.string().min(1).max(64),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { monitoredOpenId, current } = await openWrite(ctx.user, input.baseVersion);
      if (!current.some((a) => a.id === input.alarmId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alarme não encontrado." });
      }
      const next = current.filter((a) => a.id !== input.alarmId);
      return commitList({
        caregiver: ctx.user,
        monitoredOpenId,
        baseVersion: input.baseVersion,
        next,
        changes: diffAlarms(current, next),
      });
    }),

  /**
   * Idoso: o celular aplicou a versão `version` da lista e confirma (com os ids
   * que o sistema recusou agendar). O servidor só passa a cobrar no dead man's
   * switch o que foi confirmado. Versão velha, repetida ou inexistente é
   * ignorada (`recorded: false`) — nunca volta a confirmação para trás.
   */
  ack: protectedProcedure
    .input(
      z.object({
        version: z.number().int().positive(),
        failedAlarmIds: z.array(z.string().min(1).max(64)).max(MANAGED_ALARMS_MAX),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireMonitored(ctx.user);
      const recorded = await recordManagedAck(ctx.user.openId, input.version, [
        ...new Set(input.failedAlarmIds),
      ]);
      return { recorded };
    }),
});
