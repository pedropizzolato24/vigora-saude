import type { Express, Request, Response } from "express";
import { sdk } from "./sdk";
import { ENV } from "./env";

/**
 * Authorize a storage path for a given user.
 *
 * SECURITY POLICY
 *   - The proxy previously redirected any path without auth, letting an
 *     attacker who guessed an object key (8-hex suffix) download files
 *     belonging to other users.
 *   - We now require an authenticated session AND enforce a
 *     per-user path namespace: `users/<openId>/...`.
 *   - Admins (role === "admin") may read any path under `users/` or
 *     `public/`.
 *   - Anonymous reads remain allowed ONLY under `public/` (assets
 *     intentionally shared like app icons).
 *
 * Exposed as a pure function for tests.
 */
export type StorageUser = {
  openId: string;
  role: "admin" | "user";
} | null;

export function isStoragePathAllowed(
  path: string,
  user: StorageUser
): boolean {
  // Reject obvious path traversal / empty
  if (!path || path.includes("..") || path.startsWith("/")) return false;

  if (path.startsWith("public/")) return true;

  if (!user) return false;
  if (user.role === "admin") return true;

  // Require exact namespace prefix
  return path.startsWith(`users/${user.openId}/`);
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req: Request, res: Response) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    // Authenticate (optional — public/ paths still allowed when anon)
    let user: StorageUser = null;
    try {
      const authedUser = await sdk.authenticateRequest(req);
      user = { openId: authedUser.openId, role: authedUser.role };
    } catch {
      user = null;
    }

    if (!isStoragePathAllowed(key, user)) {
      res.status(403).send("Forbidden");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
