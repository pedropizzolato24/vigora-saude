import { getApiBaseUrl } from "./oauth";

/**
 * Base origin for share-invite links. Must be an https Universal Link / App
 * Link domain so the link is clickable in WhatsApp and opens the app.
 *
 * Priority:
 * 1. `EXPO_PUBLIC_LINK_BASE_URL` (e.g. https://app.vigorasaude.com)
 * 2. The API origin (works if the same domain serves the .well-known files)
 * 3. The custom scheme as a last resort (opens only if installed; NOT clickable
 *    in chat apps — dev fallback only).
 */
export function getInviteLinkBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_LINK_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const api = getApiBaseUrl();
  if (api) return api;
  return "vigora://";
}

export function buildInviteUrl(token: string): string {
  const base = getInviteLinkBaseUrl();
  if (base === "vigora://") return `vigora://convite/${token}`;
  return `${base}/convite/${token}`;
}
