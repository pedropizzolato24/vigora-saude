import "dotenv/config";
import express from "express";
import { startMonitoringScheduler, getMonitoringHealth } from "../monitoring-job";
import { checkDatabase } from "../db";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { corsMiddleware } from "./cors";
import { registerAuthRoutes } from "./oauth";
import { registerGoogleAuthRoute } from "../google-auth";
import { registerAppleAuthRoute } from "../apple-auth";
import { registerEmailAuthRoutes, isEmailServiceConfigured } from "../email-auth";
import { registerPhoneAuthRoutes, isPhoneLoginConfigured } from "../phone-auth";
import { createRateLimit } from "./rate-limit";
import { securityHeadersMiddleware } from "./security-headers";
import { assertRequiredSecrets } from "./env";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { renderInviteLanding } from "../invite-landing";

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
  assertRequiredSecrets();

  const app = express();
  const server = createServer(app);

  // Railway termina TLS num único proxy à frente do app. Confiar só nesse hop
  // faz req.ip refletir o IP real do cliente (e não o do proxy), reforçando os
  // rate limits por IP. A defesa principal contra bombing é o throttle por
  // destino (db-auth.canSendCode), independente de IP.
  app.set("trust proxy", 1);

  // Security headers (HSTS, X-Frame-Options, CSP, ...) on every response.
  app.use(securityHeadersMiddleware);

  // CORS: allowlist-based; rejects unknown origins. See ./cors.ts.
  app.use(corsMiddleware);

  // 1MB is plenty for normal tRPC payloads (alarm lists, contacts).
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // Deep-link association files for caregiver share invites
  // (https://<host>/convite/<token>). Served only when the platform IDs are
  // configured via env. Apple/Google fetch these directly (no auth, no CORS).
  app.get("/.well-known/apple-app-site-association", (_req, res) => {
    const teamId = process.env.APPLE_TEAM_ID;
    if (!teamId) {
      res.status(404).json({ error: "Universal Links not configured" });
      return;
    }
    res.type("application/json").json({
      applinks: {
        apps: [],
        details: [{ appID: `${teamId}.com.vigora.saude`, paths: ["/convite/*"] }],
      },
    });
  });

  app.get("/.well-known/assetlinks.json", (_req, res) => {
    const sha256 = process.env.ANDROID_CERT_SHA256;
    if (!sha256) {
      res.status(404).json([]);
      return;
    }
    // Accept comma-separated fingerprints (e.g. Play App Signing + upload key).
    const fingerprints = sha256.split(",").map((s) => s.trim()).filter(Boolean);
    res.type("application/json").json([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.vigora.saude",
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ]);
  });

  // "Instale o app" landing for invite links opened without the app installed
  // (or on desktop). With the app installed, the verified App/Universal Link
  // opens the app and this is never hit. Relax the API's strict CSP just enough
  // to render inline styles (the page has no external resources or scripts).
  app.get("/convite/:token", (req, res) => {
    const androidUrl =
      process.env.ANDROID_PLAY_STORE_URL ||
      "https://play.google.com/store/apps/details?id=com.vigora.saude";
    const iosUrl = process.env.IOS_APP_STORE_URL || undefined;
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"
    );
    res
      .type("html")
      .send(renderInviteLanding({ token: String(req.params.token ?? ""), iosUrl, androidUrl }));
  });

  // Auth endpoints — cada provedor (google/apple/email/phone) verifica a
  // credencial e emite o JWT de sessão; o resto é ciclo de vida da sessão
  // (me / logout / cookie sync). Rotas sensíveis têm limites próprios além
  // deste envelope.
  app.use("/api/auth", createRateLimit({ max: 30, windowMs: 60_000 }));
  registerAuthRoutes(app);
  registerGoogleAuthRoute(app);
  registerAppleAuthRoute(app);
  registerEmailAuthRoutes(app);
  registerPhoneAuthRoutes(app);

  // Quais métodos de login estão habilitados neste deploy — o app esconde
  // botões de métodos sem a infraestrutura configurada (Resend / template OTP).
  app.get("/api/auth/methods", (_req, res) => {
    res.json({
      google: true,
      apple: true,
      email: isEmailServiceConfigured(),
      phone: isPhoneLoginConfigured(),
    });
  });

  // Deep health check: an external uptime monitor can poll this and alert when
  // the DB is unreachable or the dead man's switch job has been failing/stale.
  // Returns 503 (not 200) when unhealthy so the monitor actually trips.
  app.get("/api/health", async (_req, res) => {
    const monitoringJob = getMonitoringHealth();
    const db = await checkDatabase();
    const ok = db && monitoringJob.healthy;
    res.status(ok ? 200 : 503).json({ ok, db, monitoringJob, timestamp: Date.now() });
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

startServer().catch((err) => {
  // Refuse to run half-initialized (e.g. missing JWT_SECRET in production):
  // log and exit non-zero so the platform flags the failed deploy.
  console.error(err);
  process.exit(1);
});
