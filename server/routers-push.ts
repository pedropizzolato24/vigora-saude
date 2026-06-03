/**
 * routers-push.ts
 *
 * Push-token registration. A signed-in client (currently the caregiver app)
 * registers its Expo push token so the monitoring job can deliver real-time
 * alerts about the person it follows.
 */
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { upsertPushToken } from "./db-push";

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
});
