import { describe, it, expect } from "vitest";

describe("RevenueCat API Key", () => {
  it.skipIf(!process.env.REVENUECAT_API_KEY)("should have a valid production API key set", () => {
    const key = process.env.REVENUECAT_API_KEY;
    expect(key, "REVENUECAT_API_KEY must be set").toBeTruthy();
    expect(key!.length, "Key must be at least 20 chars").toBeGreaterThanOrEqual(20);
    // Production keys start with appl_, goog_, strp_, or sk_ (legacy)
    const validPrefixes = ["appl_", "goog_", "strp_", "sk_"];
    const hasValidPrefix = validPrefixes.some((p) => key!.startsWith(p));
    expect(hasValidPrefix, `Key must start with one of: ${validPrefixes.join(", ")}`).toBe(true);
  });
});
