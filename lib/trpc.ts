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
        // detects a rejected session (401 apenas) e manda o usuário reautenticar
        // — o mesmo safety net das chamadas de monitoring, pra uma tela de UI
        // batendo num token expirado não ficar só mostrando erro pra sempre.
        // 403 NÃO desloga (é "proibido desta ação", não "sessão inválida"):
        // ver isSessionExpiredStatus.
        async fetch(url, options) {
          // Diagnóstico (item 2 do feedback 27/07): o cuidador via 10–20s até os
          // dados carregarem. Loga o nome do procedure e o tempo de rede — só
          // isso, nunca o payload (dados de saúde, LGPD).
          const t0 = Date.now();
          const procedures =
            String(url).split("/api/trpc/")[1]?.split("?")[0] ?? "?";
          try {
            const res = await fetch(url, {
              ...options,
              credentials: "include",
            });
            console.log(`[Perf] trpc ${procedures}: ${Date.now() - t0}ms (${res.status})`);
            const Auth = await import("@/lib/_core/auth");
            if (Auth.isSessionExpiredStatus(res.status)) {
              Auth.handleUnauthorized().catch(() => {});
            }
            return res;
          } catch (err) {
            // Falha de rede é candidata #1 para o "às vezes 10–20s": o retry do
            // react-query só começa DEPOIS que esta promise rejeita.
            console.log(
              `[Perf] trpc ${procedures}: FALHOU após ${Date.now() - t0}ms —`,
              err instanceof Error ? err.message : String(err)
            );
            throw err;
          }
        },
      }),
    ],
  });
}
