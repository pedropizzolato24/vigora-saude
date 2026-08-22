/**
 * caregiver-tabs-guard.test.ts
 *
 * A guarda das abas de cuidador era fail-open:
 *
 *     if (user?.userType && user.userType !== 'caregiver')
 *
 * Com `user` null a condição é falsa e ela NÃO expulsa ninguém — deixa passar
 * e renderiza a área do cuidador. Num boot que não conseguiu ler o keychain
 * (aparelho bloqueado), `getUserInfo()` devolve null e o app abria nas abas de
 * cuidador SEM CONTA NENHUMA. Aconteceu no aparelho em 13/08/2026, durante o
 * spike do AlarmKit.
 *
 * A regra: só cuidador CONFIRMADO fica. Como é uma decisão de uma linha dentro
 * de um componente, o teste trava o padrão na fonte — mesmo estilo do
 * ios-critical-alerts.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const layout = readFileSync(
  join(__dirname, "..", "app", "(caregiver-tabs)", "_layout.tsx"),
  "utf8",
);

describe("guarda das abas de cuidador", () => {
  it("não usa o padrão fail-open que deixa user null passar", () => {
    expect(layout).not.toMatch(/user\?\.userType\s*&&/);
  });

  it("expulsa quem não é cuidador confirmado", () => {
    expect(layout).toMatch(/if\s*\(\s*user\?\.userType\s*!==\s*'caregiver'\s*\)/);
    expect(layout).toMatch(/router\.replace\('\/\(tabs\)'\)/);
  });
});
