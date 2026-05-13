/**
 * supabase.ts
 *
 * DEPRECATED — Direct Supabase access from the client was disabled for
 * security reasons (see lib/supabase-sync.ts for full context). The anon
 * key shipped in the client bundle combined with permissive RLS policies
 * exposed every user's data. All sync now goes through the authenticated
 * tRPC backend in server/routers-monitoring.ts.
 *
 * The `supabase` export is intentionally null so any leftover code that
 * tries to use it fails loudly rather than silently leaking data via
 * the anon key. Use the tRPC monitoring router instead.
 */

export const supabase: null = null;

export type Database = {
  public: { Tables: Record<string, never> };
};

/**
 * Always returns false — direct Supabase access from the client is
 * disabled. Kept exported for backwards compatibility with callers that
 * gate behavior on this flag.
 */
export function isSupabaseConfigured(): boolean {
  return false;
}
