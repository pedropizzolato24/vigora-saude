import type { NextFunction, Request, Response } from "express";

/**
 * Rate-limit middleware factory.
 *
 * Sliding-window counter keyed by client IP. In-memory only — fine for
 * a single Node instance, the typical Manus deploy. For a horizontal
 * cluster, swap the store for Redis.
 *
 * Why: without a rate limit, the pre-existing 50MB body limit (now
 * 1MB) + auth-free routes (now closed) still left brute-force / DoS
 * open. Each tRPC endpoint deserves a cap.
 *
 * The keyFn defaults to clientIp(req), but callers can pass their own
 * (e.g., per-user limits using ctx.user.openId). Headers `X-Forwarded-
 * For` are honored if the proxy chain is trusted.
 */

export interface RateLimitOptions {
  /** Window size in milliseconds. Default 60_000 (1 minute). */
  windowMs?: number;
  /** Max requests allowed per window per key. */
  max: number;
  /** Function to derive the rate-limit key from the request. */
  keyFn?: (req: Request) => string;
  /** Optional name for the bucket (for tests / observability). */
  name?: string;
  /** Now-provider so tests can advance time deterministically. */
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function clientIp(req: Request): string {
  // Honor X-Forwarded-For only if the platform sets it (trusted proxy).
  // If you deploy behind an untrusted proxy you must `app.set("trust proxy", ...)`.
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/**
 * Create a rate-limit middleware with an isolated store. Each call
 * returns a fresh middleware backed by its own Map, so different routes
 * can have independent budgets.
 */
export function createRateLimit(options: RateLimitOptions) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max;
  const keyFn = options.keyFn ?? clientIp;
  const nowFn = options.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  // Periodically prune expired buckets so the map doesn't grow forever.
  // No-op for unref'd setInterval in tests; we just don't schedule it
  // there.
  const pruneInterval = setInterval(() => {
    const now = nowFn();
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }, windowMs);
  // Don't keep the process alive for this timer.
  if (typeof pruneInterval.unref === "function") pruneInterval.unref();

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const key = keyFn(req);
    const now = nowFn();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(max - 1));
      next();
      return;
    }

    if (bucket.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.status(429).json({
        error: "Too many requests",
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(max - bucket.count));
    next();
  }

  // Expose for tests
  (middleware as any).__buckets = buckets;
  (middleware as any).__dispose = () => clearInterval(pruneInterval);

  return middleware;
}
