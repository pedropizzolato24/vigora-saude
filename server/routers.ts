import { TRPCError } from "@trpc/server";
import { parse as parseCookieHeader } from "cookie";
import { z } from "zod";
import { COOKIE_NAME, DEFAULT_SESSION_TTL_MS } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk, revokeJti } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { isWhatsAppApiConfigured, sendEmergencyAlerts } from "./whatsapp";
import { monitoringRouter } from "./routers-monitoring";
import { linkRouter } from "./routers-links";
import { pushRouter } from "./routers-push";
import { getUserByOpenId, getUserData, upsertUser, upsertUserData } from "./db";
import { deleteAccountData } from "./db-account";
import { getAccountLiveness, getAlarmEventHistory, getWarningHistory } from "./db-monitoring";
import { getActiveCaregiversForMonitored } from "./db-links";
import type { EmergencyContactRecord } from "../drizzle/schema";

/**
 * Normalizes a phone string to digits-only so we can compare contact
 * payloads against the stored emergency contacts regardless of formatting
 * ("(11) 99999-9999" vs "5511999999999" vs "+55 11 9 9999-9999").
 */
function normalizeDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Returns true if `claimed` matches one of the stored emergency contacts.
 * Match is by digit-only suffix (8 digits — covers BR mobile without country
 * code or DDD differences) so legitimate format drift doesn't block alerts.
 */
function isAllowedRecipient(
  claimed: { phone: string; name: string },
  stored: EmergencyContactRecord[]
): boolean {
  const claimedDigits = normalizeDigits(claimed.phone);
  if (claimedDigits.length < 8) return false;
  const claimedTail = claimedDigits.slice(-8);
  return stored.some((c) => {
    const tail = normalizeDigits(c.phone).slice(-8);
    return tail.length >= 8 && tail === claimedTail;
  });
}

/**
 * Per-process per-user rate limit for sendEmergencyAlert.
 * 5 mensagens em janela de 60 segundos: suficiente para um SOS legítimo
 * (que tipicamente notifica 2-3 contatos), bloqueia spam automatizado.
 */
const ALERT_WINDOW_MS = 60_000;
const ALERT_LIMIT = 5;
const alertRateLimit = new Map<string, number[]>();

