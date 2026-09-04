/**
 * routers-push.ts
 *
 * Push-token registration. A signed-in client (currently the caregiver app)
 * registers its Expo push token so the monitoring job can deliver real-time
 * alerts about the person it follows.
 */
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { deleteOwnedPushToken, upsertPushToken } from "./db-push";

export const pushRouter = router({
  /**
   * Store the caller's Expo push token for their account. Idempotent — the same
   * device re-registering simply refreshes its row.
   *
   * O `deviceId` grava a prova de posse do aparelho, usada depois pelo
   * unregister. Opcional para não quebrar clientes antigos.
   */
  register: protectedProcedure
    .input(
      z.object({
        token: z.string().min(1).max(255),
        platform: z.enum(["ios", "android", "web"]),
        deviceId: z.string().max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertPushToken({
        openId: ctx.user.openId,
        token: input.token,
        platform: input.platform,
        deviceId: input.deviceId,
      });
      return { success: true } as const;
    }),

  /**
   * Remove o registro deste aparelho. Chamado no logout, ANTES de a sessão ser
   * descartada (precisa de auth).
   *
   * SECURITY: só apaga a linha quando quem chama prova ser dono dela — a linha
   * é da própria conta, OU o chamador apresenta o `deviceId` gravado nela.
   * Antes, apagava por token puro: bastava conhecer o Expo push token de um
   * cuidador para apagá-lo e desarmar, em silêncio, todo o alerta em tempo real
   * do dead man's switch daquela pessoa (pushMissedAlarmToCaregivers,
   * sosAlertCaregivers e os Passos 3/4 do monitoring-job passavam a resolver
   * zero tokens).
   *
   * O caminho por `deviceId` é o que preserva o motivo original de não filtrar
   * por openId: o aparelho registrou como cuidador e depois entrou na conta
   * monitorada, então no logout a linha está chaveada em OUTRA conta. Ali o
   * segredo do aparelho (UUID v4 do SecureStore) é a autorização — não o token,
   * que pode vazar em log ou backup.
   */
  unregister: protectedProcedure
    .input(
      z.object({
        token: z.string().min(1).max(255),
        deviceId: z.string().max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const removido = await deleteOwnedPushToken(input.token, {
        openId: ctx.user.openId,
        deviceId: input.deviceId,
      });
      // Não é erro: cliente antigo (sem deviceId) saindo de uma linha de outra
      // conta simplesmente não remove nada. Logar para não sumir em silêncio —
      // sem o token nem o openId (LGPD / o token é segredo do aparelho).
      if (!removido) {
        console.warn(
          "[Push] unregister não removeu nenhuma linha: token de outra conta e sem deviceId correspondente."
        );
      }
      return { success: true, removed: removido } as const;
    }),
});
