/**
 * alarm-ghost-pendingintents.test.ts
 *
 * "Alarmes fantasma": cada AlarmDates nasce com notificationIds ALEATÓRIOS, e
 * o app reagenda TODOS os alarmes a cada abertura (syncAlarmsOnStartup →
 * Manager.schedule). A lib original nunca cancelava os PendingIntents
 * anteriores — eles ficavam armados no AlarmManager e disparavam em rajada no
 * horário do alarme: som reiniciando, full-screen relançada (voz repetindo em
 * fila), instâncias empilhadas da tela escalando sozinhas, e notificação
 * genérica para alarme já desativado (observado no S10, 28/07).
 *
 * O patch cancela os disparos anteriores do uid antes de qualquer
 * (re)agendamento. A regressão é SILENCIOSA — os fantasmas só aparecem depois
 * de várias aberturas do app — então este teste fixa o conserto no patch.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const patch = readFileSync(
  join(__dirname, "..", "patches", "expo-alarm-module.patch"),
  "utf8"
);

/** Só as linhas ADICIONADAS pelo patch (o que de fato vai para o build). */
const added = patch
  .split("\n")
  .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
  .map((l) => l.slice(1))
  .join("\n");

describe("agendamento nativo — sem PendingIntents fantasma", () => {
  it("o patch define o cancelamento dos disparos anteriores do uid", () => {
    expect(added).toMatch(/private static void cancelPreviousDates/);
  });

  it("schedule E reschedule cancelam antes de agendar", () => {
    const calls = added.match(/cancelPreviousDates\(context, alarm\.uid\);/g) ?? [];
    // Um em Manager.schedule (todo (re)agendamento do app) e um em
    // Manager.reschedule (BootReceiver após reiniciar o aparelho).
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
