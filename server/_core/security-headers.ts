import type { NextFunction, Request, Response } from "express";

/**
 * Security-headers middleware.
 *
 * The server previously sent no security headers, which combined with
 * the (now-fixed) reflective CORS and SameSite=none cookie meant the
 * UI was embeddable in any iframe (clickjacking) and lacked HSTS
 * (downgrade attacks possible on HTTPS).
 *
 * Implemented manually instead of adding helmet to keep the dependency
 * surface small and unit-testable without booting express.
 */
export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  // No MIME-type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Disallow framing (clickjacking). The API is JSON-only — no embed reason.
  res.setHeader("X-Frame-Options", "DENY");

  // Don't leak full URL across origins
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Force HTTPS for a year (preload-eligible). 1 year matches the
  // recommendation in https://hstspreload.org/.
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );

  // Disable powerful browser features for this origin — the API
  // doesn't need camera/mic/geolocation in the response context.
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  // Cross-Origin-* protections (Spectre-class isolation).
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");

  // Content-Security-Policy for JSON responses: deny everything by default.
  // This is a defense-in-depth header; a JSON response won't render
  // HTML, but if something ever does, we don't want it executing.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'"
  );

  next();
}
