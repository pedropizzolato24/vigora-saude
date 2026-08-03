/**
 * routers-push.ts
 *
 * Push-token registration. A signed-in client (currently the caregiver app)
 * registers its Expo push token so the monitoring job can deliver real-time
 * alerts about the person it follows.
 */
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { deletePushToken, upsertPushToken } from "./db-push";

export const pushRouter = router({
  /**
   * Store the caller's Expo push token for their account. Idempotent — the same
   * device re-registering simply refreshes its row.
   */
  register: protectedProcedure
    .input(
      z.object({
        token: z.string().min(1).max(255),
        platform: z.enum(["ios", "android", "web"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertPushToken({
        openId: ctx.user.openId,
        token: input.token,
        platform: input.platform,
      });
      return { success: true } as const;
    }),

  /**
   * Remove o registro deste aparelho. Chamado no logout, ANTES de a sessão ser
   * descartada (precisa de auth).
   *
   * Apaga por TOKEN, não por (token, openId), de propósito: o caso que motivou
   * esta procedure é justamente a linha estar chaveada numa conta diferente da
   * que está saindo (o aparelho registrou como cuidador e depois trocou para a
   * conta monitorada). Filtrar por openId deixaria a linha órfã de pé, que é o
   * bug. Possuir o token do aparelho é a própria autorização — ele é um segredo
   * do dispositivo, não enumerável; o `protectedProcedure` só garante que a
   * chamada vem de uma sessão válida.
   */
  unregister: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(255) }))
    .mutation(async ({ input }) => {
      await deletePushToken(input.token);
      return { success: true } as const;
    }),
});
