/**
 * storage-proxy.test.ts
 *
 * Validates the authorization function behind /manus-storage/*.
 * Before Fix #10, the proxy redirected any path without auth and the
 * 8-hex object-key suffix was enumerable — an attacker could iterate
 * known prefixes and pull other users' files.
 *
 * Policy under test:
 *   - public/...                : anyone (anon allowed)
 *   - users/<openId>/...         : only the owner
 *   - other prefixes              : only admins
 *   - path traversal / absolute   : always rejected
 */
import { describe, expect, it } from "vitest";
import {
  isStoragePathAllowed,
  type StorageUser,
} from "../server/_core/storageProxy";

const alice: StorageUser = { openId: "alice", role: "user" };
const mallory: StorageUser = { openId: "mallory", role: "user" };
const admin: StorageUser = { openId: "root", role: "admin" };

describe("isStoragePathAllowed", () => {
  it("anyone (anon) can read public/...", () => {
    expect(isStoragePathAllowed("public/icons/logo.png", null)).toBe(true);
    expect(isStoragePathAllowed("public/icons/logo.png", alice)).toBe(true);
  });

  it("anon cannot read user-scoped paths", () => {
    expect(isStoragePathAllowed("users/alice/x.pdf", null)).toBe(false);
  });

  it("owner can read their own namespace", () => {
    expect(isStoragePathAllowed("users/alice/report.pdf", alice)).toBe(true);
    expect(isStoragePathAllowed("users/alice/photos/2024.png", alice)).toBe(
      true
    );
  });

  it("non-owner cannot read another user's namespace", () => {
    expect(isStoragePathAllowed("users/alice/report.pdf", mallory)).toBe(false);
  });

  it("admin can read any user's namespace", () => {
    expect(isStoragePathAllowed("users/alice/report.pdf", admin)).toBe(true);
    expect(isStoragePathAllowed("users/mallory/report.pdf", admin)).toBe(true);
  });

  it("admin can read other arbitrary prefixes (e.g., generated/)", () => {
    expect(isStoragePathAllowed("generated/img.png", admin)).toBe(true);
  });

  it("regular user cannot read arbitrary prefixes outside their namespace", () => {
    expect(isStoragePathAllowed("generated/img.png", alice)).toBe(false);
    expect(isStoragePathAllowed("other/x", alice)).toBe(false);
  });

  it("rejects path traversal (..)", () => {
    expect(isStoragePathAllowed("../../etc/passwd", admin)).toBe(false);
    expect(isStoragePathAllowed("public/../secret", alice)).toBe(false);
    expect(isStoragePathAllowed("users/alice/../mallory/x", alice)).toBe(false);
  });

  it("rejects absolute paths (starting with /)", () => {
    expect(isStoragePathAllowed("/etc/passwd", admin)).toBe(false);
    expect(isStoragePathAllowed("/public/x", null)).toBe(false);
  });

  it("rejects empty path", () => {
    expect(isStoragePathAllowed("", admin)).toBe(false);
    expect(isStoragePathAllowed("", null)).toBe(false);
  });

  it("rejects users/<not-exactly-alice>/... when alice is asking", () => {
    // "users/aliceX/..." must not be considered Alice's namespace
    expect(isStoragePathAllowed("users/aliceX/file", alice)).toBe(false);
    // Path that LOOKS like prefix but isn't (no trailing slash)
    expect(isStoragePathAllowed("users/alice", alice)).toBe(false);
  });
});
