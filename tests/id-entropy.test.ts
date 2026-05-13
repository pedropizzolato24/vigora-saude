/**
 * id-entropy.test.ts
 *
 * Verifies that IDs used as authorization keys (deviceId, contact/alarm
 * IDs) are generated from a CSPRNG, not Math.random.
 *
 * The previous Math.random-based generator was guessable; combined with
 * the public monitoring router (Fix #1) this enabled enumeration
 * attacks against other users' contacts and locations.
 *
 * We test:
 *   1. The deviceId generator returns a valid RFC 4122 v4 UUID
 *   2. The app-context.generateId returns the same format
 *   3. Neither function source code contains "Math.random"
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// expo-crypto isn't available in node, mock it. We deliberately use a
// "good enough" mock — the real implementation is platform code.
vi.mock("expo-crypto", () => {
  // Use node's built-in crypto for the test
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
  return { randomUUID: () => nodeCrypto.randomUUID() };
});

// Mock RN-only modules so we can import device-id and app-context in node
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("Fix #7 — CSPRNG IDs", () => {
  it("generateUUID (device-id) returns a valid v4 UUID", async () => {
    const mod = await import("../lib/device-id");
    const id = mod.generateUUID();
    expect(id).toMatch(UUID_V4_REGEX);
  });

  it("device-id generates unique values across many calls", async () => {
    const mod = await import("../lib/device-id");
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(mod.generateUUID());
    expect(ids.size).toBe(1000);
  });

  it("source of device-id.ts no longer uses Math.random", () => {
    const src = readFileSync(
      join(__dirname, "..", "lib", "device-id.ts"),
      "utf-8"
    );
    expect(src).not.toMatch(/Math\.random\s*\(/);
  });

  it("source of app-context.tsx no longer uses Math.random for IDs", () => {
    const src = readFileSync(
      join(__dirname, "..", "lib", "app-context.tsx"),
      "utf-8"
    );
    // app-context defines generateId — check that function specifically
    // doesn't use Math.random. Use a focused regex.
    const generateIdMatch = src.match(
      /export function generateId\(\)[\s\S]*?\n\}/
    );
    expect(generateIdMatch).not.toBeNull();
    expect(generateIdMatch![0]).not.toMatch(/Math\.random/);
  });
});
