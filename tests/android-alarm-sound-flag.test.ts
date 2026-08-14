/**
 * android-alarm-sound-flag.test.ts
 *
 * Desmarcar "Som" no formulário não silenciava o alarme no Android: o som saía
 * por 1-2s e só parava quando a tela do alarme pausava o serviço para o TTS
 * falar — depois do fato, e só se a tela abrisse. Medido no aparelho em
 * 14/08/2026.
 *
 * Causa: `scheduleNativeAlarm` nunca passava `alarm.sound` ao módulo nativo, e
 * `Manager.start` tocava incondicionalmente porque o modelo `Alarm` do lado
 * Java não tinha esse campo.
 *
 * São duas metades que só funcionam juntas — o JS mandar sem o nativo ler (ou
 * o contrário) não silencia nada e não quebra nada visivelmente. Por isso o
 * contrato fica travado dos dois lados. O lado nativo é verificado no patch,
 * como já se faz em alarm-ghost-pendingintents.test.ts: teste de runtime não
 * alcança Java, e `require('expo-alarm-module')` nem carrega no vitest.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const manager = readFileSync(join(root, "lib", "native-alarm-manager.ts"), "utf8");

const patch = readFileSync(join(root, "patches", "expo-alarm-module.patch"), "utf8");
/** Só as linhas ADICIONADAS pelo patch (o que de fato vai para o build). */
const added = patch
  .split("\n")
  .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
  .map((l) => l.slice(1))
  .join("\n");

describe("lado JS — a preferência sai do app", () => {
  it("todo agendamento nativo manda a preferência de som", () => {
    const schedules = manager.match(/snoozeText: 'Soneca',/g) ?? [];
    const sounds = manager.match(/sound: alarm\.sound !== false,/g) ?? [];
    // Inclui a soneca: re-armar um alarme silencioso não pode devolver o som.
    expect(schedules.length).toBeGreaterThan(0);
    expect(sounds.length).toBe(schedules.length);
  });

  it("usa `!== false` — chave ausente continua tocando", () => {
    // `alarm.sound === true` silenciaria todo alarme legado (campo undefined),
    // que é exatamente o desastre que o default do lado Java também evita.
    expect(manager).not.toMatch(/sound: alarm\.sound === true/);
  });
});

describe("lado nativo — o serviço respeita a preferência", () => {
  it("o modelo Alarm ganhou o campo de som", () => {
    expect(added).toMatch(/Boolean sound;/);
  });

  it("usa Boolean (objeto), não primitivo — alarme já gravado não pode emudecer", () => {
    // Gson preenche primitivo ausente com false: com `boolean sound`, TODO
    // alarme salvo antes do update viraria silencioso na primeira leitura.
    expect(added).not.toMatch(/\bboolean sound;/);
  });

  it("o parser lê a chave vinda do JS com default de tocar", () => {
    expect(added).toMatch(/hasKey\("sound"\)/);
    expect(added).toMatch(/Boolean\.TRUE/);
  });

  it("Manager.start desiste de tocar quando a preferência é falsa", () => {
    expect(added).toMatch(/soundEnabled/);
    expect(added).toMatch(/alarm\.sound == null \|\| alarm\.sound/);
  });

  it("zera a referência do som ao sair silencioso", () => {
    // Sem isso, o resumeSound() do fim da fala ressuscitaria o Sound do
    // disparo ANTERIOR no meio de um alarme que deveria ser mudo.
    expect(added).toMatch(/sound = null;/);
  });
});
