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

    // vindoDoAlarmKit muda a cor (confirmação vs. emergência), mas os dois
    // ramos do ternário têm que ser token — nenhum hex, nenhum vazio.
    const botao = A11Y_CODE.slice(A11Y_CODE.indexOf("styles.dismissButton"));
    const bg = (botao.match(/backgroundColor:\s*([^,\n}]+)/)?.[1] ?? "").trim();
    expect(bg).toMatch(/^(ac\.\w+|vindoDoAlarmKit\s*\?\s*ac\.\w+\s*:\s*ac\.\w+)$/);
  });

  it("põe o texto do Desligar Alarme em token, não em branco fixo", () => {
    const botao = A11Y_CODE.slice(A11Y_CODE.indexOf("styles.dismissButton"));
    const trecho = botao.slice(0, botao.indexOf("</Pressable>"));
    expect(trecho).not.toMatch(/#[0-9A-Fa-f]{6}/);
    // Mesma tolerância ao ternário do vindoDoAlarmKit; o ramo de emergência
    // continua obrigatoriamente em ac.onEmergency.
    expect(trecho).toMatch(/color:\s*(?:ac\.onEmergency|vindoDoAlarmKit\s*\?\s*ac\.\w+\s*:\s*ac\.onEmergency)/);
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

/**
 * O mesmo defeito do ramo acessível, invertido: aqui o container é um azul-
 * escuro FIXO (`#0A1628`, não muda com o tema) e quem varia são os `colors.*`
 * usados por cima dele. No tema claro `colors.error` é vermelho ESCURO — feito
 * para fundo claro — e cai sobre o azul quase preto: 3,37:1 no aviso de que a
 * família já foi acionada.
 *
 * `colors.errorLight` é translúcido (`#D6161C12`, 7% de alfa), então o fundo
 * real da caixa é a composição sobre o container — é essa cor achatada que o
 * teste mede, não o token.
 */
describe("alarm-ring — modo normal, contraste sobre o container fixo", () => {
  const NORMAL = SCREEN_SRC.slice(branchEnd);
  const FUNDO = "#0A1628";

  /** `#RRGGBBAA` composto sobre um fundo opaco → o hex que o olho vê. */
  function achatar(cor: string, fundo: string): string {
    if (cor.length === 7) return cor;
    const alfa = parseInt(cor.slice(7, 9), 16) / 255;
    const frente = parseInt(cor.slice(1, 7), 16);
    const atras = parseInt(fundo.slice(1), 16);
    const canal = (desloc: number) =>
      Math.round(
        (((frente >> desloc) & 0xff) * alfa) + (((atras >> desloc) & 0xff) * (1 - alfa))
      );
    return "#" + [16, 8, 0].map((d) => canal(d).toString(16).padStart(2, "0")).join("");
  }

  /** Valor literal de uma prop de cor; falha se ainda for token de tema. */
  function corFixa(trecho: string, prop: string): string {
    const m = trecho.match(
      new RegExp(prop + String.raw`\s*[:=]\s*\{?\s*(?:['"](#[0-9A-Fa-f]{6,8})['"]|(\S+?))[,}\s/]`)
    );
    if (!m) throw new Error(`${prop} não encontrado em: ${trecho.trim()}`);
    if (!m[1]) throw new Error(`${prop} usa o token de tema \`${m[2]}\` sobre o container fixo ${FUNDO}`);
    return m[1];
  }

  const caixa = NORMAL.match(/styles\.escalatedBox,\s*\{([^}]*)\}/)?.[1] ?? "";
  const texto = NORMAL.match(/styles\.escalatedText,\s*\{([^}]*)\}/)?.[1] ?? "";
  const icone = NORMAL.match(/<MaterialIcons name="warning"[^/]*?\/>/)?.[0] ?? "";

  it("recorta a caixa de escalação do modo normal", () => {
    expect(caixa).not.toBe("");
    expect(texto).not.toBe("");
    expect(icone).not.toBe("");
  });

  it("aprova o texto do aviso de emergência enviada (AA, 14px semibold)", () => {
    const fundoCaixa = achatar(corFixa(caixa, "backgroundColor"), FUNDO);
    expect(contrast(corFixa(texto, "color"), fundoCaixa)).toBeGreaterThanOrEqual(4.5);
  });

  it("aprova o ícone e a borda da caixa (gráfico, 3:1)", () => {
    const fundoCaixa = achatar(corFixa(caixa, "backgroundColor"), FUNDO);
    expect(contrast(corFixa(icone, "color"), fundoCaixa)).toBeGreaterThanOrEqual(3);
    expect(contrast(corFixa(caixa, "borderColor"), FUNDO)).toBeGreaterThanOrEqual(3);
  });

  it("aprova a instrução de como cancelar o envio (countdownSub)", () => {
    const estilo = SCREEN_SRC.match(/countdownSub:\s*\{[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(contrast(corFixa(estilo, "color"), FUNDO)).toBeGreaterThanOrEqual(4.5);
  });

  it("mantém reprovados os valores que causaram o defeito", () => {
    // Guarda a premissa: se um dia o tema clarear esses vermelhos o bastante
    // para passarem sobre o azul-escuro, este teste falha e a regra é revista.
    expect(contrast("#D6161C", achatar("#D6161C12", FUNDO))).toBeLessThan(4.5); // error claro
    expect(contrast("#F04040", achatar("#F0404020", FUNDO))).toBeLessThan(4.5); // error escuro
    expect(contrast("#64748B", FUNDO)).toBeLessThan(4.5); // slate-500 do countdownSub
  });
});

/**
 * Mínimo de corpo do CLAUDE.md: >= 15px (o modo acessível sobrescreve com af.*).
 * A instrução de como cancelar o envio de emergência estava em 12px — a linha
 * que ensina a impedir o acionamento da família, no menor corpo do arquivo,
 * para um público de 60+.
 *
 * O par também precisa manter a hierarquia: o rótulo acima do cronômetro é o
 * primário, a instrução abaixo é o secundário. Subir só o secundário inverteria
 * os dois.
 */
describe("alarm-ring — modo normal, corpo mínimo do texto", () => {
  function bloco(estilo: string): string {
    const m = SCREEN_SRC.match(new RegExp(estilo + String.raw`:\s*\{[\s\S]*?\n {2}\}`));
    if (!m) throw new Error(`estilo ${estilo} não encontrado`);
    return m[0];
  }

  function fontSize(estilo: string): number {
    const m = bloco(estilo).match(/fontSize:\s*(\d+)/);
    if (!m) throw new Error(`fontSize não encontrado em ${estilo}`);
    return Number(m[1]);
  }

  it("põe a instrução de cancelar o envio no mínimo de corpo", () => {
    expect(fontSize("countdownSub")).toBeGreaterThanOrEqual(15);
  });

  it("mantém o rótulo do cronômetro no mínimo e acima do secundário", () => {
    expect(fontSize("countdownLabel")).toBeGreaterThanOrEqual(15);
    expect(fontSize("countdownLabel")).toBeGreaterThan(fontSize("countdownSub"));
  });

  it("dá entrelinha compatível com o corpo do modo acessível (af.xs = 16)", () => {
    // lineHeight é do estilo COMPARTILHADO: o ramo acessível sobrescreve
    // fontSize com af.xs = 16, mas herda a entrelinha daqui.
    const m = bloco("countdownSub").match(/lineHeight:\s*(\d+)/);
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(16 * 1.25);
  });

  it("põe o rótulo ALARME no mínimo de corpo", () => {
    expect(fontSize("alarmLabel")).toBeGreaterThanOrEqual(15);
  });

  it("põe o aviso de emergência enviada no mínimo, e não abaixo do que ele substitui", () => {
    // A caixa de escalação ocupa o lugar do bloco do cronômetro quando o
    // tempo acaba — não pode chegar menor do que o rótulo que ela substitui.
    expect(fontSize("escalatedText")).toBeGreaterThanOrEqual(15);
    expect(fontSize("escalatedText")).toBeGreaterThanOrEqual(fontSize("countdownLabel"));
  });

  it("acompanha a entrelinha do aviso ao novo corpo", () => {
    const m = bloco("escalatedText").match(/lineHeight:\s*(\d+)/);
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(fontSize("escalatedText") * 1.35);
  });
});
