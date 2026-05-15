/**
 * supabase-sync.ts
 *
 * DEPRECATED — Direct Supabase access from the client was abandoned for
 * security reasons: the previous schema had `policy ... using (true)` for
 * every table, which combined with the public anon key (shipped in the
 * APK / web bundle) allowed anyone to read/write every user's emergency
 * contacts, alarms and locations.
 *
 * The dead-man's-switch functionality lives now under
 * `server/routers-monitoring.ts` (authenticated tRPC). The functions
 * below remain as no-op stubs so callers don't crash; they will be
 * removed in a future cleanup pass.
 *
 * If you NEED Supabase access in the future, do it through the server
 * backend (which already has `SUPABASE_SERVICE_ROLE_KEY`) — never with
 * the anon key from the client.
 */

import type { Alarm, EmergencyContact } from './app-context';

/**
 * Stub. Returns null so the rest of app-context skips dependent effects.
 */
export async function syncUser(_name?: string): Promise<string | null> {
  return null;
}

/** Stub */
export async function syncAlarms(_userId: string, _alarms: Alarm[]): Promise<void> {
  // no-op
}

/** Stub */
export async function createAlarmEvent(
  _userId: string,
  _alarmLocalId: string,
  _scheduledAt: Date
): Promise<string | null> {
  return null;
}

/** Stub */
export async function respondToAlarmEvent(
  _eventId: string,
  _responseType: 'dismissed' | 'snoozed'
): Promise<void> {
  // no-op
}

/** Stub */
export async function syncEmergencyContacts(
  _userId: string,
  _contacts: EmergencyContact[]
): Promise<void> {
  // no-op
}

/** Stub */
export async function sendHeartbeat(_userId: string): Promise<void> {
  // no-op
}
