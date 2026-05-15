/**
 * query.ts — pure query helpers for check-missed-alarms.
 *
 * Previously the edge function did:
 *   .select("..., emergency_contacts(name, phone, whatsapp)")
 * straight from alarm_events. Since alarm_events has no FK to
 * emergency_contacts, PostgREST tries to embed via users; the result is
 * ambiguous and could match the WRONG user's contacts (or simply return
 * empty). To make this provably correct AND testable from Node we:
 *
 *   1. Fetch alarm_events with their user/alarm via direct FKs.
 *   2. Separately fetch emergency_contacts keyed by user_id.
 *   3. Stitch the two together in pure JS.
 *
 * The supabase client is passed in as a minimal `MissedEventStore`
 * interface so we can swap it for a mock in tests.
 */

export interface MissedEvent {
  id: string;
  user_id: string;
  scheduled_at: string;
  alarm_id: string;
  alarms?: { description?: string } | null;
  users?: { name?: string } | null;
}

export interface Contact {
  user_id: string;
  name: string;
  phone: string;
  whatsapp: boolean;
}

export interface EnrichedMissedEvent extends MissedEvent {
  contacts: Contact[];
}

/**
 * Minimal interface implementing only what query.ts needs from the
 * supabase client. Lets tests provide a hand-rolled mock.
 */
export interface MissedEventStore {
  findMissedEvents(beforeIso: string): Promise<MissedEvent[]>;
  findContactsByUserIds(userIds: string[]): Promise<Contact[]>;
}

/**
 * Returns missed events with their contacts attached. The output is
 * stable: each event has a (possibly empty) contacts array and
 * contacts are unique per event by (user_id, phone).
 */
export async function loadMissedEventsWithContacts(
  store: MissedEventStore,
  beforeIso: string
): Promise<EnrichedMissedEvent[]> {
  const events = await store.findMissedEvents(beforeIso);
  if (events.length === 0) return [];

  const uniqueUserIds = Array.from(new Set(events.map((e) => e.user_id)));
  const allContacts = await store.findContactsByUserIds(uniqueUserIds);

  // Index contacts by user_id, deduplicated by phone
  const byUser = new Map<string, Map<string, Contact>>();
  for (const c of allContacts) {
    if (!c.user_id || !c.phone) continue;
    let bucket = byUser.get(c.user_id);
    if (!bucket) {
      bucket = new Map();
      byUser.set(c.user_id, bucket);
    }
    if (!bucket.has(c.phone)) bucket.set(c.phone, c);
  }

  return events.map((e) => ({
    ...e,
    contacts: Array.from(byUser.get(e.user_id)?.values() ?? []),
  }));
}

/**
 * Filter to WhatsApp-enabled contacts only. Pure helper, kept here for
 * test discoverability.
 */
export function filterWhatsAppContacts(contacts: Contact[]): Contact[] {
  return contacts.filter((c) => c.whatsapp === true);
}
