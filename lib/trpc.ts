import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

/**
 * tRPC React client for type-safe API calls.
 *
 * IMPORTANT (tRPC v11): The `transformer` must be inside `httpBatchLink`,
 * NOT at the root createClient level. This ensures client and server
 * use the same serialization format (superjson).
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Creates the tRPC client with proper configuration.
 * Call this once in your app's root layout.
 */
export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,
        // tRPC v11: transformer MUST be inside httpBatchLink, not at root
        transformer: superjson,
        async headers() {
          const token = await Auth.getSessionToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        // Custom fetch to include credentials for cookie-based auth. Also
        // detects a rejected session (401/403) and routes the user back to
        // login — the same safety net the monitoring calls use, so a UI screen
        // hitting an expired token doesn't just show an error forever.
        async fetch(url, options) {
          const res = await fetch(url, {
            ...options,
            credentials: "include",
          });
          if (res.status === 401 || res.status === 403) {
            const Auth = await import("@/lib/_core/auth");
            Auth.handleUnauthorized().catch(() => {});
          }
          return res;
        },
      }),
    ],
  });
}
