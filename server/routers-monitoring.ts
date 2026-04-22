/**
 * routers-monitoring.ts
 *
 * tRPC routes for the server-side alarm monitoring system.
 *
 * Routes:
 *   monitoring.register        — Register/update device (deviceId, userName, contacts, location)
 *   monitoring.heartbeat       — Send "I'm alive" ping
 *   monitoring.syncAlarms      — Replace all synced alarms for a device
 *   monitoring.createEvent     — Create a pending alarm event (alarm is about to fire)
 *   monitoring.confirmEvent    — Confirm alarm as responded/missed/not_sent
 *   monitoring.getHistory      — Get alarm event history for a device
 *   monitoring.getWarnings     — Get warning log for a device
 */
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import {
  createAlarmEvent,
  getAlarmEventHistory,
  getAppUser,
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
});

export const monitoringRouter = router({
  /**
   * Register or update a device profile.
   * Called on app startup and whenever contacts/name change.
   */
  register: publicProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        userName: z.string().optional(),
        emergencyContacts: z.array(emergencyContactSchema).optional(),
        lastLocation: z.string().optional(), // "lat,lng"
      })
    )
    .mutation(async ({ input }) => {
      await upsertAppUser({
        deviceId: input.deviceId,
        userName: input.userName,
        emergencyContacts: input.emergencyContacts,
        lastLocation: input.lastLocation,
      });
      return { success: true };
    }),

  /**
   * Send a heartbeat ping. Called every 5 minutes while app is active.
   */
  heartbeat: publicProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        appVersion: z.string().optional(),
        lastLocation: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await recordHeartbeat(input.deviceId, input.appVersion);
      // Update location if provided
      if (input.lastLocation) {
        await upsertAppUser({
          deviceId: input.deviceId,
          lastLocation: input.lastLocation,
        });
      }
      return { success: true, timestamp: new Date().toISOString() };
    }),

  /**
   * Replace all synced alarms for a device.
   * Called whenever the alarm list changes (add/edit/delete).
   */
  syncAlarms: publicProcedure
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
    .mutation(async ({ input }) => {
      await replaceAllSyncedAlarms(input.deviceId, input.alarms);
      return { success: true, count: input.alarms.length };
    }),

  /**
   * Create a pending alarm event.
   * Called when an alarm is about to fire (before the countdown starts).
   * The server will resolve it if the device doesn't confirm within the grace period.
   */
  createEvent: publicProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        alarmId: z.string(),
        alarmDescription: z.string(),
        scheduledAt: z.string(), // ISO string
      })
    )
    .mutation(async ({ input }) => {
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
  confirmEvent: publicProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        alarmId: z.string(),
        scheduledAt: z.string(), // ISO string
        status: z.enum(["responded", "missed", "not_sent"]),
      })
    )
    .mutation(async ({ input }) => {
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
  getHistory: publicProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        limit: z.number().min(1).max(200).optional().default(50),
      })
    )
    .query(async ({ input }) => {
      const events = await getAlarmEventHistory(input.deviceId, input.limit);
      return { events };
    }),

  /**
   * Get warning log for a device.
   */
  getWarnings: publicProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(64),
        limit: z.number().min(1).max(100).optional().default(20),
      })
    )
    .query(async ({ input }) => {
      const warnings = await getWarningHistory(input.deviceId, input.limit);
      return { warnings };
    }),

  /**
   * Get device profile (for debugging/settings display).
   */
  getProfile: publicProcedure
    .input(z.object({ deviceId: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const user = await getAppUser(input.deviceId);
      return { user };
    }),
});
