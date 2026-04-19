import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { isWhatsAppApiConfigured, sendEmergencyAlerts } from "./whatsapp";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

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
     * Send emergency alert messages to multiple contacts via WhatsApp Business API.
     * This is the FALLBACK method — used when the user cannot send via deep link
     * (e.g., unconscious, app in background, deep link failed).
     *
     * The message is sent from the registered WhatsApp Business number,
     * not the user's personal number.
     */
    sendEmergencyAlert: publicProcedure
      .input(
        z.object({
          contacts: z.array(
            z.object({
              phone: z.string().min(8),
              name: z.string().min(1),
            })
          ),
          userName: z.string().optional(),
          missedAlarmCount: z.number().min(1),
          locationUrl: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
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

        message += `\n\n— Enviado automaticamente pelo Vigora Saúde`;

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

export type AppRouter = typeof appRouter;
