/**
 * alarm-vibration-setting.test.ts
 *
 * Regressão do feedback 27/07: desligar a vibração no app não tinha efeito —
 * alarm-ring chamava Vibration.vibrate() incondicionalmente.
 *
 * Regra: vibra só quando a chave GLOBAL (Configurações) E a do PRÓPRIO alarme
 * permitem. No disparo a frio o state ainda não hidratou, então o valor
 * ausente é buscado no app state persistido antes de cair no default `true` —
 * senão o default venceria justamente no caso que mais importa (app morto).
 */
import { describe, expect, it } from "vitest";
import { shouldVibrate } from "../lib/_core/alarm-vibration";

const noStorage = async () => null;
const storage = (obj: unknown) => async () => JSON.stringify(obj);

describe("shouldVibrate — state hidratado", () => {
  it("vibra quando global e alarme permitem", async () => {
    const r = await shouldVibrate(
      { globalEnabled: true, alarmEnabled: true },
      "a1",
      noStorage
    );
    expect(r).toBe(true);
  });

  it("NÃO vibra com a chave global desligada", async () => {
    const r = await shouldVibrate(
      { globalEnabled: false, alarmEnabled: true },
      "a1",
      noStorage
    );
    expect(r).toBe(false);
  });

  it("NÃO vibra com a chave do alarme desligada", async () => {
    const r = await shouldVibrate(
      { globalEnabled: true, alarmEnabled: false },
      "a1",
      noStorage
    );
    expect(r).toBe(false);
  });
});

describe("shouldVibrate — disparo a frio (state não hidratado)", () => {
  it("lê a chave global do storage em vez de usar o default true", async () => {
    const r = await shouldVibrate(
      {},
      "a1",
      storage({
        settings: { vibrationEnabled: false },
        alarms: [{ id: "a1", vibration: true }],
      })
    );
    expect(r).toBe(false);
  });

  it("lê a chave do alarme do storage", async () => {
    const r = await shouldVibrate(
      {},
      "a1",
      storage({
        settings: { vibrationEnabled: true },
        alarms: [{ id: "a1", vibration: false }],
      })
    );
    expect(r).toBe(false);
  });

  it("casa o alarme por id — outro alarme desligado não silencia este", async () => {
    const r = await shouldVibrate(
      {},
      "a1",
      storage({
        settings: { vibrationEnabled: true },
        alarms: [
          { id: "outro", vibration: false },
          { id: "a1", vibration: true },
        ],
      })
    );
    expect(r).toBe(true);
  });

  it("sem storage: vibra (default seguro para um alarme)", async () => {
    expect(await shouldVibrate({}, "a1", noStorage)).toBe(true);
  });

  it("storage ilegível não derruba o alarme", async () => {
    const broken = async () => "{ isto não é json";
    expect(await shouldVibrate({}, "a1", broken)).toBe(true);
  });
});
