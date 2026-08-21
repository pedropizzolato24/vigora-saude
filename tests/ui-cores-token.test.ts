/**
 * ui-cores-token.test.ts
 *
 * "Nunca hardcode hex/RGB. Sempre tokens." (CLAUDE.md)
 *
 * A violação que importa não é qualquer hex — é repetir LITERALMENTE um valor
 * que já existe em theme.config.js. Quando isso acontece, o tema deixa de ser
 * a fonte única: mudar a cor de erro no tema não alcança o diálogo, o toast
 * nem o histórico, e as telas divergem em silêncio.
 *
 * Foi assim que o app-dialog passou a vida inteira mostrando o acento do tema
 * CLARO no modo escuro: ele guardava `bgLight` e `bgDark` numa tabela própria
 * e só lia o `bgLight`.
 *
 * Branco e preto puros ficam de fora: são genéricos, não identidade de marca.
 *
 * Paleta fixa deliberada NÃO é violação — tela cheia de emergência não pode
 * virar branca junto com o tema. Cada isenção precisa de motivo escrito.
 */
import { describe, expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

/** Arquivos com paleta fixa deliberada -> motivo. */
const PALETA_FIXA: Record<string, string> = {
  "app/alarm-ring.tsx":
    "Alarme em tela cheia: fundo azul-escuro fixo (#0A1628) em qualquer tema. " +
    "Os vermelhos da caixa de escalação são calibrados para ESSE fundo — o " +
    "token do tema claro dava 3,37:1 ali.",
};

const MARCA = new Set(
  (readFileSync(path.join(ROOT, "theme.config.js"), "utf8").match(/#[0-9A-Fa-f]{6}/g) ?? [])
    .map((h) => h.toUpperCase())
    .filter((h) => h !== "#FFFFFF" && h !== "#000000")
);

const ARQUIVOS = globSync("{app,components}/**/*.tsx", { cwd: ROOT }).map((f) =>
  f.split(path.sep).join("/")
);

describe("padrão de UI — cor vem do token, não de hex repetido", () => {
  it("lê a paleta de marca do theme.config.js", () => {
    expect(MARCA.size).toBeGreaterThan(10);
  });

  it("nenhum arquivo repete um valor da paleta como literal", () => {
    const violacoes: string[] = [];
    for (const rel of ARQUIVOS) {
      if (PALETA_FIXA[rel]) continue;
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      for (const achado of src.match(/['"](#[0-9A-Fa-f]{6})(?:[0-9A-Fa-f]{2})?['"]/g) ?? []) {
        const base = achado.replace(/['"]/g, "").slice(0, 7).toUpperCase();
        if (MARCA.has(base)) violacoes.push(rel + "  " + achado);
      }
    }
    expect(violacoes).toEqual([]);
  });

  it("toda isenção tem motivo escrito e o arquivo existe", () => {
    for (const [arquivo, motivo] of Object.entries(PALETA_FIXA)) {
      expect(ARQUIVOS, arquivo + " isento mas inexistente").toContain(arquivo);
      expect(motivo.length, arquivo + " isento sem motivo").toBeGreaterThan(40);
    }
  });
});
