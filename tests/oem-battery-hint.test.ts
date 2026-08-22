import { describe, expect, it } from "vitest";
import { oemBatteryHint } from "@/lib/_core/oem-battery-hint";

describe("oemBatteryHint", () => {
  it('Samsung → passo extra de "Apps em suspensão"', () => {
    expect(oemBatteryHint("samsung")).toMatch(/Apps em suspensão/);
    expect(oemBatteryHint("Samsung")).toMatch(/Apps em suspensão/);
  });

  // Era /Autostart/. O termo saiu em 14/08/2026: jargão em inglês para um
  // público 60+. O rótulo em português é o que aparece no aparelho.
  it('Xiaomi/Redmi/POCO → passo extra de "Iniciar automaticamente"', () => {
    for (const m of ["Xiaomi", "redmi", "POCO"]) {
      expect(oemBatteryHint(m)).toMatch(/Iniciar automaticamente/);
    }
  });

  it("OEM stock (Motorola/Google) e vazio → sem passo extra", () => {
    expect(oemBatteryHint("motorola")).toBeNull();
    expect(oemBatteryHint("Google")).toBeNull();
    expect(oemBatteryHint("")).toBeNull();
    expect(oemBatteryHint("   ")).toBeNull();
  });
});
