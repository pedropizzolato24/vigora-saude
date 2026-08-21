/**
 * alarm-ring-a11y-contrast.test.ts
 *
 * O botão "Desligar Alarme" era INVISÍVEL no modo acessibilidade: o estilo
 * compartilhado `styles.dismissButton` não declara `backgroundColor` (quem o
 * define é cada modo), e o texto do estilo é branco fixo. No modo acessível
 * ninguém definia o fundo, então o branco caía direto sobre o creme de
 * `ac.background` — 1,15:1, na tela mais crítica do app e justamente no modo
 * feito para quem enxerga pior.
 *
 * A causa é uma família de defeitos, não um ponto: a paleta acessível é FIXA
 * (creme claro em qualquer tema), enquanto `colors.*` muda com claro/escuro e
 * foi calibrado para o fundo azul-escuro do modo normal. Todo token de tema que
 * vaza para dentro do ramo `isAccessibilityMode` some sobre o creme —
 * `colors.warning` dava 1,46:1 (claro) e 1,30:1 (escuro).
 *
 * Por isso o teste trava o INVARIANTE ("nenhum token de tema dentro do ramo
 * acessível" + "todo par usado passa no mínimo da WCAG AA"), calculado a partir
 * dos valores REAIS da paleta, e não a presença de uma linha específica.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SCREEN_SRC = readFileSync(path.join(ROOT, "app/alarm-ring.tsx"), "utf8");
const A11Y_SRC = readFileSync(path.join(ROOT, "lib/accessibility-context.tsx"), "utf8");

// --- Paleta real, lida da fonte ---------------------------------------------
// Lê de lib/accessibility-context.tsx para que trocar um hex da paleta refaça a
// conta de contraste aqui, em vez de o teste seguir verde com valores velhos.
function readA11yPalette(): Record<string, string> {
  const block = A11Y_SRC.match(/const A11Y_COLORS[^{]*\{([\s\S]*?)\n\};/);
  if (!block) throw new Error("A11Y_COLORS não encontrado em lib/accessibility-context.tsx");
  const palette: Record<string, string> = {};
  for (const [, name, hex] of block[1].matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)) {
    palette[name] = hex;
  }
  return palette;
}

const ac = readA11yPalette();

// --- Contraste WCAG 2.2 (relative luminance + ratio) -------------------------
function luminance(hex: string): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * (channel(n & 0xff))
  );
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// --- Recorte do ramo acessível ----------------------------------------------
const branchStart = SCREEN_SRC.indexOf("if (isAccessibilityMode) {");
const branchEnd = SCREEN_SRC.indexOf("// --- Normal Mode");
const A11Y_BRANCH = SCREEN_SRC.slice(branchStart, branchEnd);

/** Remove comentários — eles CITAM colors.* para explicar o porquê do token. */
const A11Y_CODE = A11Y_BRANCH.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

describe("alarm-ring — modo acessibilidade", () => {
  it("recorta o ramo acessível da tela", () => {
    expect(branchStart).toBeGreaterThan(0);
    expect(branchEnd).toBeGreaterThan(branchStart);
  });

  it("não usa nenhum token de tema (colors.*) sobre a paleta fixa", () => {
    const vazamentos = A11Y_CODE.match(/\bcolors\.\w+/g) ?? [];
    expect(vazamentos).toEqual([]);
  });

  it("dá fundo ao botão Desligar Alarme — o estilo compartilhado não tem", () => {
    // O estilo é a prova de que o fundo PRECISA vir de fora.
    const estilo = SCREEN_SRC.match(/dismissButton:\s*\{[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(estilo).not.toMatch(/backgroundColor/);

    const botao = A11Y_CODE.slice(A11Y_CODE.indexOf("styles.dismissButton"));
    expect(botao).toMatch(/backgroundColor:\s*ac\.\w+/);
  });

  it("põe o texto do Desligar Alarme em token, não em branco fixo", () => {
    const botao = A11Y_CODE.slice(A11Y_CODE.indexOf("styles.dismissButton"));
    const trecho = botao.slice(0, botao.indexOf("</Pressable>"));
    expect(trecho).not.toMatch(/#[0-9A-Fa-f]{6}/);
    expect(trecho).toMatch(/color:\s*ac\.onEmergency/);
  });

  it("aprova o contraste WCAG AA de cada par usado no ramo acessível", () => {
    // Texto normal ≥ 4.5:1
    expect(contrast(ac.onEmergency, ac.error)).toBeGreaterThanOrEqual(4.5); // Desligar Alarme
    expect(contrast(ac.warning, ac.background)).toBeGreaterThanOrEqual(4.5); // contagem urgente
    expect(contrast(ac.error, ac.surface)).toBeGreaterThanOrEqual(4.5); // caixa de escalação
    expect(contrast(ac.muted, ac.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ac.foreground, ac.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ac.foreground, ac.surface)).toBeGreaterThanOrEqual(4.5);

    // Gráfico / borda ≥ 3:1 (WCAG 1.4.11)
    for (const estado of [ac.error, ac.warning, ac.primary]) {
      expect(contrast(estado, ac.background)).toBeGreaterThanOrEqual(3); // círculo do alarme
      expect(contrast(ac.onPrimary, estado)).toBeGreaterThanOrEqual(3); // ícone branco dentro
    }
  });

  it("mantém o âmbar do tema reprovado — é o valor que causou o defeito", () => {
    // Guarda a premissa: se um dia colors.warning virar escuro o bastante para
    // passar sobre o creme, este teste falha e a regra pode ser revista.
    expect(contrast("#F0C24A", ac.background)).toBeLessThan(3); // warning claro
    expect(contrast("#F5D06E", ac.background)).toBeLessThan(3); // warning escuro
  });
});

describe("alarm-ring — modo normal", () => {
  const NORMAL = SCREEN_SRC.slice(branchEnd);

  it("continua pintando o Desligar Alarme com o token de tema", () => {
    const botao = NORMAL.slice(NORMAL.indexOf("styles.dismissButton"));
    expect(botao).toMatch(/backgroundColor:\s*colors\.error/);
  });

  it("continua com o fundo azul-escuro fixo do container", () => {
    expect(SCREEN_SRC).toMatch(/container:\s*\{[\s\S]*?backgroundColor:\s*'#0A1628'/);
  });
});
