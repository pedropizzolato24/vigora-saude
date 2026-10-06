/**
 * Tabela nova precisa entrar nos três ciclos de vida: exclusão de conta
 * (LGPD Art. 18, VI), exportação (Art. 18, V) e retenção (minimização).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("alarm_changes — ciclo de vida do dado", () => {
  it("a exclusão de conta apaga as mudanças de alarme", () => {
    expect(read("server/db-account.ts")).toMatch(
      /tx\.delete\(alarmChanges\)\.where\(eq\(alarmChanges\.openId, openId\)\)/
    );
  });

  it("a exportação inclui as mudanças de alarme", () => {
    const routers = read("server/routers.ts");
    expect(routers).toMatch(/getRecentAlarmChanges\(openId, LIMITE_EXPORTACAO\)/);
    expect(routers).toMatch(/historicoDeAlteracoesDeAlarmes/);
    expect(read("lib/_core/data-export.ts")).toMatch(/historicoDeAlteracoesDeAlarmes: unknown\[\]/);
  });

  it("a retenção expurga as mudanças de alarme", () => {
    expect(read("server/db-monitoring.ts")).toMatch(/db\.delete\(alarmChanges\)/);
  });
});
