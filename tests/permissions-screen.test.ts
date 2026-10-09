/**
 * permissions-screen.test.ts
 *
 * Teste de código-fonte (a tela depende de hooks de contexto; seguimos o padrão
 * de alarm-setup-prompts.test.ts). Trava o contrato pedido pelo dono do produto:
 * a descrição aparece SEMPRE; os passos só enquanto o item não está liberado,
 * como lista numerada, e antes do botão "Liberar".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "..", "app/permissions.tsx"), "utf8");

/** Trecho do bloco `{!item.granted && ( ... )}` — onde só entra o que falta liberar. */
function blocoNaoLiberado(): string {
  const ini = src.indexOf("{!item.granted && (");
  expect(ini, "não achei o bloco !item.granted").toBeGreaterThan(-1);
  // O bloco termina no texto do botão (o último filho dele).
  const fim = src.search(/>\s*Liberar\s*<\/Text>/);
  expect(fim, "não achei o texto do botão Liberar").toBeGreaterThan(ini);
  return src.slice(ini, fim);
}

describe("app/permissions.tsx — descrição e passos", () => {
  it("não usa mais o campo antigo `why`", () => {
    expect(src).not.toMatch(/item\.why/);
  });

  it("mostra a descrição sempre, fora do bloco de não liberado", () => {
    expect(src).toMatch(/\{item\.description\}/);
    expect(blocoNaoLiberado()).not.toMatch(/item\.description/);
  });

  it("os passos só são renderizados dentro do bloco de não liberado", () => {
    expect(src.match(/item\.steps/g)?.length).toBeGreaterThan(0);
    const dentro = blocoNaoLiberado().match(/item\.steps/g)?.length ?? 0;
    const total = src.match(/item\.steps/g)?.length ?? 0;
    expect(dentro, "há item.steps fora do bloco !item.granted").toBe(total);
  });

  it("lista numerada: um Text por passo, com o número, e leitura acessível", () => {
    const bloco = blocoNaoLiberado();
    expect(bloco).toMatch(/item\.steps\.map\(\(/);
    expect(bloco).toMatch(/\$\{i \+ 1\}\./);
    expect(bloco).toMatch(/accessibilityLabel=\{`Passo \$\{i \+ 1\}: \$\{passo\}`\}/);
    expect(bloco).toMatch(/accessibilityRole="list"/);
  });

  it("os passos vêm antes do botão Liberar", () => {
    const bloco = blocoNaoLiberado();
    expect(bloco.indexOf("item.steps")).toBeGreaterThan(-1);
    expect(bloco.indexOf("item.steps")).toBeLessThan(bloco.indexOf("accessibilityLabel={`Liberar"));
  });

  it("o texto dos passos usa o tamanho de corpo (normal e acessível), sem hex", () => {
    const bloco = blocoNaoLiberado();
    expect(bloco).toMatch(/fontSize: bodySize/);
    expect(bloco).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
