import {
  bigint,
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  unique,
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
  /** OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  /**
   * Verified e-mail, the canonical account-linking key (same e-mail = same
   * account). Unique so a concurrent first-login race can't create two
   * accounts for one e-mail — MySQL allows multiple NULLs, so phone-only and
   * Apple "hide my email" accounts (no e-mail) are unaffected.
   */
  email: varchar("email", { length: 320 }),
  /** User-provided phone number, collected during registration. */
  phone: varchar("phone", { length: 32 }),
  /**
   * Account type chosen during registration. `null` means the user logged in
   * via OAuth but hasn't completed the registration form yet — the app routes
   * them to /register instead of /(tabs).
   */
  userType: mysqlEnum("userType", ["caregiver", "monitored"]),
  /** Date of birth as the user typed it ("DD/MM/YYYY"). Free text — we don't parse server-side. */
  birthDate: varchar("birthDate", { length: 16 }),
  /** Blood type tag e.g. "A+", "O-". Free text so future formats don't require a migration. */
  bloodType: varchar("bloodType", { length: 8 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, (t) => [unique("users_email_uq").on(t.email)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// -----------------------------------------------------------------------------
// User Data - per-account cloud backup of the whole app state
// -----------------------------------------------------------------------------

/**
 * Mirror of the client's AppState slices that should survive a reinstall.
 * Keyed by `openId` (the Google account), independent of device. The app
 * pushes a snapshot whenever local data changes and pulls it on login,
 * resolving conflicts by `dataUpdatedAt` (last write wins).
 *
 * Blobs are stored opaquely as JSON — the client owns their shape. Validation
 * happens at the tRPC boundary, and access is always scoped to the
 * authenticated user, so we don't re-model each field server-side.
 */
export const userData = mysqlTable("user_data", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  anamnesis: json("anamnesis").$type<Record<string, unknown> | null>(),
  emergencyContacts: json("emergencyContacts").$type<unknown[]>(),
  alarms: json("alarms").$type<unknown[]>(),
  settings: json("settings").$type<Record<string, unknown> | null>(),
  healthMetrics: json("healthMetrics").$type<unknown[]>(),
  profile: json("profile").$type<Record<string, unknown> | null>(),
  /** Client-supplied epoch-ms of the last local data change. Drives last-write-wins. */
  dataUpdatedAt: bigint("dataUpdatedAt", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserData = typeof userData.$inferSelect;
export type InsertUserData = typeof userData.$inferInsert;

// -----------------------------------------------------------------------------
// Emergency contacts - shape of the contact records stored in user_data
// -----------------------------------------------------------------------------

export interface EmergencyContactRecord {
  id: string;
  name: string;
  phone: string;
  relation: string;
  whatsapp: boolean;
  /** Optional email address, collected for the contact card (not used for alerts). */
  email?: string;
  /**
   * Whether this contact agreed to receive automatic emergency alerts
   * (ANATEL opt-in). The automatic dead man's switch only messages contacts
   * where this is not explicitly false; legacy contacts (undefined) are
   * grandfathered as consented. Manual SOS (user-initiated) is not gated.
   */
  consentToAlerts?: boolean;
}

// -----------------------------------------------------------------------------
// Account Liveness - "the person is responding" signal, one row per ACCOUNT
// -----------------------------------------------------------------------------

/**
 * Liveness da conta (não do aparelho): última vez que QUALQUER aparelho da
 * conta deu sinal. É o que o dead man's switch consulta em repouso. O
 * `lastDeviceId` é só metadado (gancho p/ multi-device/wearables futuros) —
 * nunca chave de posse. Ver docs/design/2026-07-12-monitoring-account-ownership.md.
 */
export const accountLiveness = mysqlTable("account_liveness", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  lastLocation: varchar("lastLocation", { length: 64 }),
  lastLocationAt: timestamp("lastLocationAt"),
  lastDeviceId: varchar("lastDeviceId", { length: 64 }),
  appVersion: varchar("appVersion", { length: 32 }),
  // Telemetria (Android): isenção de otimização de bateria ativa no último
  // sinal. null = sem informação (iOS/clientes antigos). Mede a fração da base
  // vulnerável ao modo de falha "app morto em background = alarme não toca" e
  // é o gancho para, no futuro, alertar o cuidador de um monitorado vulnerável.
  batteryExempt: boolean("batteryExempt"),
});

export type AccountLiveness = typeof accountLiveness.$inferSelect;
export type InsertAccountLiveness = typeof accountLiveness.$inferInsert;

// -----------------------------------------------------------------------------
// Alarm Events - audit log of every alarm occurrence
// -----------------------------------------------------------------------------

export const alarmEvents = mysqlTable(
  "alarm_events",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull(),
    alarmId: varchar("alarmId", { length: 64 }).notNull(),
    alarmDescription: varchar("alarmDescription", { length: 255 }).notNull().default(""),
    scheduledAt: timestamp("scheduledAt").notNull(),
    /**
     * Nome IANA do fuso do aparelho quando o evento foi criado (ex.:
     * "America/Rio_Branco"). Snapshot por evento — se a pessoa viajar, os
     * eventos antigos mantêm o fuso em que dispararam. Usado só para EXIBIR o
     * horário nas escalações; scheduledAt continua sendo instante absoluto.
     * Null nas linhas anteriores a esta coluna → fallback America/Sao_Paulo.
     */
    timezone: varchar("timezone", { length: 64 }),
    status: mysqlEnum("status", ["pending", "responded", "missed", "not_sent"])
      .notNull()
      .default("pending"),
    resolvedAt: timestamp("resolvedAt"),
    warningSent: boolean("warningSent").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("alarm_events_openid_idx").on(t.openId)]
);

export type AlarmEvent = typeof alarmEvents.$inferSelect;
export type InsertAlarmEvent = typeof alarmEvents.$inferInsert;

// -----------------------------------------------------------------------------
// Warning Log - record of every warning message sent to contacts
// -----------------------------------------------------------------------------

export const warningLog = mysqlTable(
  "warning_log",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull(),
    level: int("level").notNull().default(1),
    offlineHours: int("offlineHours").notNull(),
    contactsReached: int("contactsReached").notNull().default(0),
    locationIncluded: boolean("locationIncluded").notNull().default(false),
    sentAt: timestamp("sentAt").defaultNow().notNull(),
  },
  (t) => [index("warning_log_openid_idx").on(t.openId)]
);

export type WarningLog = typeof warningLog.$inferSelect;
export type InsertWarningLog = typeof warningLog.$inferInsert;

// -----------------------------------------------------------------------------
// Caregiver Links - persistent monitored <-> caregiver relationship
// -----------------------------------------------------------------------------

/**
 * One row per (caregiver, monitored) pairing. Keyed by the two accounts'
 * `openId`s (the Google account id), independent of device. A pairing is
 * established when a caregiver redeems an invite the monitored person
 * generated — the invite code itself is the monitored person's consent, so
 * the link is created directly as `active`.
 *
 * Either side can `revoke` the link (LGPD Art. 18 — the data subject must be
 * able to revoke a caregiver's access at any time). Revoked rows are kept for
 * audit but are excluded from all data-access checks (`assertActiveLink`).
 */
export const caregiverLinks = mysqlTable(
  "caregiver_links",
  {
    id: int("id").autoincrement().primaryKey(),
    caregiverOpenId: varchar("caregiverOpenId", { length: 64 }).notNull(),
    monitoredOpenId: varchar("monitoredOpenId", { length: 64 }).notNull(),
    /** Caregiver-chosen display name for the monitored person (nickname). */
    displayName: varchar("displayName", { length: 255 }),
    /** Caregiver-chosen relationship label ("Mãe", "Pai", ...). */
    relationship: varchar("relationship", { length: 64 }),
    /** How the link was established. `invite_link` is reserved for the future caregiver-initiated flow. */
    method: mysqlEnum("method", ["code", "qr", "invite_link"]).notNull().default("code"),
    status: mysqlEnum("status", ["active", "revoked"]).notNull().default("active"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    revokedAt: timestamp("revokedAt"),
  },
  (t) => [
    unique("caregiver_links_pair_unq").on(t.caregiverOpenId, t.monitoredOpenId),
    index("caregiver_links_monitored_idx").on(t.monitoredOpenId),
    index("caregiver_links_caregiver_idx").on(t.caregiverOpenId),
  ]
);

export type CaregiverLink = typeof caregiverLinks.$inferSelect;
export type InsertCaregiverLink = typeof caregiverLinks.$inferInsert;

// -----------------------------------------------------------------------------
// Link Invites - short-lived, single-use codes used to establish a link
// -----------------------------------------------------------------------------

/**
 * Ephemeral invite codes. Generic in both directions so the same table backs
 * the current monitored-generated code flow and the future caregiver-generated
 * deep-link flow:
 *   - `createdByRole = 'monitored'`: the monitored person generated a 6-char
 *     code; a caregiver redeems it.
 *   - `createdByRole = 'caregiver'`: (future) the caregiver generated an
 *     opaque token shared via a link; the monitored person accepts it.
 *
 * Codes are crypto-random, expire after a few minutes, and are single-use
 * (`consumedAt` set on redemption). The pairing they create lives in
 * `caregiver_links`.
 */
export const linkInvites = mysqlTable(
  "link_invites",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 16 }).notNull(),
    createdByOpenId: varchar("createdByOpenId", { length: 64 }).notNull(),
    createdByRole: mysqlEnum("createdByRole", ["monitored", "caregiver"]).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    consumedByOpenId: varchar("consumedByOpenId", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("link_invites_code_idx").on(t.code)]
);

export type LinkInvite = typeof linkInvites.$inferSelect;
export type InsertLinkInvite = typeof linkInvites.$inferInsert;

// -----------------------------------------------------------------------------
// Push Tokens - Expo push tokens for delivering alerts to a user's devices
// -----------------------------------------------------------------------------

/**
 * One row per device push token. Keyed by the account `openId` so the
 * monitoring job can look up every device a linked caregiver is signed in on
 * and deliver an in-app alert (the real-time companion to the WhatsApp
 * escalation that targets emergency contacts).
 *
 * The Expo token itself is unique — a device that re-registers updates its
 * existing row rather than creating a duplicate. Tokens that Expo reports as
 * `DeviceNotRegistered` are pruned on the next send.
 */
export const pushTokens = mysqlTable(
  "push_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    platform: mysqlEnum("platform", ["ios", "android", "web"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("push_tokens_openid_idx").on(t.openId)]
);

export type PushToken = typeof pushTokens.$inferSelect;
export type InsertPushToken = typeof pushTokens.$inferInsert;

// -----------------------------------------------------------------------------
// Auth Identities - multiple login methods linked to one canonical account
// -----------------------------------------------------------------------------

/**
 * One row per (provider, subject) credential. Several identities can point at
 * the same canonical account (`openId`), which is what keeps "same verified
 * e-mail = same account" true across Google, Apple and e-mail+password logins.
 *
 * `subject` is the provider's stable identifier: the OAuth `sub` for
 * google/apple, the normalized (lowercased) e-mail for `email`, the
 * digits-only E.164 number for `phone`.
 *
 * Legacy note: accounts created before this table exist only in `users`
 * (openId = `google:<sub>`); the resolver backfills their identity row on the
 * next login.
 */
export const authIdentities = mysqlTable(
  "auth_identities",
  {
    id: int("id").autoincrement().primaryKey(),
    provider: mysqlEnum("provider", ["google", "apple", "email", "phone"]).notNull(),
    subject: varchar("subject", { length: 320 }).notNull(),
    /** Canonical account this credential signs into (users.openId). */
    openId: varchar("openId", { length: 64 }).notNull(),
    /** scrypt hash (`scrypt:N:r:p:salt:hash`). Only set for provider = 'email'. */
    passwordHash: varchar("passwordHash", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    unique("auth_identities_provider_subject_uq").on(t.provider, t.subject),
    index("auth_identities_openid_idx").on(t.openId),
  ]
);

export type AuthIdentity = typeof authIdentities.$inferSelect;
export type InsertAuthIdentity = typeof authIdentities.$inferInsert;

/**
 * Short-lived 6-digit codes for e-mail verification, password reset and phone
 * OTP. One active code per (purpose, target) — requesting a new code replaces
 * the previous one. `codeHash` is sha256(`${target}:${code}`); `attempts`
 * caps brute-force at the row level (on top of the per-IP rate limit).
 *
 * For `purpose = 'signup'` the payload carries the pending account data
 * ({ passwordHash, name }) so nothing is created before the e-mail is proven.
 */
export const authCodes = mysqlTable(
  "auth_codes",
  {
    id: int("id").autoincrement().primaryKey(),
    purpose: mysqlEnum("purpose", ["signup", "reset", "phone"]).notNull(),
    /** Normalized e-mail or digits-only phone the code was sent to. */
    target: varchar("target", { length: 320 }).notNull(),
    codeHash: varchar("codeHash", { length: 64 }).notNull(),
    payload: json("payload").$type<Record<string, unknown> | null>(),
    attempts: int("attempts").notNull().default(0),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [unique("auth_codes_purpose_target_uq").on(t.purpose, t.target)]
);

export type AuthCode = typeof authCodes.$inferSelect;
export type InsertAuthCode = typeof authCodes.$inferInsert;
