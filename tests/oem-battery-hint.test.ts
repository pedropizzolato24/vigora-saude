import { describe, expect, it } from "vitest";
import { oemBatteryHint } from "@/lib/_core/oem-battery-hint";

describe("oemBatteryHint", () => {
  it('Samsung → caminho por "Limites de uso em segundo plano" e listas de suspensão', () => {
    const t = oemBatteryHint("samsung")!.join(" ");
    expect(t).toMatch(/Limites de uso em segundo plano/);
    expect(t).toMatch(/Apps em suspensão profunda/);
    expect(t).toMatch(/Apps que nunca entram em suspensão/);
    expect(t).not.toContain("›");
  });

  it('Samsung → passo extra de "Apps em suspensão"', () => {
    expect(oemBatteryHint("samsung")?.join(" ")).toMatch(/Apps em suspensão/);
    expect(oemBatteryHint("Samsung")?.join(" ")).toMatch(/Apps em suspensão/);
  });

  // Era /Autostart/. O termo saiu em 14/08/2026: jargão em inglês para um
  // público 60+. O rótulo em português é o que aparece no aparelho.
  it('Xiaomi/Redmi/POCO → passo extra de início automático', () => {
    for (const m of ["Xiaomi", "redmi", "POCO"]) {
      expect(oemBatteryHint(m)?.join(" ")).toMatch(/início automático/);
    }
  });

  it("devolve passos curtos, sem numeração embutida", () => {
    for (const m of ["samsung", "xiaomi"]) {
      const passos = oemBatteryHint(m)!;
      expect(passos.length).toBeGreaterThan(0);
      for (const p of passos) expect(p).not.toMatch(/^\s*\d+[.)]/);
    }
  });

  it("OEM stock (Motorola/Google) e vazio → sem passo extra", () => {
    expect(oemBatteryHint("motorola")).toBeNull();
    expect(oemBatteryHint("Google")).toBeNull();
    expect(oemBatteryHint("")).toBeNull();
    expect(oemBatteryHint("   ")).toBeNull();
  });
});
