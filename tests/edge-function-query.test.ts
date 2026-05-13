/**
 * edge-function-query.test.ts
 *
 * Validates Fix #14: the rewritten missed-events query no longer relies
 * on PostgREST's ambiguous embedded join between alarm_events and
 * emergency_contacts (which had no FK). Instead we fetch events and
 * contacts separately, then stitch by user_id in JS.
 *
 * We test the pure stitcher with a hand-rolled MissedEventStore mock.
 */
import { describe, expect, it } from "vitest";
import {
  filterWhatsAppContacts,
  loadMissedEventsWithContacts,
  type Contact,
  type MissedEvent,
  type MissedEventStore,
} from "../supabase/functions/check-missed-alarms/query";

function makeStore(opts: {
  events: MissedEvent[];
  contacts: Contact[];
}): MissedEventStore {
  return {
    async findMissedEvents() {
      return opts.events;
    },
    async findContactsByUserIds(ids: string[]) {
      const set = new Set(ids);
      return opts.contacts.filter((c) => set.has(c.user_id));
    },
  };
}

const aliceContact: Contact = {
  user_id: "alice",
  name: "Mom",
  phone: "11999999999",
  whatsapp: true,
};

const aliceContact2: Contact = {
  user_id: "alice",
  name: "Dad",
  phone: "11888888888",
  whatsapp: false,
};

const malloryContact: Contact = {
  user_id: "mallory",
  name: "Attacker buddy",
  phone: "11777777777",
  whatsapp: true,
};

describe("loadMissedEventsWithContacts", () => {
  it("returns empty list when there are no missed events", async () => {
    const out = await loadMissedEventsWithContacts(
      makeStore({ events: [], contacts: [aliceContact] }),
      new Date().toISOString()
    );
    expect(out).toEqual([]);
  });

  it("attaches ONLY the event-owner's contacts, never another user's", async () => {
    const event: MissedEvent = {
      id: "e1",
      user_id: "alice",
      scheduled_at: new Date().toISOString(),
      alarm_id: "a1",
      alarms: { description: "Medication" },
      users: { name: "Alice" },
    };
    const out = await loadMissedEventsWithContacts(
      makeStore({
        events: [event],
        contacts: [aliceContact, aliceContact2, malloryContact],
      }),
      new Date().toISOString()
    );
    expect(out).toHaveLength(1);
    const phones = out[0].contacts.map((c) => c.phone);
    expect(phones).toContain(aliceContact.phone);
    expect(phones).toContain(aliceContact2.phone);
    expect(phones).not.toContain(malloryContact.phone); // ← the bug we're fixing
  });

  it("deduplicates contacts by phone within a single event", async () => {
    const dup: Contact = { ...aliceContact };
    const out = await loadMissedEventsWithContacts(
      makeStore({
        events: [
          {
            id: "e1",
            user_id: "alice",
            scheduled_at: new Date().toISOString(),
            alarm_id: "a1",
          },
        ],
        contacts: [aliceContact, dup, aliceContact2],
      }),
      new Date().toISOString()
    );
    const phones = out[0].contacts.map((c) => c.phone);
    expect(phones.length).toBe(new Set(phones).size);
  });

  it("scopes contacts per event correctly across multiple users", async () => {
    const out = await loadMissedEventsWithContacts(
      makeStore({
        events: [
          {
            id: "e1",
            user_id: "alice",
            scheduled_at: new Date().toISOString(),
            alarm_id: "a1",
          },
          {
            id: "e2",
            user_id: "mallory",
            scheduled_at: new Date().toISOString(),
            alarm_id: "a2",
          },
        ],
        contacts: [aliceContact, aliceContact2, malloryContact],
      }),
      new Date().toISOString()
    );
    const aliceEvt = out.find((e) => e.id === "e1")!;
    const malloryEvt = out.find((e) => e.id === "e2")!;
    expect(aliceEvt.contacts.every((c) => c.user_id === "alice")).toBe(true);
    expect(malloryEvt.contacts.every((c) => c.user_id === "mallory")).toBe(true);
  });

  it("returns an event with empty contacts when the user has none", async () => {
    const out = await loadMissedEventsWithContacts(
      makeStore({
        events: [
          {
            id: "e1",
            user_id: "alice",
            scheduled_at: new Date().toISOString(),
            alarm_id: "a1",
          },
        ],
        contacts: [], // no contacts for anyone
      }),
      new Date().toISOString()
    );
    expect(out[0].contacts).toEqual([]);
  });
});

describe("filterWhatsAppContacts", () => {
  it("keeps only the contacts with whatsapp=true", () => {
    const out = filterWhatsAppContacts([aliceContact, aliceContact2]);
    expect(out).toEqual([aliceContact]);
  });

  it("returns empty when no contacts have whatsapp enabled", () => {
    const out = filterWhatsAppContacts([aliceContact2]);
    expect(out).toEqual([]);
  });
});
