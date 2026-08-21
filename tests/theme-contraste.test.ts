/**
 * theme-contraste.test.ts
 *
 * Os tokens "on-color" existem para uma coisa só: garantir que o texto por
 * cima daquele fundo colorido seja legível. Quando o par falha, a garantia é
 * falsa e cada tela que confia nele quebra em silêncio.
 *
 * Foi o caso do onSuccess: branco sobre o verde claro do modo escuro dava
 * 2,55:1 — abaixo até do mínimo de texto grande — em "Salvar Perfil",
 * "Compartilhar" e nas ações de contato.
 *
 * Bar: 4,5:1 (WCAG AA, texto normal). Par que só alcança o mínimo de texto
 * grande (3:1) fica na tabela abaixo, com o valor medido à vista.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const TEMA = readFileSync(path.join(ROOT, "theme.config.js"), "utf8");

/**
 * Pares que passam no mínimo de texto GRANDE (3:1) mas não no de texto
 * normal (4,5:1). Só valem em rótulo de botão grande e em ícone.
 * Trocar exige decidir a aparência de centenas de telas — é chamada do dono.
 */
const SO_TEXTO_GRANDE: Record<string, string> = {
  "onPrimary/primary/dark": "4,14:1 — 160 usos, é o botão principal do app",
  "onEmergency/emergency/dark": "3,81:1 — 27 usos, inclui o dead man's switch",
};

function luminancia(hex: string): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * canal((n >> 16) & 0xff) + 0.7152 * canal((n >> 8) & 0xff) + 0.0722 * canal(n & 0xff);
}

function contraste(a: string, b: string): number {
  const x = luminancia(a);
  const y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Lê os pares light/dark direto do theme.config.js. */
function paleta(): Record<string, { light: string; dark: string }> {
  const p: Record<string, { light: string; dark: string }> = {};
  for (const m of TEMA.matchAll(/(\w+):\s*\{\s*light:\s*'(#[0-9A-Fa-f]{6})',\s*dark:\s*'(#[0-9A-Fa-f]{6})'/g)) {
    p[m[1]] = { light: m[2], dark: m[3] };
  }
  return p;
}

const P = paleta();
const PARES: [string, string][] = [
  ["onPrimary", "primary"],
  ["onSuccess", "success"],
  ["onWarning", "warning"],
  ["onEmergency", "emergency"],
];

describe("tema — o token on-color é legível sobre o seu fundo", () => {
  it("lê os pares do theme.config.js", () => {
    for (const [frente, fundo] of PARES) {
      expect(P[frente], frente + " ausente").toBeTruthy();
      expect(P[fundo], fundo + " ausente").toBeTruthy();
    }
  });

  it("todo par on-color passa em AA nos dois esquemas", () => {
    const fracos: string[] = [];
    for (const [frente, fundo] of PARES) {
      for (const esquema of ["light", "dark"] as const) {
        const chave = frente + "/" + fundo + "/" + esquema;
        if (SO_TEXTO_GRANDE[chave]) continue;
        const r = contraste(P[frente][esquema], P[fundo][esquema]);
        if (r < 4.5) fracos.push(chave + " = " + r.toFixed(2) + ":1");
      }
    }
    expect(fracos).toEqual([]);
  });

  it("nem os isentos caem abaixo do mínimo de texto grande", () => {
    for (const chave of Object.keys(SO_TEXTO_GRANDE)) {
      const [frente, fundo, esquema] = chave.split("/") as [string, string, "light" | "dark"];
      expect(contraste(P[frente][esquema], P[fundo][esquema]), chave).toBeGreaterThanOrEqual(3);
    }
  });
});
