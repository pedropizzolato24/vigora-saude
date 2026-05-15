/**
 * supabase.lockdown.test.ts
 *
 * Verifies that direct Supabase access from the client is disabled.
 * Previously the anon key + permissive RLS (`for all using (true)`)
 * allowed anyone holding the anon key (everyone — it ships in the
 * bundle) to read/write every user's contacts, alarms and locations.
 *
 * After lockdown:
 *   - `supabase` export is null
 *   - `isSupabaseConfigured()` always returns false
 *   - All sync helpers are no-ops
 *   - The SQL schema must use `revoke ... from anon, authenticated`
 *     and not contain `using (true)` policies.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { supabase, isSupabaseConfigured } from "../lib/supabase";
import * as supabaseSync from "../lib/supabase-sync";

describe("Supabase client lockdown", () => {
  it("supabase client export is null (no direct access)", () => {
    expect(supabase).toBeNull();
  });

  it("isSupabaseConfigured always returns false", () => {
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("syncUser is a no-op returning null", async () => {
    const result = await supabaseSync.syncUser("Alice");
    expect(result).toBeNull();
  });

  it("syncAlarms is a no-op", async () => {
    await expect(supabaseSync.syncAlarms("user-1", [])).resolves.toBeUndefined();
  });

  it("syncEmergencyContacts is a no-op", async () => {
    await expect(
      supabaseSync.syncEmergencyContacts("user-1", [])
    ).resolves.toBeUndefined();
  });

  it("sendHeartbeat is a no-op", async () => {
    await expect(supabaseSync.sendHeartbeat("user-1")).resolves.toBeUndefined();
  });

  it("createAlarmEvent is a no-op returning null", async () => {
    const id = await supabaseSync.createAlarmEvent("u", "a", new Date());
    expect(id).toBeNull();
  });
});

describe("Supabase schema lockdown", () => {
  const schema = readFileSync(
    join(__dirname, "..", "supabase", "schema.sql"),
    "utf-8"
  );

  it("does not contain the permissive 'for all using (true)' policies", () => {
    expect(schema).not.toMatch(/for\s+all\s+using\s*\(\s*true\s*\)/i);
  });

  it("revokes access from anon role on all sensitive tables", () => {
    expect(schema).toMatch(/revoke all on public\.users\s+from anon/i);
    expect(schema).toMatch(/revoke all on public\.alarms\s+from anon/i);
    expect(schema).toMatch(/revoke all on public\.alarm_events\s+from anon/i);
    expect(schema).toMatch(
      /revoke all on public\.emergency_contacts\s+from anon/i
    );
  });

  it("enables row level security on all sensitive tables", () => {
    expect(schema).toMatch(/alter table public\.users\s+enable row level security/i);
    expect(schema).toMatch(/alter table public\.alarms\s+enable row level security/i);
    expect(schema).toMatch(
      /alter table public\.alarm_events\s+enable row level security/i
    );
    expect(schema).toMatch(
      /alter table public\.emergency_contacts\s+enable row level security/i
    );
  });
});
