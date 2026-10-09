import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// O componente não é importável no vitest (RN): trava no nível do fonte que a
// chave de dedup do re-sync inclui o que muda o servidor (prazo e próximo disparo).
describe("monitoring-initializer: chave de dedup do sync de alarmes", () => {
  const src = readFileSync("components/monitoring-initializer.tsx", "utf8");
  const start = src.indexOf("const hash = state.alarms");
  const line = src.slice(start, src.indexOf("lastAlarmHashRef.current = hash", start));

  it.each(["a.kind", "a.repeat", "a.customDays", "a.escalateAfterMinutes"])("inclui %s", (field) => {
    expect(line).toContain(field);
  });
  it("ordena customDays para a chave não depender da ordem", () => {
    expect(line).toMatch(/customDays[^`]*\.sort\(\)/);
  });
});
