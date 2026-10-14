/**
 * O botão "+" de novo lembrete fica na barra de baixo da tela (components/
 * alarm-list-screen.tsx, `addBtnContainer`), não no canto superior direito.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const help = readFileSync(join(__dirname, "..", "components/help-screen.tsx"), "utf8");

describe("ajuda — como criar um novo alarme", () => {
  it("diz onde o botão realmente está (na parte de baixo da tela)", () => {
    expect(help).toMatch(
      /abra "Remédios" e toque no botão "Adicionar lembrete", na parte de baixo da tela\./,
    );
    expect(help).not.toMatch(/botão "\+" no canto superior direito/);
  });
});
