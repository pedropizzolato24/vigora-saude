import { describe, it, expect } from "vitest";

describe("RevenueCat EXPO_PUBLIC API Key", () => {
  it.skipIf(!process.env.EXPO_PUBLIC_REVENUECAT_API_KEY)("should have EXPO_PUBLIC_REVENUECAT_API_KEY set and valid", () => {
    const key = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
    expect(key, "EXPO_PUBLIC_REVENUECAT_API_KEY must be set").toBeTruthy();
    expect(key!.length, "Key must be at least 20 chars").toBeGreaterThanOrEqual(20);
    const validPrefixes = ["appl_", "goog_", "strp_", "sk_"];
    const hasValidPrefix = validPrefixes.some((p) => key!.startsWith(p));
    expect(hasValidPrefix, `Key must start with one of: ${validPrefixes.join(", ")}`).toBe(true);
  });
});
