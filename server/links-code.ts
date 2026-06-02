/**
 * links-code.ts
 *
 * Pure helpers for caregiver-link invite codes. No DB / network imports so the
 * logic stays unit-testable (see tests/links.test.ts). The DB-touching glue
 * lives in db-links.ts and the routes in routers-links.ts.
 */
import { randomBytes, randomInt } from "node:crypto";

/**
 * Charset for invite codes. Excludes visually ambiguous characters (0/O, 1/I/L)
 * so an elderly user can read a code aloud and a caregiver type it without
 * confusion. 31 symbols ^ 6 positions ≈ 8.9e8 combinations.
 */
export const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const INVITE_CODE_LENGTH = 6;

/** Invites are valid for 10 minutes after creation. */
export const INVITE_TTL_MS = 10 * 60 * 1000;

/**
 * Generate a crypto-random invite code. Uses node:crypto `randomInt` (CSPRNG)
 * so codes can't be predicted — combined with the short TTL, single use, and
 * the redemption rate limit, brute-forcing the code space is impractical.
 */
export function generateInviteCode(length = INVITE_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Normalize user-typed input to the canonical code form: uppercase and strip
 * everything that isn't a base36 character (removes the display dash, spaces).
 * Note this is intentionally lenient — `isValidInviteCodeFormat` is the gate.
 */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** True iff `code` is exactly INVITE_CODE_LENGTH chars, all from the alphabet. */
export function isValidInviteCodeFormat(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!INVITE_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

/** Display form with a dash in the middle: "ABCDEF" -> "ABC-DEF". */
export function formatInviteCode(code: string): string {
  if (code.length !== INVITE_CODE_LENGTH) return code;
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

/** True once `now` has reached or passed `expiresAt`. */
export function isInviteExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

// --- Share-link tokens (caregiver-initiated invite) ---------------------------

/** Share invites last 24h (the caregiver may send the link and the elder opens it later). */
export const SHARE_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Opaque, URL-safe token for the caregiver-initiated share link. 12 random
 * bytes -> exactly 16 base64url chars (~96 bits), which fits the existing
 * `link_invites.code` varchar(16) column. Not human-readable (unlike the 6-char
 * code) because it travels in a URL, not spoken aloud.
 */
export function generateInviteToken(): string {
  return randomBytes(12).toString("base64url");
}

/** Shape guard for a share token (16 base64url chars). */
export function isValidTokenFormat(token: string): boolean {
  return /^[A-Za-z0-9_-]{16}$/.test(token);
}
