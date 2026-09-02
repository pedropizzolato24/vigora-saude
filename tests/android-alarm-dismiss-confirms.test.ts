/**
 * android-alarm-dismiss-confirms.test.ts
 *
 * Responder "Dispensar" direto na notificação desligava o alarme no aparelho
 * mas NÃO registrava a resposta no servidor: 5 min depois o monitoring-job
 * marcava o evento como `missed` e a família era avisada de um alarme que o
 * idoso TINHA respondido. Relatado no aparelho em 01/09/2026, num Android sem
 * a permissão de full-screen intent (a tela do alarme nunca abria).
 *
 * Causa: o botão usava o `DISMISS_ACTION` do expo-alarm-module — um broadcast
 * que chama `Manager.stop` só em Java. O JS nunca sabia, então `confirmEvent`
 * nunca saía. É o MESMO defeito que motivou tirar o `SNOOZE_ACTION` da soneca.
 *
 * A correção espelha a da soneca: a action abre o app por deep link
 * (&dismiss=1) e quem desliga e confirma é a `alarm-ring`. Como lá, o contrato
 * atravessa Java → deep link → tela, e cada metade sozinha não desliga nem
 * confirma nada. O lado nativo é verificado no patch (teste de runtime não
 * alcança Java) — mesma técnica de alarm-ghost-pendingintents.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const patch = readFileSync(join(root, "patches", "expo-alarm-module.patch"), "utf8");
/** Só as linhas ADICIONADAS pelo patch (o que de fato vai para o build). */
const added = patch
  .split("\n")
  .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
  .map((l) => l.slice(1))
  .join("\n");

const alarmRing = readFileSync(join(root, "app", "alarm-ring.tsx"), "utf8");

describe("lado nativo — o botão abre o app em vez de resolver em Java", () => {
  it("a action de dispensar usa o deep link com &dismiss=1", () => {
    expect(added).toMatch(
      /addAction\([^\n]*dismissText, createOpenIntent\(context, alarmUid, id, "&dismiss=1"\)\)/
    );
  });

  it("o deep link do dispensar é um PendingIntent de ACTIVITY", () => {
    // getBroadcast voltaria ao defeito: o receiver resolve em Java e o JS não
    // fica sabendo. Só uma Activity traz o app (e o confirmEvent) junto.
    expect(added).toMatch(/private static PendingIntent createOpenIntent\(/);
    expect(added).toMatch(/createOpenIntent[\s\S]{0,900}?PendingIntent\.getActivity\(/);
  });

  it("nenhuma action da notificação usa mais os broadcasts nativos", () => {
    // O DELETE intent (swipe) continua no DISMISS_ACTION de propósito: um
    // PendingIntent de Activity disparado por swipe não tem a isenção de
    // background-activity-launch e poderia não abrir nada, deixando o alarme
    // tocando sem controle visível. Vão conhecido, documentado em alarmes.md.
    expect(added).not.toMatch(/addAction\([^\n]*createActionIntent\(/);
    expect(added).not.toMatch(/addAction\([^\n]*SNOOZE_ACTION/);
  });
});

describe("lado da tela — o deep link vira resposta confirmada", () => {
  it("alarm-ring executa o dispensar quando chega &dismiss=1", () => {
    expect(alarmRing).toMatch(/dismissParam !== '1'/);
    expect(alarmRing).toMatch(/autoDismissedRef/);
  });

  it("espera o alarme carregar antes de dispensar", () => {
    // Sem `alarm` o handleDismiss não chama confirmAlarmResponded — dispensar
    // cedo demais (cold start, antes do AsyncStorage) desligaria o alarme sem
    // confirmar, que é exatamente o bug original.
    const efeito = alarmRing.match(
      /if \(dismissParam !== '1' \|\| autoDismissedRef\.current \|\| !alarm\) return;/
    );
    expect(efeito).not.toBeNull();
  });

  it("dispensa uma única vez", () => {
    expect(alarmRing).toMatch(/autoDismissedRef\.current = true;\s*\r?\n\s*handleDismiss\(\);/);
  });
});
