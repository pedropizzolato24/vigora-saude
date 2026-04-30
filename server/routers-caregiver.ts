/**
 * routers-caregiver.ts
 *
 * tRPC routes for the caregiver system.
 *
 * Routes:
 *   caregiver.generateCode      - Monitored user generates an invite code
 *   caregiver.getActiveCode     - Monitored user fetches their current active code
 *   caregiver.linkWithCode      - Caregiver links to monitored user via code
 *   caregiver.getMonitoredStatus - Caregiver polls their monitored person's status
 *   caregiver.unlinkMonitored   - Caregiver unlinks from their monitored person
 *   caregiver.getLinkedCaregivers - Monitored user lists their caregivers
 *   caregiver.removeCaregiver   - Monitored user removes a specific caregiver
 *   caregiver.registerPushToken - Any device registers its Expo push token
 */
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import {
  createInviteCode,
  getActiveInviteCode,
  consumeInviteCode,
  createCaregivingLink,
  removeCaregivingLink,
  getCaregiversForMonitored,
  getMonitoredForCaregiver,
  upsertPushToken,
} from "./db-caregiver";
import { getAppUser, getLastHeartbeat, getAlarmEventHistory } from "./db-monitoring";

export const caregiverRouter = router({
  /**
   * Monitored user generates a 6-char invite code valid for 24 hours.
   * Invalidates any previous unused code for this device.
   */
  generateCode: publicProcedure
    .input(z.object({ deviceId: z.string().min(1).max(64) }))
    .mutation(async ({ input }) => {
      const { code, expiresAt } = await createInviteCode(input.deviceId);
      return { code, expiresAt: expiresAt.toISOString() };
    }),

  /**
   * Monitored user fetches their current active invite code (if any).
   */
  getActiveCode: publicProcedure
    .input(z.object({ deviceId: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const result = await getActiveInviteCode(input.deviceId);
      if (!result) return null;
      return { code: result.code, expiresAt: result.expiresAt.toISOString() };
    }),

  /**
   * Caregiver links to a monitored person using their invite code.
   * Returns the monitored person's public profile on success.
   */
  linkWithCode: publicProcedure
    .input(
      z.object({
        caregiverDeviceId: z.string().min(1).max(64),
        code: z.string().length(6),
      })
    )
    .mutation(async ({ input }) => {
      const monitoredDeviceId = await consumeInviteCode(
        input.code,
        input.caregiverDeviceId
      );

      if (!monitoredDeviceId) {
        return { success: false, error: "Código inválido ou expirado." };
      }

      await createCaregivingLink(monitoredDeviceId, input.caregiverDeviceId);

      // Fetch the monitored person's profile to return to the caregiver app
      const user = await getAppUser(monitoredDeviceId);
      const heartbeat = await getLastHeartbeat(monitoredDeviceId);

      return {
        success: true,
        monitored: {
          deviceId: monitoredDeviceId,
          name: user?.userName ?? null,
          lastSeenAt: heartbeat?.lastSeenAt?.toISOString() ?? null,
          lastLocation: user?.lastLocation ?? null,
        },
      };
    }),

  /**
   * Caregiver polls their monitored person's current status.
   * Returns last heartbeat, recent alarm events, and basic profile.
   */
  getMonitoredStatus: publicProcedure
    .input(z.object({ caregiverDeviceId: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const monitoredDeviceId = await getMonitoredForCaregiver(input.caregiverDeviceId);
      if (!monitoredDeviceId) return null;

      const [user, heartbeat, events] = await Promise.all([
        getAppUser(monitoredDeviceId),
        getLastHeartbeat(monitoredDeviceId),
        getAlarmEventHistory(monitoredDeviceId, 10),
      ]);

      const now = Date.now();
      const lastSeenMs = heartbeat?.lastSeenAt ? new Date(heartbeat.lastSeenAt).getTime() : null;
      const offlineMinutes = lastSeenMs ? Math.floor((now - lastSeenMs) / 60000) : null;

      // Derive status from recent data
      let status: "ok" | "warning" | "missed_alarm" | "unknown" = "unknown";
      if (lastSeenMs !== null) {
        const recentMissed = events.find((e) => e.status === "missed");
        const wasRecentMiss =
          recentMissed &&
          now - new Date(recentMissed.scheduledAt).getTime() < 4 * 60 * 60 * 1000;

        if (wasRecentMiss) {
          status = "missed_alarm";
        } else if (offlineMinutes !== null && offlineMinutes > 60) {
          status = "warning";
        } else {
          status = "ok";
        }
      }

      const lastEvent = events[0] ?? null;

      return {
        deviceId: monitoredDeviceId,
        name: user?.userName ?? null,
        lastSeenAt: heartbeat?.lastSeenAt?.toISOString() ?? null,
        lastLocation: user?.lastLocation ?? null,
        status,
        lastAlarm: lastEvent
          ? {
              description: lastEvent.alarmDescription,
              scheduledAt: new Date(lastEvent.scheduledAt).toISOString(),
              status: lastEvent.status,
            }
          : null,
      };
    }),

  /**
   * Caregiver unlinks from their monitored person.
   */
  unlinkMonitored: publicProcedure
    .input(z.object({ caregiverDeviceId: z.string().min(1).max(64) }))
    .mutation(async ({ input }) => {
      const monitoredDeviceId = await getMonitoredForCaregiver(input.caregiverDeviceId);
      if (!monitoredDeviceId) return { success: false };
      await removeCaregivingLink(monitoredDeviceId, input.caregiverDeviceId);
      return { success: true };
    }),

  /**
   * Monitored user lists all their linked caregivers.
   */
  getLinkedCaregivers: publicProcedure
    .input(z.object({ deviceId: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const links = await getCaregiversForMonitored(input.deviceId);
      const caregivers = await Promise.all(
        links.map(async (link) => {
          const user = await getAppUser(link.caregiverDeviceId);
          return {
            deviceId: link.caregiverDeviceId,
            name: user?.userName ?? null,
            linkedAt: link.createdAt.toISOString(),
          };
        })
      );
      return { caregivers };
    }),

  /**
   * Monitored user removes a specific caregiver.
   */
  removeCaregiver: publicProcedure
    .input(
      z.object({
        monitoredDeviceId: z.string().min(1).max(64),
        caregiverDeviceId: z.string().min(1).max(64),
      })
    )
    .mutation(async ({ input }) => {
      await removeCaregivingLink(input.monitoredDeviceId, input.caregiverDeviceId);
      return { success: true };
    }),

  /**
   * Any device (monitored or caregiver) registers its Expo push token.
   * Called once on app startup after push permission is granted.
   */
  registerPushToken: publicProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        token: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      await upsertPushToken(input.deviceId, input.token);
      return { success: true };
    }),
});
