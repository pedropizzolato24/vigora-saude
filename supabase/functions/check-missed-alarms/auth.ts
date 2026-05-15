/**
 * auth.ts — authorization for the check-missed-alarms edge function.
 *
 * The function processes sensitive data (escalates missed alarms to
 * emergency contacts via WhatsApp) and runs with SUPABASE_SERVICE_ROLE_KEY.
 * Previously it had `Deno.serve(async () => {...})` with no auth,
 * exposing a public endpoint that anyone could hammer to either trigger
 * mass-escalations or exhaust the WhatsApp Business quota.
 *
 * Now we require a shared secret in `X-Vigora-Cron-Secret` that matches
 * the env var CHECK_MISSED_ALARMS_SECRET. The Supabase cron job sets
 * this header; HTTP callers without it get 401.
 *
 * Extracted as a standalone module so we can unit-test the check from
 * Node (Vitest) without spinning up Deno.
 */

const SECRET_HEADER = "x-vigora-cron-secret";

/**
 * Reads the configured secret. We don't cache it because env may change
 * between deploys and the check happens only when the function is
 * invoked (low frequency).
 *
 * On Deno the secret comes from Deno.env.get; on Node (tests) we look at
 * process.env. We accept either so the same module loads in both.
 */
function getConfiguredSecret(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const denoEnv: { get(name: string): string | undefined } | undefined = (
    globalThis as any
  ).Deno?.env;
  if (denoEnv && typeof denoEnv.get === "function") {
    return denoEnv.get("CHECK_MISSED_ALARMS_SECRET") ?? "";
  }
  return process.env.CHECK_MISSED_ALARMS_SECRET ?? "";
}

/**
 * Constant-time string compare to avoid leaking the secret length via
 * response timing. JS doesn't expose a stdlib timing-safe compare in
 * Deno without `crypto.subtle.timingSafeEqual` (which isn't available
 * across all runtimes), so we implement it manually.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Returns null if the request is authorized; otherwise returns the
 * Response that should be sent back to the caller (401 / 503).
 *
 * - 503: server is misconfigured (secret not set). Fail closed.
 * - 401: caller did not present a valid secret.
 */
export function authorizeRequest(req: Request): Response | null {
  const configured = getConfiguredSecret();
  if (!configured) {
    // Refuse to run without a configured secret — defense in depth so a
    // misconfigured deploy doesn't silently expose the endpoint.
    return new Response(
      JSON.stringify({ error: "CHECK_MISSED_ALARMS_SECRET not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  const supplied = req.headers.get(SECRET_HEADER);
  if (!supplied || !timingSafeEqual(supplied, configured)) {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}

// Exported for tests
export const __testing = { timingSafeEqual, getConfiguredSecret, SECRET_HEADER };
