/**
 * splash-hide-guard.test.ts
 *
 * Segurar o splash nativo (preventAutoHideAsync) troca 2-3s de tela PRETA por
 * 2-3s de splash no toque da notificação do alarme — o AlarmService mantém o
 * processo vivo, o Android trata como warm start e dispensa o splash antes de
 * o React Native ter inicializado.
 *
 * Mas quem segura precisa soltar. Se o splash nunca for escondido, o app fica
 * preso nele para SEMPRE — num app de alarme isso é pior que o problema
 * original. São dois caminhos independentes, e este teste existe para que
 * nenhum dos dois seja removido sem o outro:
 *   1. app/_layout.tsx esconde no primeiro render (caminho normal);
 *   2. index.ts esconde por timeout (rede de segurança, para o caso de a
 *      árvore de providers lançar durante o render e o efeito nunca rodar).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const indexSrc = readFileSync(join(root, "index.ts"), "utf8");
const layoutSrc = readFileSync(join(root, "app", "_layout.tsx"), "utf8");

/** Remove comentários para não casar com a explicação em vez do código. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const indexCode = stripComments(indexSrc);
const layoutCode = stripComments(layoutSrc);

describe("splash nativo — quem segura, solta", () => {
  it("index.ts segura o splash (senão a tela preta do AppTheme volta)", () => {
    expect(indexCode).toMatch(/SplashScreen\.preventAutoHideAsync\(\)/);
  });

  it("_layout.tsx esconde o splash no primeiro render (caminho normal)", () => {
    expect(layoutCode).toMatch(/SplashScreen\.hideAsync\(\)/);
  });

  it("index.ts tem a rede de segurança por timeout", () => {
    // Um render que lança deixaria o app preso no splash sem isto.
    expect(indexCode).toMatch(/setTimeout\([\s\S]{0,200}?SplashScreen\.hideAsync\(\)/);
  });

  it("segurar o splash NUNCA existe sem um caminho para escondê-lo", () => {
    if (!indexCode.includes("preventAutoHideAsync")) return; // não segura: nada a garantir
    const escondeNoRender = layoutCode.includes("SplashScreen.hideAsync()");
    const escondePorTimeout = /setTimeout\([\s\S]{0,200}?SplashScreen\.hideAsync\(\)/.test(indexCode);
    expect(escondeNoRender && escondePorTimeout).toBe(true);
  });
});
