import type { NextFunction, Request, Response } from "express";
import { isAllowedOrigin } from "./env";

/**
 * CORS middleware with origin allowlisting.
 *
 * The previous implementation echoed `req.headers.origin` into
 * `Access-Control-Allow-Origin` while also enabling
 * `Access-Control-Allow-Credentials: true`. Combined with our
 * `SameSite=none` session cookie, this allowed any malicious origin to
 * make authenticated requests on behalf of the user (full CSRF surface
 * against every tRPC endpoint).
 *
 * The allowlist is configured via `CORS_ORIGIN_ALLOWLIST` env var.
 * Each entry is exact match or a prefix ending in `*`.
 * In dev (no allowlist set) we still accept localhost only.
 *
 * For unrecognized origins we DO NOT emit any `Allow-Origin` header,
 * so the browser blocks the response (and credentials never flow).
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (typeof origin === "string" && isAllowedOrigin(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
  }
  // No origin (same-origin request, server-to-server, native fetch
  // without Origin) — let it pass without CORS headers; auth still
  // applies via Authorization header / cookie.

  if (req.method === "OPTIONS") {
    if (typeof origin === "string" && !isAllowedOrigin(origin)) {
      // Preflight from a disallowed origin: refuse explicitly so the
      // attacker site can't pretend it received a CORS green light.
      res.status(403).end();
      return;
    }
    res.sendStatus(200);
    return;
  }
  next();
}
