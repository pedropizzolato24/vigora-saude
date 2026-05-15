import "dotenv/config";
import express from "express";
import { startMonitoringScheduler } from "../monitoring-job";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { corsMiddleware } from "./cors";
import { registerAuthRoutes } from "./oauth";
import { registerSupabaseAuthRoute } from "../supabase-auth";
import { createRateLimit } from "./rate-limit";
import { securityHeadersMiddleware } from "./security-headers";
import { appRouter } from "../routers";
import { createContext } from "./context";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Security headers (HSTS, X-Frame-Options, CSP, ...) on every response.
  app.use(securityHeadersMiddleware);

  // CORS: allowlist-based; rejects unknown origins. See ./cors.ts.
  app.use(corsMiddleware);

  // 1MB is plenty for normal tRPC payloads (alarm lists, contacts).
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // Auth endpoints — /api/auth/supabase exchanges a Supabase token for a
  // session JWT; the rest are session lifecycle (me / logout / cookie sync).
  app.use("/api/auth", createRateLimit({ max: 30, windowMs: 60_000 }));
  registerAuthRoutes(app);
  registerSupabaseAuthRoute(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // tRPC endpoints: 120 requests/minute/IP. Authenticated calls also
  // pass through per-procedure logic; this is the outer envelope.
  app.use(
    "/api/trpc",
    createRateLimit({ max: 120, windowMs: 60_000 }),
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
    startMonitoringScheduler();
  });
}

startServer().catch(console.error);
