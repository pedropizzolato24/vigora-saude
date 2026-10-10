/**
 * routers-links.ts
 *
 * tRPC routes for the monitored <-> caregiver linking system.
 *
 * Flow (Fase 1 — code/QR):
 *   - The monitored person calls `createInvite` to mint a short-lived, single-
 *     use code (the code is their consent to be monitored).
 *   - The caregiver calls `redeemInvite` with that code; the link is created
 *     directly as `active`. QR just carries the same code.
 *   - Either side lists their links (`getMyLink` / `getMyCaregivers`) and can
 *     `revokeLink` at any time (LGPD Art. 18).
 *
 * SECURITY: all procedures require auth. `createInvite` is monitored-only and
 * `redeemInvite` is caregiver-only. Codes are crypto-random + short TTL +
 * single use; redemption is rate-limited per caller to make brute force of the
 * code space impractical.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getUserByOpenId, getUserData } from "./db";
import { getAccountLiveness } from "./db-monitoring";
import { getRecentAlarmChanges } from "./db-alarm-changes";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoPush } from "./push";
import { endManagement, getOpenManagementForMonitored } from "./db-alarm-management";
import { pickPersonName } from "./_core/alarm-diff";
import {
  consumeInviteByCode,
  createInvite,
  getActiveCaregiversForMonitored,
  getActiveLinkForCaregiver,
  getInviteByCode,
  getRecentMissedEventsForAccount,
  getRecentWarningsForAccount,
  revokeLink as revokeLinkRow,
  upsertActiveLink,
} from "./db-links";
import {
  INVITE_TTL_MS,
  SHARE_INVITE_TTL_MS,
  generateInviteCode,
  generateInviteToken,
  isInviteExpired,
  isValidInviteCodeFormat,
  isValidTokenFormat,
  normalizeInviteCode,
} from "./links-code";

// --- Per-caller rate limiting (in-memory, per-process) ------------------------
// Mirrors the isAlertRateLimited pattern in routers.ts. Fine for a single Node
// instance; swap for Redis if the deploy goes horizontal.

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

const isCreateRateLimited = makeRateLimiter(60_000, 10);
const isRedeemRateLimited = makeRateLimiter(60_000, 8);
const isShareCreateRateLimited = makeRateLimiter(60_000, 10);
const isAcceptRateLimited = makeRateLimiter(60_000, 8);

/**
 * Vínculo exige um login de verdade: a conta anônima só é recuperável pelo
 * deviceId do aparelho (SecureStore) — morre no reinstall, e um vínculo
 * monitorado↔cuidador não pode morrer junto (spec "Contas sem login",
 * restrição a). O cliente mostra o caminho ("proteja sua conta"); este é o
 * trust boundary.
 */
function requireLinkedLogin(user: { loginMethod: string | null }): void {
  if (user.loginMethod === "anonymous") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Para vincular, primeiro proteja sua conta: entre com Google, e-mail ou telefone em Configurações.",
    });
  }
}

/**
 * Resolve the caller's single active link, throwing if there isn't one. This is
 * the authorization gate for every monitored-data read: a caregiver can only
 * ever read the data of the person they're actively linked to (the monitored
 * account is derived server-side, never trusted from client input).
 */
async function requireCaregiverLink(openId: string) {
  const link = await getActiveLinkForCaregiver(openId);
  if (!link) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Você não está vinculado a nenhuma pessoa monitorada.",
    });
  }
  return link;
}

/**
 * Avisa o cuidador de que o monitorado encerrou o vínculo. Best-effort: o
 * desvínculo (direito do titular, LGPD Art. 18) já foi feito e não pode falhar
 * por causa do push. Só campos seguros no log: a mensagem de erro pode trazer
 * parâmetros da query (openId).
 */
