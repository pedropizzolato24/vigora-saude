import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// -----------------------------------------------------------------------------
// App Users - device registration (no Manus OAuth required)
// -----------------------------------------------------------------------------

export interface EmergencyContactRecord {
  id: string;
  name: string;
  phone: string;
  relation: string;
  whatsapp: boolean;
  /** Optional email address for fallback notifications (Email -> SMS) */
  email?: string;
}

export const appUsers = mysqlTable("app_users", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: varchar("deviceId", { length: 64 }).notNull().unique(),
  userName: varchar("userName", { length: 255 }),
  emergencyContacts: json("emergencyContacts").$type<EmergencyContactRecord[]>(),
  lastLocation: varchar("lastLocation", { length: 64 }),
  lastLocationAt: timestamp("lastLocationAt"),
  /** Expo push token for sending push notifications to this device */
  expoPushToken: varchar("expoPushToken", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppUser = typeof appUsers.$inferSelect;
export type InsertAppUser = typeof appUsers.$inferInsert;

// -----------------------------------------------------------------------------
// Synced Alarms - server-side copy of the user's alarm schedule
// -----------------------------------------------------------------------------

export const syncedAlarms = mysqlTable("synced_alarms", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: varchar("deviceId", { length: 64 }).notNull(),
  alarmId: varchar("alarmId", { length: 64 }).notNull(),
  time: varchar("time", { length: 5 }).notNull(),
  description: varchar("description", { length: 255 }).notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  repeat: mysqlEnum("repeat", ["daily", "weekdays", "weekends", "custom"]).notNull().default("daily"),
  customDays: json("customDays").$type<number[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SyncedAlarm = typeof syncedAlarms.$inferSelect;
export type InsertSyncedAlarm = typeof syncedAlarms.$inferInsert;

// -----------------------------------------------------------------------------
// Device Heartbeat - periodic "I'm alive" pings from the app
// -----------------------------------------------------------------------------

export const deviceHeartbeat = mysqlTable("device_heartbeat", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: varchar("deviceId", { length: 64 }).notNull().unique(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  appVersion: varchar("appVersion", { length: 32 }),
});

export type DeviceHeartbeat = typeof deviceHeartbeat.$inferSelect;
export type InsertDeviceHeartbeat = typeof deviceHeartbeat.$inferInsert;

// -----------------------------------------------------------------------------
// Alarm Events - audit log of every alarm occurrence
// -----------------------------------------------------------------------------

export const alarmEvents = mysqlTable("alarm_events", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: varchar("deviceId", { length: 64 }).notNull(),
  alarmId: varchar("alarmId", { length: 64 }).notNull(),
  alarmDescription: varchar("alarmDescription", { length: 255 }).notNull().default(""),
  scheduledAt: timestamp("scheduledAt").notNull(),
  status: mysqlEnum("status", ["pending", "responded", "missed", "not_sent"])
    .notNull()
    .default("pending"),
  resolvedAt: timestamp("resolvedAt"),
  warningSent: boolean("warningSent").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AlarmEvent = typeof alarmEvents.$inferSelect;
export type InsertAlarmEvent = typeof alarmEvents.$inferInsert;

// -----------------------------------------------------------------------------
// Warning Log - record of every warning message sent to contacts
// -----------------------------------------------------------------------------

export const warningLog = mysqlTable("warning_log", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: varchar("deviceId", { length: 64 }).notNull(),
  level: int("level").notNull().default(1),
  offlineHours: int("offlineHours").notNull(),
  contactsReached: int("contactsReached").notNull().default(0),
  locationIncluded: boolean("locationIncluded").notNull().default(false),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
});

export type WarningLog = typeof warningLog.$inferSelect;
export type InsertWarningLog = typeof warningLog.$inferInsert;

// -----------------------------------------------------------------------------
// Invite Codes - temporary codes generated by monitored users for caregivers
// -----------------------------------------------------------------------------

export const inviteCodes = mysqlTable("invite_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 6 }).notNull().unique(),
  monitoredDeviceId: varchar("monitoredDeviceId", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  caregiverDeviceId: varchar("caregiverDeviceId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InviteCode = typeof inviteCodes.$inferSelect;
export type InsertInviteCode = typeof inviteCodes.$inferInsert;

// -----------------------------------------------------------------------------
// Caregiving Links - active connections between monitored and caregiver devices
// -----------------------------------------------------------------------------

export const caregivingLinks = mysqlTable("caregiving_links", {
  id: int("id").autoincrement().primaryKey(),
  monitoredDeviceId: varchar("monitoredDeviceId", { length: 64 }).notNull(),
  caregiverDeviceId: varchar("caregiverDeviceId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CaregivingLink = typeof caregivingLinks.$inferSelect;
export type InsertCaregivingLink = typeof caregivingLinks.$inferInsert;
