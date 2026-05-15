/**
 * routers-monitoring.ts
 *
 * tRPC routes for the server-side alarm monitoring system.
 *
 * SECURITY: All procedures require authentication. Each device row is bound
 * to the openId of the user that registered it. Subsequent calls verify
 * that the supplied deviceId belongs to ctx.user.openId — preventing
 * deviceId enumeration attacks that previously leaked PII (contacts,
 * location, alarm history) and allowed an attacker to overwrite a
 * victim's emergency contacts.
 *
 * Routes:
 *   monitoring.register        - Register/claim device for ctx.user
 *   monitoring.heartbeat       - Send "I'm alive" ping
 *   monitoring.syncAlarms      - Replace all synced alarms for the device
 *   monitoring.createEvent     - Create a pending alarm event
 *   monitoring.confirmEvent    - Confirm alarm as responded/missed/not_sent
 *   monitoring.getHistory      - Get alarm event history (own device)
 *   monitoring.getWarnings     - Get warning log (own device)
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  assertDeviceOwnership,
  createAlarmEvent,
  getAlarmEventHistory,
  getAppUserForOwner,
  getLastHeartbeat,
  getSyncedAlarms,
  getWarningHistory,
  recordHeartbeat,
  replaceAllSyncedAlarms,
  updateAlarmEventStatusByAlarmId,
  upsertAppUser,
} from "./db-monitoring";

const emergencyContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  relation: z.string(),
  whatsapp: z.boolean(),
  /** Optional email address for fallback notifications (Email -> SMS) */
  email: z.string().email().optional(),
});

/**
 * Maps the ownership-check errors thrown by assertDeviceOwnership into
 * the appropriate tRPC error codes so the client gets a stable contract.
 */
async function requireDeviceOwnership(
  deviceId: string,
  openId: string
): Promise<void> {
  try {
    await assertDeviceOwnership(deviceId, openId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "DEVICE_NOT_REGISTERED") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Dispositivo não registrado. Chame monitoring.register primeiro.",
      });
    }
    if (msg === "DEVICE_OWNED_BY_ANOTHER_USER") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Este dispositivo pertence a outro usuário.",
      });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Falha ao verificar propriedade do dispositivo.",
    });
  }
}

export const monitoringRouter = router({
  /**
   * Register or update a device profile.
   * Called on app startup and whenever contacts/name change.
   * Claims the deviceId for the authenticated user.
   */
  register: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        userName: z.string().optional(),
        emergencyContacts: z.array(emergencyContactSchema).optional(),
        lastLocation: z.string().optional(), // "lat,lng"
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Allow claim if device is unowned OR already owned by current user.
      // assertDeviceOwnership only throws when the row exists with a
      // *different* openId — so we ignore DEVICE_NOT_REGISTERED here.
      try {
        await assertDeviceOwnership(input.deviceId, ctx.user.openId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "DEVICE_OWNED_BY_ANOTHER_USER") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Este dispositivo pertence a outro usuário.",
          });
        }
        // DEVICE_NOT_REGISTERED is fine — registering creates the row.
      }
      await upsertAppUser({
        deviceId: input.deviceId,
        openId: ctx.user.openId,
        userName: input.userName,
        emergencyContacts: input.emergencyContacts,
        lastLocation: input.lastLocation,
      });
      return { success: true };
    }),

  /**
   * Send a heartbeat ping. Called every 5 minutes while app is active.
   */
  heartbeat: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        appVersion: z.string().optional(),
        lastLocation: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireDeviceOwnership(input.deviceId, ctx.user.openId);
      await recordHeartbeat(input.deviceId, input.appVersion);
      // Update location if provided
      if (input.lastLocation) {
        await upsertAppUser({
          deviceId: input.deviceId,
          openId: ctx.user.openId,
          lastLocation: input.lastLocation,
        });
      }
      return { success: true, timestamp: new Date().toISOString() };
    }),

  /**
   * Replace all synced alarms for a device.
   * Called whenever the alarm list changes (add/edit/delete).
   */
  syncAlarms: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        alarms: z.array(
          z.object({
            alarmId: z.string(),
            time: z.string().regex(/^\d{2}:\d{2}$/),
            description: z.string(),
            enabled: z.boolean(),
            repeat: z.enum(["daily", "weekdays", "weekends", "custom"]),
            customDays: z.array(z.number().min(0).max(6)).optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireDeviceOwnership(input.deviceId, ctx.user.openId);
      await replaceAllSyncedAlarms(input.deviceId, input.alarms);
      return { success: true, count: input.alarms.length };
    }),

  /**
   * Create a pending alarm event.
   * Called when an alarm is about to fire (before the countdown starts).
   * The server will resolve it if the device doesn't confirm within the grace period.
   */
  createEvent: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        alarmId: z.string(),
        alarmDescription: z.string(),
        scheduledAt: z.string(), // ISO string
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireDeviceOwnership(input.deviceId, ctx.user.openId);
      const id = await createAlarmEvent({
        deviceId: input.deviceId,
        alarmId: input.alarmId,
        alarmDescription: input.alarmDescription,
        scheduledAt: new Date(input.scheduledAt),
        status: "pending",
      });
      return { success: true, eventId: id };
    }),

  /**
   * Confirm an alarm event status.
   * Called after the user responds (responded) or the countdown expires (missed).
   */
  confirmEvent: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        alarmId: z.string(),
        scheduledAt: z.string(), // ISO string
        status: z.enum(["responded", "missed", "not_sent"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireDeviceOwnership(input.deviceId, ctx.user.openId);
      await updateAlarmEventStatusByAlarmId(
        input.deviceId,
        input.alarmId,
        new Date(input.scheduledAt),
        input.status
      );
      return { success: true };
    }),

  /**
   * Get alarm event history for a device.
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        limit: z.number().min(1).max(200).optional().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireDeviceOwnership(input.deviceId, ctx.user.openId);
      const events = await getAlarmEventHistory(input.deviceId, input.limit);
      return { events };
    }),

  /**
   * Get warning log for a device.
   */
  getWarnings: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        limit: z.number().min(1).max(100).optional().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireDeviceOwnership(input.deviceId, ctx.user.openId);
      const warnings = await getWarningHistory(input.deviceId, input.limit);
      return { warnings };
    }),

  /**
   * Get device profile (for debugging/settings display).
   * Scoped: returns null if the device is not owned by the current user.
   */
  getProfile: protectedProcedure
    .input(z.object({ deviceId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const user = await getAppUserForOwner(input.deviceId, ctx.user.openId);
      return { user };
    }),

  /**
   * Get monitoring status summary for the settings panel.
   * Returns last check-in time, synced alarm count, and recent event counts.
   */
  getStatus: protectedProcedure
    .input(z.object({ deviceId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      await requireDeviceOwnership(input.deviceId, ctx.user.openId);
      const [heartbeat, alarms, events] = await Promise.all([
        getLastHeartbeat(input.deviceId),
        getSyncedAlarms(input.deviceId),
        getAlarmEventHistory(input.deviceId, 30),
      ]);

      const respondedCount = events.filter((e) => e.status === "responded").length;
      const missedCount = events.filter((e) => e.status === "missed").length;
      const notSentCount = events.filter((e) => e.status === "not_sent").length;

      return {
        lastCheckIn: heartbeat?.lastSeenAt ?? null,
        syncedAlarmCount: alarms.length,
        enabledAlarmCount: alarms.filter((a) => a.enabled).length,
        recentEvents: { respondedCount, missedCount, notSentCount },
      };
    }),
});
