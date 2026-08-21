/**
 * ui-font-minimum.test.ts
 *
 * Mínimo de corpo do CLAUDE.md: >= 15px (o modo acessível sobe para 18+ via
 * af.*). O público do Vigora tem 60+ e usa o app para lembrar de remédio e
 * pedir socorro — texto de 11px não é decoração, é informação que não chega.
 *
 * A regra vale para QUALQUER literal numérico de fontSize em app/ e
 * components/, tanto no StyleSheet quanto inline. Valor dinâmico (fs.base,
 * af.md, uma variável) fica de fora: quem os define já respeita a escala.
 *
 * Exceção precisa de justificativa escrita na tabela abaixo — a lista É a
 * documentação de por que aquele número pode ficar menor.
 */
import { describe, expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const MINIMO = 15;

/** Exceções justificadas. Chave `arquivo::valor` -> motivo. */
const EXCECOES: Record<string, string> = {};

const ARQUIVOS = globSync("{app,components}/**/*.tsx", { cwd: ROOT }).map((f) =>
  f.split(path.sep).join("/")
);

describe("padrão de UI — corpo mínimo de 15px", () => {
  it("encontra os arquivos de UI", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(50);
  });

  it("não tem nenhum fontSize numérico abaixo do mínimo", () => {
    const violacoes: string[] = [];
    for (const rel of ARQUIVOS) {
      const linhas = readFileSync(path.join(ROOT, rel), "utf8").split(/\r?\n/);
      linhas.forEach((linha, i) => {
        const m = linha.match(/fontSize:\s*(\d+)\s*[,}]/);
        if (!m) return;
        const valor = Number(m[1]);
        if (valor >= MINIMO) return;
        if (EXCECOES[rel + "::" + valor]) return;
        violacoes.push(rel + ":" + (i + 1) + "  fontSize: " + valor);
      });
    }
    expect(violacoes).toEqual([]);
  });

  /**
   * Subir o fontSize sem subir a entrelinha aperta o texto — foi o que a
   * correção em massa causou em 7 estilos cuja lineHeight tinha sido escolhida
   * para um corpo menor (um deles ficou 15/15, sem respiro nenhum).
   */
  it("mantém a entrelinha proporcional ao corpo", () => {
    const apertados: string[] = [];
    for (const rel of ARQUIVOS) {
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      for (const b of src.match(/\{[^{}]*\}/g) ?? []) {
        const fs = b.match(/fontSize:\s*(\d+)/);
        const lh = b.match(/lineHeight:\s*(\d+)/);
        if (!fs || !lh) continue;
        const corpo = Number(fs[1]);
        const entre = Number(lh[1]);
        if (entre < corpo * 1.2) {
          apertados.push(rel + "  fontSize " + corpo + " / lineHeight " + entre);
        }
      }
    }
    expect(apertados).toEqual([]);
  });

  /**
   * Ponto cego do teste acima: tamanho definido por ternário
   * (`const fs = accessible ? 16 : 13`) não é literal em `fontSize:` e passava
   * batido. Era assim que o painel de monitoramento — o que diz se o dead
   * man's switch está vivo — renderizava inteiro a 13px, e a 12px em sete
   * rótulos que usam `fs - 1`.
   *
   * Convenção: o primeiro ramo é o acessível (>= 18), o segundo o normal (>= 15).
   */
  it("respeita os mínimos também nos tamanhos definidos por ternário", () => {
    const fora: string[] = [];
    for (const rel of ARQUIVOS) {
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      for (const m of src.matchAll(/const\s+(\w*(?:[fF]ont|[fF]s|[sS]ize)\w*)\s*=\s*[^;\n]*\?\s*(\d+)\s*:\s*(\d+)/g)) {
        const [, nome, acess, normal] = m;
        // Tamanho de ícone não é corpo de texto — regra diferente.
        if (/icon/i.test(nome)) continue;
        if (Number(acess) < 18 || Number(normal) < MINIMO) {
          fora.push(rel + "  " + nome + " = " + acess + " : " + normal);
        }
      }
    }
    expect(fora).toEqual([]);
  });
});