function isAlertRateLimited(openId: string): boolean {
  const now = Date.now();
  const prev = alertRateLimit.get(openId) ?? [];
  const recent = prev.filter((ts) => now - ts < ALERT_WINDOW_MS);
  if (recent.length >= ALERT_LIMIT) {
    alertRateLimit.set(openId, recent);
    return true;
  }
  recent.push(now);
  alertRateLimit.set(openId, recent);
  return false;
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    /**
     * Sliding session: issue a fresh token for the already-authenticated user
     * and (on web) reset the session cookie. Called on every app startup
     * (lib/session-refresh.ts) so an actively-used device never expires —
     * without this, a session dying after the TTL silently disarms the dead
     * man's switch (heartbeat/sync/events all start 401ing). The previous
     * token is left to expire naturally (no revoke) to avoid racing in-flight
     * requests still carrying it.
     */
    refresh: protectedProcedure.mutation(async ({ ctx }) => {
      // O nome vai DENTRO do JWT e verifySession REJEITA token com name vazio
      // (mesma invariante que issueSession protege no login). Contas sem nome no
      // banco (cadastro por telefone, ou Google/e-mail que não gravou nome) têm
      // ctx.user.name === null; emitir `name: ""` aqui gerava um token que falha
      // na verificação da PRÓXIMA requisição -> 403 -> handleUnauthorized() ->
      // usuário chutado de volta pro login logo após entrar. Fallback p/ "Usuário".
      const token = await sdk.createSessionToken(ctx.user.openId, {
        name: ctx.user.name?.trim() || "Usuário",
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: DEFAULT_SESSION_TTL_MS,
      });
      // Só devolve o token no corpo para clientes NATIVOS (que se autenticam via
      // Bearer e guardam o token no SecureStore). Na web o token vive no cookie
      // httpOnly acima — devolvê-lo no corpo o exporia ao JS (leitura por XSS),
      // anulando a proteção httpOnly. Web autentica por cookie, sem Bearer.
      const authHeader = ctx.req.headers.authorization;
      const isNativeBearer =
        typeof authHeader === "string" && authHeader.startsWith("Bearer ");
      return isNativeBearer
        ? ({ success: true, token } as const)
        : ({ success: true } as const);
    }),
    /**
     * Completes the post-login registration: stores name (possibly edited),
     * phone, and the account type chosen by the user.
     *
     * Until userType is set, the client routes the user to /register instead
     * of the main app. Once set, the user is considered fully registered.
     */
    completeRegistration: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(255),
          phone: z.string().trim().min(8).max(32),
          userType: z.enum(["caregiver", "monitored"]),
          birthDate: z.string().trim().max(16).optional(),
          bloodType: z.string().trim().max(8).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await upsertUser({
          openId: ctx.user.openId,
          name: input.name,
          phone: input.phone,
          userType: input.userType,
          birthDate: input.birthDate ?? null,
          bloodType: input.bloodType ?? null,
        });
        const updated = await getUserByOpenId(ctx.user.openId);
        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Usuário não encontrado após atualização.",
          });
        }
        return updated;
      }),
    /**
     * Updates any subset of the editable profile fields. Used by the in-app
     * profile screen. Unlike completeRegistration, every field is optional —
     * the client only sends what changed.
     */
    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(255).optional(),
          phone: z.string().trim().max(32).optional(),
          birthDate: z.string().trim().max(16).optional(),
          bloodType: z.string().trim().max(8).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await upsertUser({
          openId: ctx.user.openId,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : {}),
          ...(input.bloodType !== undefined ? { bloodType: input.bloodType } : {}),
        });
        const updated = await getUserByOpenId(ctx.user.openId);
        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Usuário não encontrado após atualização.",
          });
        }
        return updated;
      }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      // Best-effort: also revoke the JWT so a leaked copy of the
      // pre-logout token can't be reused.
      try {
        const authHeader = ctx.req.headers.authorization;
        let token: string | undefined;
        if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
          token = authHeader.slice("Bearer ".length).trim();
        }
        if (!token && ctx.req.headers.cookie) {
          const cookies = parseCookieHeader(ctx.req.headers.cookie);
          token = cookies[COOKIE_NAME];
        }
        if (token) {
          const session = await sdk.verifySession(token);
          if (session?.jti && session.expMs) {
            revokeJti(session.jti, session.expMs);
          }
        }
      } catch (err) {
        // Swallow: logout must always succeed from the client's POV.
        console.warn("[Auth] logout revoke step failed:", err);
      }

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    /**
     * Permanently deletes the account and ALL its server-side data (LGPD
     * Art. 18, VI). Irreversible. Deleting the canonical user row invalidates
     * every outstanding session (authenticateRequest 403s on a missing user);
     * we also revoke the caller's current token and clear the web cookie.
     */
    deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
      await deleteAccountData(ctx.user.openId);

      // Belt-and-suspenders: revoke the caller's current token now.
      try {
        const authHeader = ctx.req.headers.authorization;
        let token: string | undefined;
        if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
          token = authHeader.slice("Bearer ".length).trim();
        }
        if (!token && ctx.req.headers.cookie) {
          const cookies = parseCookieHeader(ctx.req.headers.cookie);
          token = cookies[COOKIE_NAME];
        }
        if (token) {
          const session = await sdk.verifySession(token);
          if (session?.jti && session.expMs) {
            revokeJti(session.jti, session.expMs);
          }
        }
      } catch (err) {
        console.warn("[Auth] deleteAccount revoke step failed:", err);
      }

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Per-account cloud backup of the app state (survives reinstall)
  userData: router({
    /** Returns the stored snapshot for the current user, or null if none yet. */
    get: protectedProcedure.query(async ({ ctx }) => {
      const row = await getUserData(ctx.user.openId);
      if (!row) return null;
      return {
        anamnesis: row.anamnesis ?? null,
        emergencyContacts: row.emergencyContacts ?? [],
        alarms: row.alarms ?? [],
        settings: row.settings ?? null,
        healthMetrics: row.healthMetrics ?? [],
        profile: row.profile ?? null,
        dataUpdatedAt: row.dataUpdatedAt ?? 0,
      };
    }),
    /** Upserts the snapshot. Last-write-wins is enforced client-side via dataUpdatedAt. */
    put: protectedProcedure
      .input(
        z.object({
          anamnesis: z.record(z.string(), z.unknown()).nullable().optional(),
          emergencyContacts: z.array(z.unknown()).max(500).optional(),
          alarms: z.array(z.unknown()).max(500).optional(),
          settings: z.record(z.string(), z.unknown()).nullable().optional(),
          healthMetrics: z.array(z.unknown()).max(2000).optional(),
          profile: z.record(z.string(), z.unknown()).nullable().optional(),
          dataUpdatedAt: z.number().int().nonnegative(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await upsertUserData({
          openId: ctx.user.openId,
          anamnesis: (input.anamnesis ?? null) as Record<string, unknown> | null,
          emergencyContacts: input.emergencyContacts ?? [],
          alarms: input.alarms ?? [],
          settings: (input.settings ?? null) as Record<string, unknown> | null,
          healthMetrics: input.healthMetrics ?? [],
          profile: (input.profile ?? null) as Record<string, unknown> | null,
          dataUpdatedAt: input.dataUpdatedAt,
        });
        return { success: true } as const;
      }),
    /**
     * Exportação de dados do titular (LGPD Art. 18, V — portabilidade).
     *
     * Devolve TUDO que o servidor guarda sobre a conta do chamador. As seções
     * espelham as tabelas que `server/db-account.ts` apaga na exclusão de
     * conta — tabela nova precisa entrar nos dois lugares.
     *
     * Fora de propósito, com justificativa: `auth_codes` são segredos de login
     * em trânsito (exportar seria falha de segurança); `push_tokens` são
     * identificadores de aparelho sem valor para o titular; `link_invites` são
     * convites transitórios que expiram sozinhos.
     *
     * Escopo sempre por `ctx.user.openId` — nunca por input do cliente.
     */
    export: protectedProcedure.query(async ({ ctx }) => {
      const openId = ctx.user.openId;

      // Teto alto em vez de paginação: o volume por conta é pequeno (ordem de
      // centenas) e a exportação precisa ser completa para valer como
      // portabilidade.
      const LIMITE_EXPORTACAO = 10_000;

      const [user, data, historicoDeAlarmes, alertasEnviados, sinalDeVida, cuidadores] =
        await Promise.all([
          getUserByOpenId(openId),
          getUserData(openId),
          getAlarmEventHistory(openId, LIMITE_EXPORTACAO),
          getWarningHistory(openId, LIMITE_EXPORTACAO),
          getAccountLiveness(openId),
          getActiveCaregiversForMonitored(openId),
        ]);

      return {
        conta: user
          ? { nome: user.name ?? null, email: user.email ?? null, telefone: user.phone ?? null }
          : null,
        dadosDaConta: data
          ? {
              anamnese: data.anamnesis ?? null,
              contatosDeEmergencia: data.emergencyContacts ?? [],
              alarmes: data.alarms ?? [],
              configuracoes: data.settings ?? null,
              metricasDeSaude: data.healthMetrics ?? [],
              perfil: data.profile ?? null,
              atualizadoEm: data.dataUpdatedAt ?? 0,
            }
          : null,
        historicoDeAlarmes,
        alertasEnviados,
        sinalDeVida: sinalDeVida ?? null,
        cuidadoresVinculados: cuidadores.map((c) => ({
          caregiverOpenId: c.caregiverOpenId,
          relationship: c.relationship,
          vinculadoEm: c.createdAt instanceof Date ? c.createdAt.getTime() : c.createdAt,
        })),
      };
    }),
  }),

  // Alarm monitoring system
  monitoring: monitoringRouter,

  // Monitored <-> caregiver linking
  link: linkRouter,

  // Expo push-token registration (real-time caregiver alerts)
  push: pushRouter,

  // WhatsApp emergency escalation routes
  whatsapp: router({
    /**
     * Check if WhatsApp Business API is configured on the server.
     * Used by the client to determine if fallback is available.
     */
    isConfigured: publicProcedure.query(() => {
      return { configured: isWhatsAppApiConfigured() };
    }),

    /**
     * Send emergency alert messages to the user's stored emergency contacts
     * via WhatsApp Business API. This is the FALLBACK method - used when
     * the deep link path fails (app in background, unconscious user, etc.).
     *
     * SECURITY: Requires authentication and verifies that:
     *   1. Every phone number in `contacts` matches a stored emergency
     *      contact for ctx.user's account (no arbitrary destinations)
     *   2. Per-user rate limit (5 calls / 60s) to prevent spam abuse
     */
    sendEmergencyAlert: protectedProcedure
      .input(
        z.object({
          /** Compat: clientes antigos ainda enviam; ignorado (posse é por conta). */
          deviceId: z.string().max(64).optional(),
          contacts: z.array(
            z.object({
              phone: z.string().min(8),
              name: z.string().min(1),
            })
          ).min(1).max(20),
          userName: z.string().max(255).optional(),
          missedAlarmCount: z.number().min(1).max(1000),
          // .url() so arbitrary text/phishing can't be injected into the
          // templated WhatsApp body under the trusted "Vigora" sender.
          locationUrl: z.string().url().max(500).optional(),
          /**
           * Tipo do alerta: escalação de alarme perdido (padrão) ou SOS —
           * o usuário acionou o botão de pânico e os CONTATOS devem ser
           * avisados de que ELE precisa de ajuda.
           */
          alertType: z.enum(["missed_alarm", "sos"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Rate limit before doing any work
        if (isAlertRateLimited(ctx.user.openId)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "Muitas tentativas de alerta em pouco tempo. Aguarde um minuto.",
          });
        }

        // Load the account's stored contacts and verify all targets are
        // whitelisted. user_data (cloud backup por conta) é o lar autoritativo
        // dos contatos — posse implícita pelo openId autenticado.
        const data = await getUserData(ctx.user.openId);
        const storedContacts: EmergencyContactRecord[] =
          (data?.emergencyContacts as EmergencyContactRecord[] | null) ?? [];
        if (storedContacts.length === 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Nenhum contato de emergência cadastrado. Adicione contatos antes de disparar alertas.",
          });
        }
        const rejected = input.contacts.filter(
          (c) => !isAllowedRecipient(c, storedContacts)
        );
        if (rejected.length > 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Um ou mais destinatários não estão na sua lista de contatos de emergência.",
          });
        }

        if (!isWhatsAppApiConfigured()) {
          return {
            success: false,
            sent: 0,
            failed: input.contacts.length,
            error: "WhatsApp Business API não configurada. Configure WHATSAPP_API_TOKEN e WHATSAPP_PHONE_NUMBER_ID nas configurações do servidor.",
          };
        }

        // Build the emergency message
        const userName = input.userName || "O usuário";
        let message: string;
        if (input.alertType === "sos") {
          message =
            `🆘 SOS — VIGORA SAÚDE 🆘\n\n` +
            `${userName} acionou o botão de EMERGÊNCIA e precisa de ajuda AGORA.\n` +
            `Por favor, entre em contato imediatamente ou vá até a pessoa.`;
          if (input.locationUrl) {
            message += `\n\n📍 Localização atual:\n${input.locationUrl}`;
          }
        } else {
          message =
            `⚠️ ALERTA VIGORA SAÚDE ⚠️\n\n` +
            `${userName} não respondeu a ${input.missedAlarmCount} alarme(s) consecutivo(s) de medicamento.\n` +
            `Por favor, entre em contato urgentemente para verificar se está tudo bem.`;
          if (input.locationUrl) {
            message += `\n\n📍 Última localização conhecida:\n${input.locationUrl}`;
          }
        }

        message += `\n\n- Enviado automaticamente pelo Vigora`;

        const result = await sendEmergencyAlerts(input.contacts, message);

        return {
          success: result.sent > 0,
          sent: result.sent,
          failed: result.failed,
          details: result.results.map((r) => ({
            name: r.name,
            success: r.result.success,
            error: r.result.error,
          })),
        };
      }),
  }),
});

// Exported for tests
export const __testing = { isAllowedRecipient, normalizeDigits };

export type AppRouter = typeof appRouter;
