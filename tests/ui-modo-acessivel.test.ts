/**
 * ui-modo-acessivel.test.ts
 *
 * "Toda tela nova com versão isAccessibilityMode" (CLAUDE.md).
 *
 * O buraco mais grave da auditoria: login, cadastro e onboarding não tinham
 * nenhuma adaptação — nem `useAccessibility`, nem `useFontSize`. O idoso que
 * liga o modo acessível não consegue nem ENTRAR no app; o modo só passa a
 * valer depois que ele já está dentro.
 *
 * Isento é só quem delega a tela inteira para um componente que já adapta.
 * Cada isenção precisa de motivo escrito, e o teste confere que o componente
 * delegado realmente trata o modo.
 */
import { describe, expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

/** Telas isentas -> motivo + componente que carrega a adaptação. */
const DELEGA: Record<string, { motivo: string; para: string }> = {
  "app/help.tsx": {
    motivo: "Rota fina: devolve <HelpScreen/> inteiro, que já adapta.",
    para: "components/help-screen.tsx",
  },
  "app/(tabs)/help.tsx": {
    motivo: "Rota fina: devolve <HelpScreen/> inteiro, que já adapta.",
    para: "components/help-screen.tsx",
  },
  "app/(modal)/customer-center.tsx": {
    motivo: "Só monta <AppDialog/>, que já tem ramo acessível próprio.",
    para: "components/app-dialog.tsx",
  },
};

/**
 * Telas que o dono decidiu deixar sem modo acessível (2026-08-21).
 *
 * NÃO é isenção técnica: elas de fato não adaptam, e quem liga o modo
 * acessível segue vendo o corpo e o contraste normais nelas. Fica registrado
 * separado de DELEGA justamente para a diferença não se perder — se um dia a
 * decisão mudar, esta lista é o trabalho.
 */
const DISPENSADAS: Record<string, string> = {
  "app/onboarding.tsx": "decisão do dono, 2026-08-21",
  "app/login.tsx": "decisão do dono, 2026-08-21",
  "app/register.tsx": "decisão do dono, 2026-08-21",
  "app/email-login.tsx": "decisão do dono, 2026-08-21",
  "app/phone-login.tsx": "decisão do dono, 2026-08-21",
  "app/convite/[token].tsx": "decisão do dono, 2026-08-21",
  "app/caregiver-onboarding.tsx": "decisão do dono, 2026-08-21",
  "app/oauthredirect.tsx": "decisão do dono, 2026-08-21",
};

const TELAS = globSync("app/**/*.tsx", { cwd: ROOT })
  .map((f) => f.split(path.sep).join("/"))
  .filter((f) => !f.endsWith("_layout.tsx") && !f.includes("+not-found"));

describe("padrão de UI — modo acessível em toda tela", () => {
  it("encontra as telas", () => {
    expect(TELAS.length).toBeGreaterThan(20);
  });

  it("toda tela adapta ao modo acessível", () => {
    const sem: string[] = [];
    for (const rel of TELAS) {
      if (DELEGA[rel] || DISPENSADAS[rel]) continue;
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      if (!src.includes("useAccessibility")) sem.push(rel);
    }
    expect(sem).toEqual([]);
  });

  it("toda tela dispensada ainda existe — a lista não vira lixo", () => {
    for (const tela of Object.keys(DISPENSADAS)) {
      expect(TELAS, tela + " dispensada mas inexistente").toContain(tela);
    }
  });

  it("toda isenção delega para um componente que de fato adapta", () => {
    for (const [tela, { motivo, para }] of Object.entries(DELEGA)) {
      expect(TELAS, tela + " isenta mas inexistente").toContain(tela);
      expect(motivo.length, tela + " sem motivo").toBeGreaterThan(30);
      const alvo = readFileSync(path.join(ROOT, para), "utf8");
      expect(alvo, para + " não trata o modo acessível").toContain("isAccessibilityMode");
    }
  });
});
