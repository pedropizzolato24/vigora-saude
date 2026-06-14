import { describe, it, expect } from "vitest";

describe("RevenueCat EXPO_PUBLIC API Key", () => {
  it.skipIf(!process.env.EXPO_PUBLIC_REVENUECAT_API_KEY)("should have EXPO_PUBLIC_REVENUECAT_API_KEY set and valid", () => {
    const key = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
    expect(key, "EXPO_PUBLIC_REVENUECAT_API_KEY must be set").toBeTruthy();
    expect(key!.length, "Key must be at least 20 chars").toBeGreaterThanOrEqual(20);
    // Chave do SDK no CLIENTE: apenas chaves públicas por plataforma. A secret
    // key sk_* (acesso total à conta RevenueCat via REST) jamais pode ir para o
    // bundle do app — usá-la também faz os offerings falharem em runtime.
    expect(
      key!.startsWith("sk_"),
      "EXPO_PUBLIC_REVENUECAT_API_KEY é uma SECRET key (sk_); use a chave pública goog_/appl_"
    ).toBe(false);
    const validPrefixes = ["appl_", "goog_"];
    const hasValidPrefix = validPrefixes.some((p) => key!.startsWith(p));
    expect(hasValidPrefix, `Key must start with one of: ${validPrefixes.join(", ")}`).toBe(true);
  });
});
