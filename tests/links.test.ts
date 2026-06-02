import { describe, expect, it } from "vitest";
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  formatInviteCode,
  generateInviteCode,
  generateInviteToken,
  isInviteExpired,
  isValidInviteCodeFormat,
  isValidTokenFormat,
  normalizeInviteCode,
} from "../server/links-code";

describe("generateInviteCode", () => {
  it("produces a code of the configured length using only the alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      for (const ch of code) expect(INVITE_CODE_ALPHABET).toContain(ch);
    }
  });

  it("never emits visually ambiguous characters (0, 1, O, I, L)", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateInviteCode()).not.toMatch(/[01OIL]/);
    }
  });

  it("respects a custom length", () => {
    expect(generateInviteCode(8)).toHaveLength(8);
  });
});

describe("normalizeInviteCode", () => {
  it("uppercases and strips the display dash and spaces", () => {
    expect(normalizeInviteCode("abc-def")).toBe("ABCDEF");
    expect(normalizeInviteCode(" a b c d e f ")).toBe("ABCDEF");
  });
});

describe("isValidInviteCodeFormat", () => {
  it("accepts a well-formed code", () => {
    expect(isValidInviteCodeFormat("ABC2DE")).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(isValidInviteCodeFormat("ABCDE")).toBe(false);
    expect(isValidInviteCodeFormat("ABCDEFG")).toBe(false);
  });

  it("rejects ambiguous / out-of-alphabet characters", () => {
    expect(isValidInviteCodeFormat("ABCDE0")).toBe(false);
    expect(isValidInviteCodeFormat("ABCDE1")).toBe(false);
    expect(isValidInviteCodeFormat("ABCDEO")).toBe(false);
    expect(isValidInviteCodeFormat("ABCDEL")).toBe(false);
  });

  it("validates freshly generated codes", () => {
    for (let i = 0; i < 100; i++) {
      expect(isValidInviteCodeFormat(generateInviteCode())).toBe(true);
    }
  });
});

describe("formatInviteCode", () => {
  it("inserts a dash in the middle", () => {
    expect(formatInviteCode("ABCDEF")).toBe("ABC-DEF");
  });

  it("passes through codes that are not the standard length", () => {
    expect(formatInviteCode("ABCD")).toBe("ABCD");
  });
});

describe("generateInviteToken", () => {
  it("produces a 16-char base64url token that fits the code column", () => {
    for (let i = 0; i < 100; i++) {
      const token = generateInviteToken();
      expect(token).toHaveLength(16);
      expect(token.length).toBeLessThanOrEqual(16);
      expect(isValidTokenFormat(token)).toBe(true);
    }
  });

  it("is effectively unique across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateInviteToken());
    expect(seen.size).toBe(500);
  });
});

describe("isValidTokenFormat", () => {
  it("rejects wrong length or non-base64url chars", () => {
    expect(isValidTokenFormat("short")).toBe(false);
    expect(isValidTokenFormat("ABC2DE")).toBe(false);
    expect(isValidTokenFormat("aaaaaaaaaaaaaaaa")).toBe(true);
    expect(isValidTokenFormat("aaaaaaaaaaaaaaa.")).toBe(false);
  });
});

describe("isInviteExpired", () => {
  const base = new Date("2026-06-01T12:00:00Z");

  it("is false before expiry", () => {
    const expires = new Date(base.getTime() + 60_000);
    expect(isInviteExpired(expires, base)).toBe(false);
  });

  it("is true at and after expiry", () => {
    expect(isInviteExpired(base, base)).toBe(true);
    expect(isInviteExpired(new Date(base.getTime() - 1), base)).toBe(true);
  });
});