async function notifyLinkRevoked(caregiverOpenId: string, monitoredOpenId: string): Promise<void> {
  try {
    const tokens = await getPushTokensForOpenIds([caregiverOpenId]);
    if (tokens.length === 0) return;
    const [data, user] = await Promise.all([
      getUserData(monitoredOpenId),
      getUserByOpenId(monitoredOpenId),
    ]);
    await sendExpoPush(
      tokens.map((t) => t.token),
      {
        title: "Acompanhamento encerrado — Vigora",
        body: `${pickPersonName(data?.anamnesis, user?.name)} encerrou o acompanhamento.`,
        data: { type: "link_revoked", url: "/(caregiver-tabs)/link" },
      }
    );
  } catch (err) {
    const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
    console.warn(
      "[Links] push de desvínculo falhou:",
      `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim()
    );
  }
}

/**
 * Desfazer o vínculo encerra o acordo de gerenciamento aberto entre o par
 * (`unlinked`). Só encerra se o acordo for DO cuidador que saiu: um colega
 * vinculado que sai, ou o idoso removendo quem não é o gerente, não mexe no
 * acordo dos outros. Se quem saiu foi o gerente com acordo ATIVO, o celular do
 * idoso recebe a notificação visível para a trava das listas sair logo.
 *
 * Best-effort: o desvínculo (direito do titular, LGPD Art. 18) já foi feito e
 * não pode falhar por causa disto. Se falhar, `managedAlarms.mine` se cura na
 * próxima abertura do app do idoso. Log só com nome e código do erro.
 */
async function endManagementOnUnlink(
  caregiverOpenId: string,
  monitoredOpenId: string,
  revokedBy: "caregiver" | "monitored",
  caregiverName?: string | null
): Promise<void> {
  try {
    const open = await getOpenManagementForMonitored(monitoredOpenId);
    if (!open || open.caregiverOpenId !== caregiverOpenId) return;
    await endManagement(open.id, "unlinked");

    if (revokedBy === "caregiver" && open.status === "active") {
      void (async () => {
        const tokens = await getPushTokensForOpenIds([monitoredOpenId]);
        if (tokens.length === 0) return;
        await sendExpoPush(
          tokens.map((t) => t.token),
          {
            title: "Alarmes",
            body: `${caregiverName?.trim() || "Seu cuidador"} parou de cuidar dos seus alarmes.`,
            data: { type: "management_ended" },
          }
        );
      })().catch((err) => {
        const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
        console.warn(
          "[Links] aviso de fim do acordo falhou:",
          `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim()
        );
      });
    }
  } catch (err) {
    const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
    console.warn(
      "[Links] não foi possível encerrar o acordo de alarmes:",
      `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim()
    );
  }
}

export const linkRouter = router({
  /**
   * Monitored-only: mint a single-use invite code valid for INVITE_TTL_MS.
   */
  createInvite: protectedProcedure.mutation(async ({ ctx }) => {
    requireLinkedLogin(ctx.user);
    if (ctx.user.userType !== "monitored") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Apenas a pessoa monitorada pode gerar um código de convite.",
      });
    }
    if (isCreateRateLimited(ctx.user.openId)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Muitos códigos gerados em pouco tempo. Aguarde um instante.",
      });
    }

    const code = generateInviteCode();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await createInvite({
      code,
      createdByOpenId: ctx.user.openId,
      createdByRole: "monitored",
      expiresAt,
    });
    return { code, expiresAt };
  }),

  /**
   * Caregiver-only: redeem a monitored person's code to establish the link.
   */
  redeemInvite: protectedProcedure
    .input(
      z.object({
        code: z.string().min(1).max(32),
        displayName: z.string().trim().max(255).optional(),
        relationship: z.string().trim().max(64).optional(),
        method: z.enum(["code", "qr"]).default("code"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireLinkedLogin(ctx.user);
      if (ctx.user.userType !== "caregiver") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas um cuidador pode resgatar um código de convite.",
        });
      }
      if (isRedeemRateLimited(ctx.user.openId)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Muitas tentativas. Aguarde um instante e tente de novo.",
        });
      }

      const code = normalizeInviteCode(input.code);
      if (!isValidInviteCodeFormat(code)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Código inválido." });
      }

      const invite = await getInviteByCode(code);
      if (!invite || invite.createdByRole !== "monitored") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Código não encontrado." });
      }
      if (invite.createdByOpenId === ctx.user.openId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Você não pode se vincular a si mesmo.",
        });
      }
      if (invite.consumedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Código já utilizado." });
      }
      if (isInviteExpired(invite.expiresAt)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Código expirado." });
      }

      const monitoredOpenId = invite.createdByOpenId;

      // One monitored at a time: block if already linked to someone else.
      // Re-redeeming the same person's code is idempotent (falls through).
      const existing = await getActiveLinkForCaregiver(ctx.user.openId);
      if (existing && existing.monitoredOpenId !== monitoredOpenId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Você já acompanha outra pessoa. Desvincule antes de vincular uma nova.",
        });
      }

      // Atomic single-use claim — wins the race against a concurrent redeem.
      const claimed = await consumeInviteByCode(code, ctx.user.openId, new Date());
      if (!claimed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Código já utilizado ou expirado.",
        });
      }

      await upsertActiveLink({
        caregiverOpenId: ctx.user.openId,
        monitoredOpenId,
        method: input.method,
        displayName: input.displayName ?? null,
        relationship: input.relationship ?? null,
      });

      const monitored = await getUserByOpenId(monitoredOpenId);
      return {
        monitoredOpenId,
        monitoredName: monitored?.name ?? null,
      };
    }),

  /**
   * Caregiver-only: the caregiver's single active link (with the monitored
   * person's real name), or null.
   */
  getMyLink: protectedProcedure.query(async ({ ctx }) => {
    const link = await getActiveLinkForCaregiver(ctx.user.openId);
    if (!link) return null;
    const monitored = await getUserByOpenId(link.monitoredOpenId);
    return {
      monitoredOpenId: link.monitoredOpenId,
      monitoredName: monitored?.name ?? null,
      displayName: link.displayName,
      relationship: link.relationship,
      method: link.method,
      status: link.status,
      linkedAt: link.createdAt.getTime(),
    };
  }),

  /**
   * Monitored-only view: everyone actively linked to me, with their names.
   */
  getMyCaregivers: protectedProcedure.query(async ({ ctx }) => {
    const links = await getActiveCaregiversForMonitored(ctx.user.openId);
    const caregivers = await Promise.all(
      links.map(async (l) => {
        const u = await getUserByOpenId(l.caregiverOpenId);
        return {
          caregiverOpenId: l.caregiverOpenId,
          caregiverName: u?.name ?? null,
          relationship: l.relationship,
          linkedAt: l.createdAt.getTime(),
        };
      })
    );
    return caregivers;
  }),

  /**
   * Caregiver-only: the monitored person's data, scoped to the active link.
   * Blobs are returned as the monitored client stored them (the caregiver UI
   * owns their shape). Health data is never logged here (LGPD) and is returned
   * raw — no interpretation/scoring (ANVISA).
   */
  getMonitoredData: protectedProcedure.query(async ({ ctx }) => {
    const link = await requireCaregiverLink(ctx.user.openId);
    const monitoredOpenId = link.monitoredOpenId;

    const [data, monitored, liveness] = await Promise.all([
      getUserData(monitoredOpenId),
      getUserByOpenId(monitoredOpenId),
      getAccountLiveness(monitoredOpenId),
    ]);

    const metrics = (data?.healthMetrics ?? []) as unknown[];
    const alarms = (data?.alarms ?? []) as unknown[];
    return {
      monitoredOpenId,
      monitoredName: monitored?.name ?? null,
      profile: data?.profile ?? null,
      anamnesis: data?.anamnesis ?? null,
      alarms: alarms.slice(0, 200),
      healthMetrics: metrics.slice(-100),
      emergencyContacts: (data?.emergencyContacts ?? []) as unknown[],
      lastHeartbeatAt: liveness?.lastSeenAt ? liveness.lastSeenAt.getTime() : null,
      lastLocation: liveness?.lastLocation ?? null,
      lastLocationAt: liveness?.lastLocationAt ? liveness.lastLocationAt.getTime() : null,
      dataUpdatedAt: data?.dataUpdatedAt ?? 0,
    };
  }),

  /**
   * Caregiver-only: recent escalation-relevant events for the linked monitored
   * account (missed/not-sent alarms + warning log).
   */
  getMonitoredAlerts: protectedProcedure.query(async ({ ctx }) => {
    const link = await requireCaregiverLink(ctx.user.openId);

    const [events, warnings, changes] = await Promise.all([
      getRecentMissedEventsForAccount(link.monitoredOpenId, 30),
      getRecentWarningsForAccount(link.monitoredOpenId, 20),
      getRecentAlarmChanges(link.monitoredOpenId, 20),
    ]);

    // Quem fez cada mudança: null = a própria pessoa (veio do backup), "Você" =
    // este cuidador, senão o nome do outro cuidador (uma consulta por autor
    // distinto). Falha ao consultar um nome nunca derruba a lista.
    const authorIds = [
      ...new Set(
        changes
          .map((c) => c.changedByOpenId)
          .filter((id): id is string => !!id && id !== ctx.user.openId)
      ),
    ];
    const authorNames = new Map<string, string>();
    await Promise.all(
      authorIds.map(async (id) => {
        const author = await getUserByOpenId(id).catch(() => undefined);
        authorNames.set(id, author?.name?.trim() || "Outro cuidador");
      })
    );
    const changedByName = (id: string | null | undefined): string | null =>
      !id ? null : id === ctx.user.openId ? "Você" : (authorNames.get(id) ?? "Outro cuidador");

    return {
      events: events.map((e) => ({
        alarmId: e.alarmId,
        alarmDescription: e.alarmDescription,
        kind: e.kind ?? null,
        scheduledAt: e.scheduledAt.getTime(),
        status: e.status,
        resolvedAt: e.resolvedAt ? e.resolvedAt.getTime() : null,
      })),
      warnings: warnings.map((w) => ({
        level: w.level,
        offlineHours: w.offlineHours,
        contactsReached: w.contactsReached,
        sentAt: w.sentAt.getTime(),
      })),
      changes: changes.map((c) => ({
        id: c.id,
        alarmId: c.alarmId,
        alarmDescription: c.alarmDescription,
        changeType: c.changeType,
        oldTime: c.oldTime,
        newTime: c.newTime,
        changedByOpenId: c.changedByOpenId ?? null,
        changedByName: changedByName(c.changedByOpenId),
        createdAt: c.createdAt.getTime(),
      })),
    };
  }),

  /**
   * Caregiver-only: mint a share-link token (the caregiver sends the resulting
   * URL via WhatsApp; the monitored person opens it and accepts). Blocked if
   * the caregiver already has an active link (one monitored at a time).
   */
  createShareInvite: protectedProcedure.mutation(async ({ ctx }) => {
    requireLinkedLogin(ctx.user);
    if (ctx.user.userType !== "caregiver") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Apenas um cuidador pode criar um convite por link.",
      });
    }
    if (isShareCreateRateLimited(ctx.user.openId)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Muitos convites em pouco tempo. Aguarde um instante.",
      });
    }
    const existing = await getActiveLinkForCaregiver(ctx.user.openId);
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Você já acompanha uma pessoa. Desvincule antes de convidar outra.",
      });
    }
    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + SHARE_INVITE_TTL_MS);
    await createInvite({
      code: token,
      createdByOpenId: ctx.user.openId,
      createdByRole: "caregiver",
      expiresAt,
    });
    return { token, expiresAt };
  }),

  /**
   * Preview a share-link invite (who's inviting), without consuming it. Used by
   * the accept screen to show "Fulano quer te acompanhar" before the tap.
   */
  getInviteInfo: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(32) }))
    .query(async ({ ctx, input }) => {
      const token = input.token.trim();
      const invalid = (reason: string) => ({ valid: false as const, reason, caregiverName: null });
      if (!isValidTokenFormat(token)) return invalid("invalid");
      const invite = await getInviteByCode(token);
      if (!invite || invite.createdByRole !== "caregiver") return invalid("not_found");
      if (invite.createdByOpenId === ctx.user.openId) return invalid("self");
      if (invite.consumedAt) return invalid("used");
      if (isInviteExpired(invite.expiresAt)) return invalid("expired");
      const caregiver = await getUserByOpenId(invite.createdByOpenId);
      return { valid: true as const, reason: null, caregiverName: caregiver?.name ?? null };
    }),

  /**
   * Monitored-only: accept a caregiver's share-link invite. The deliberate tap
   * here is the monitored person's consent (LGPD) — opening the link alone
   * never creates the link.
   */
  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(32) }))
    .mutation(async ({ ctx, input }) => {
      requireLinkedLogin(ctx.user);
      if (ctx.user.userType !== "monitored") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas a pessoa monitorada pode aceitar este convite.",
        });
      }
      if (isAcceptRateLimited(ctx.user.openId)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Muitas tentativas. Aguarde um instante.",
        });
      }
      const token = input.token.trim();
      if (!isValidTokenFormat(token)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Convite inválido." });
      }
      const invite = await getInviteByCode(token);
      if (!invite || invite.createdByRole !== "caregiver") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Convite não encontrado." });
      }
      if (invite.createdByOpenId === ctx.user.openId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode se vincular a si mesmo." });
      }
      if (invite.consumedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Convite já utilizado." });
      }
      if (isInviteExpired(invite.expiresAt)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Convite expirado." });
      }

      const caregiverOpenId = invite.createdByOpenId;
      // The caregiver may have linked to someone else since creating the invite.
      const caregiverLink = await getActiveLinkForCaregiver(caregiverOpenId);
      if (caregiverLink && caregiverLink.monitoredOpenId !== ctx.user.openId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Este cuidador já está acompanhando outra pessoa.",
        });
      }

      const claimed = await consumeInviteByCode(token, ctx.user.openId, new Date());
      if (!claimed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Convite já utilizado ou expirado." });
      }

      await upsertActiveLink({
        caregiverOpenId,
        monitoredOpenId: ctx.user.openId,
        method: "invite_link",
      });

      const caregiver = await getUserByOpenId(caregiverOpenId);
      return { caregiverName: caregiver?.name ?? null };
    }),

  /**
   * Revoke a link. Either side may call it; the pair is resolved from the
   * caller's role. `otherOpenId` is the account on the far side of the link.
   */
  revokeLink: protectedProcedure
    .input(z.object({ otherOpenId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.userType === "monitored") {
        // otherOpenId vem do cliente: só avisa quem de fato estava vinculado.
        const wasLinked = (await getActiveCaregiversForMonitored(ctx.user.openId)).some(
          (c) => c.caregiverOpenId === input.otherOpenId
        );
        await revokeLinkRow(input.otherOpenId, ctx.user.openId);
        await endManagementOnUnlink(input.otherOpenId, ctx.user.openId, "monitored");
        // Fire-and-forget: o fetch do Expo não tem timeout e não segura a resposta.
        if (wasLinked) void notifyLinkRevoked(input.otherOpenId, ctx.user.openId);
      } else {
        await revokeLinkRow(ctx.user.openId, input.otherOpenId);
        await endManagementOnUnlink(ctx.user.openId, input.otherOpenId, "caregiver", ctx.user.name);
      }
      return { success: true } as const;
    }),
});
