/**
 * checkin-response-a11y.test.ts
 *
 * A tela de confirmação do check-in era a única do app sem NENHUM acesso ao
 * tema: paleta verde fixa em hex. No modo escuro ela acendia uma tela cheia
 * verde-clara — de madrugada, para um idoso. E não tinha modo acessível.
 *
 * Contraste calculado sobre o fundo REAL: `successLight` é translúcido, então
 * o que o olho vê é a composição sobre o fundo do tema.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SRC = readFileSync(path.join(ROOT, "app/checkin-response.tsx"), "utf8");
const TEMA = readFileSync(path.join(ROOT, "theme.config.js"), "utf8");

function token(nome: string): { light: string; dark: string } {
  const m = TEMA.match(
    new RegExp(nome + String.raw`:\s*\{\s*light:\s*'(#[0-9A-Fa-f]{6,8})',\s*dark:\s*'(#[0-9A-Fa-f]{6,8})'`)
  );
  if (!m) throw new Error("token " + nome + " não encontrado");
  return { light: m[1], dark: m[2] };
}

function luminancia(hex: string): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const n = parseInt(hex.slice(1, 7), 16);
  return 0.2126 * canal((n >> 16) & 0xff) + 0.7152 * canal((n >> 8) & 0xff) + 0.0722 * canal(n & 0xff);
}

function contraste(a: string, b: string): number {
  const x = luminancia(a);
  const y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Cor translúcida (#RRGGBBAA) composta sobre um fundo opaco. */
function achatar(cor: string, fundo: string): string {
  if (cor.length === 7) return cor;
  const alfa = parseInt(cor.slice(7, 9), 16) / 255;
  const f = parseInt(cor.slice(1, 7), 16);
  const k = parseInt(fundo.slice(1, 7), 16);
  const canal = (d: number) =>
    Math.round((((f >> d) & 0xff) * alfa) + (((k >> d) & 0xff) * (1 - alfa)));
  return "#" + [16, 8, 0].map((d) => canal(d).toString(16).padStart(2, "0")).join("");
}

describe("checkin-response — tema e modo acessível", () => {
  it("não tem mais nenhuma cor em hex", () => {
    expect(SRC.match(/['"]#[0-9A-Fa-f]{3,8}['"]/g) ?? []).toEqual([]);
  });

  it("lê o tema e o modo acessível", () => {
    expect(SRC).toContain("useColors");
    expect(SRC).toContain("useAccessibility");
    expect(SRC).toContain("isAccessibilityMode");
  });

  it("aprova o contraste nos dois esquemas do modo normal", () => {
    for (const esquema of ["light", "dark"] as const) {
      const fundo = achatar(token("successLight")[esquema], token("background")[esquema]);
      expect(contraste(token("foreground")[esquema], fundo)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(token("muted")[esquema], fundo)).toBeGreaterThanOrEqual(4.5);
      expect(
        contraste(token("onSuccess")[esquema], token("success")[esquema])
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("dá alvo de toque acessível ao botão", () => {
    // >= 60px no modo acessível: padding vertical + corpo da fonte.
    const m = SRC.match(/paddingVertical:\s*isAccessibilityMode\s*\?\s*(\d+)/);
    expect(Number(m?.[1]) * 2 + 24).toBeGreaterThanOrEqual(60);
  });
});
