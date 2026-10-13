/**
 * dms-pauses-signals.test.ts
 *
 * "Qualquer sinal do aparelho retoma a pausa." Quem decide o que é sinal são as
 * rotas autenticadas do app do idoso; esta guarda de código-fonte (mesmo estilo
 * de alarm-changes-lifecycle.test.ts) trava que cada uma chama `touchLiveness`.
 * Sem isso o idoso voltaria a dar sinal e ficaria sem pré-registro nem aviso.
 *
 * `monitoring.heartbeat` e `monitoring.register` retomam por `recordHeartbeat`
 * (testado em db-monitoring-pauses.test.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const calls = (src: string) => (src.match(/touchLiveness\(/g) ?? []).length;

describe("sinais que retomam a pausa chamam touchLiveness", () => {
  it("userData.put", () => {
    expect(calls(read("server/routers.ts"))).toBeGreaterThanOrEqual(1);
  });

  it("monitoring.createEvent e monitoring.confirmEvent", () => {
    expect(calls(read("server/routers-monitoring.ts"))).toBeGreaterThanOrEqual(2);
  });

  it("push.register", () => {
    expect(calls(read("server/routers-push.ts"))).toBeGreaterThanOrEqual(1);
  });

  it("managedAlarms.ack", () => {
    expect(calls(read("server/routers-managed-alarms.ts"))).toBeGreaterThanOrEqual(1);
  });
});
