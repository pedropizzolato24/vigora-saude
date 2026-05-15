import { TRPCError } from "@trpc/server";
import { parse as parseCookieHeader } from "cookie";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk, revokeJti } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { isWhatsAppApiConfigured, sendEmergencyAlerts } from "./whatsapp";
import { assertDeviceOwnership, getAppUserForOwner } from "./db-monitoring";
import { monitoringRouter } from "./routers-monitoring";
import { getUserByOpenId, upsertUser } from "./db";
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
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await upsertUser({
          openId: ctx.user.openId,
          name: input.name,
          phone: input.phone,
          userType: input.userType,
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
  }),

  // Alarm monitoring system
  monitoring: monitoringRouter,

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
     *   1. The deviceId is owned by ctx.user
     *   2. Every phone number in `contacts` matches a stored emergency
     *      contact for that device (no arbitrary destinations)
     *   3. Per-user rate limit (5 calls / 60s) to prevent spam abuse
     */
    sendEmergencyAlert: protectedProcedure
      .input(
        z.object({
          deviceId: z.string().min(1).max(64),
          contacts: z.array(
            z.object({
              phone: z.string().min(8),
              name: z.string().min(1),
            })
          ).min(1).max(20),
          userName: z.string().max(255).optional(),
          missedAlarmCount: z.number().min(1).max(1000),
          locationUrl: z.string().max(500).optional(),
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

        // Ownership: deviceId must belong to caller and be registered
        try {
          await assertDeviceOwnership(input.deviceId, ctx.user.openId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === "DEVICE_NOT_REGISTERED") {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "Dispositivo não registrado.",
            });
          }
          if (msg === "DEVICE_OWNED_BY_ANOTHER_USER") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Dispositivo pertence a outro usuário.",
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Falha ao verificar dispositivo.",
          });
        }

        // Load the stored contacts and verify all targets are whitelisted
        const appUser = await getAppUserForOwner(
          input.deviceId,
          ctx.user.openId
        );
        const storedContacts: EmergencyContactRecord[] =
          (appUser?.emergencyContacts as EmergencyContactRecord[] | null) ?? [];
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
        let message =
          `⚠️ ALERTA VIGORA SAÚDE ⚠️\n\n` +
          `${userName} não respondeu a ${input.missedAlarmCount} alarme(s) consecutivo(s) de medicamento.\n` +
          `Por favor, entre em contato urgentemente para verificar se está tudo bem.`;

        if (input.locationUrl) {
          message += `\n\n📍 Última localização conhecida:\n${input.locationUrl}`;
        }

        message += `\n\n- Enviado automaticamente pelo Vigora Saúde`;

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
