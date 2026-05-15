/**
 * supabase.lockdown.test.ts
 *
 * The Supabase client is now used for Auth (signInWithOAuth) only. Direct
 * data table access from the client remains forbidden — RLS on every
 * sensitive table prevents the anon key (which ships in every build) from
 * being abused to read or write any user's records.
 *
 * These tests pin the SQL schema invariants that keep that guarantee.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Supabase schema lockdown", () => {
  const schema = readFileSync(
    join(__dirname, "..", "supabase", "schema.sql"),
    "utf-8",
  );

  it("does not contain the permissive 'for all using (true)' policies", () => {
    expect(schema).not.toMatch(/for\s+all\s+using\s*\(\s*true\s*\)/i);
  });

  it("revokes access from anon role on all sensitive tables", () => {
    expect(schema).toMatch(/revoke all on public\.users\s+from anon/i);
    expect(schema).toMatch(/revoke all on public\.alarms\s+from anon/i);
    expect(schema).toMatch(/revoke all on public\.alarm_events\s+from anon/i);
    expect(schema).toMatch(
      /revoke all on public\.emergency_contacts\s+from anon/i,
    );
  });

  it("enables row level security on all sensitive tables", () => {
    expect(schema).toMatch(/alter table public\.users\s+enable row level security/i);
    expect(schema).toMatch(/alter table public\.alarms\s+enable row level security/i);
    expect(schema).toMatch(
      /alter table public\.alarm_events\s+enable row level security/i,
    );
    expect(schema).toMatch(
      /alter table public\.emergency_contacts\s+enable row level security/i,
    );
  });
});
