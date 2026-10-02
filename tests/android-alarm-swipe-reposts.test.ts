/**
 * android-alarm-swipe-reposts.test.ts
 *
 * Android 14+ deixa dispensar por swipe uma notificação com setOngoing(true).
 * O swipe dispara o deleteIntent (DISMISS_ACTION). Antes, o receiver chamava
 * Manager.stop em Java: o alarme parava sem o JS saber, o evento ficava
 * pendente e o servidor avisava a família de um alarme que ninguém respondeu.
 *
 * Agora o swipe reposta a notificação e o alarme segue tocando — só o botão
 * "Dispensar" (deep link) ou abrir o app o desligam. Sem alarme ativo, nada é
 * repostado (um DISMISS_ACTION velho não ressuscita notificação nenhuma).
 *
 * O lado nativo é verificado no patch (teste de runtime não alcança Java) — mesma
 * técnica de android-alarm-dismiss-confirms.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const patch = readFileSync(
  join(__dirname, "..", "patches", "expo-alarm-module.patch"),
  "utf8"
);

const MANAGER = "android/src/main/java/com/expoalarmmodule/Manager.java";
const RECEIVER =
  "android/src/main/java/com/expoalarmmodule/receivers/NotificationActionReceiver.java";

/** Texto de um arquivo DEPOIS do patch: contexto + linhas adicionadas dos hunks dele. */
function afterPatch(filePath: string): string {
  const section = patch
    .split(/^diff --git /m)
    .slice(1)
    .find((s) => s.startsWith(`a/${filePath} `));
  if (!section) return "";
  return section
    .split("\n")
    .filter(
      (l) =>
        !l.startsWith("-") &&
        !l.startsWith("@@") &&
        !l.startsWith("index ") &&
        !l.startsWith("a/")
    )
    .map((l) => l.slice(1))
    .join("\n");
}

describe("swipe na notificação do alarme (Android 14+)", () => {
  it("o Manager expõe o repost e usa o mesmo id do foreground service", () => {
    const manager = afterPatch(MANAGER);
    expect(manager).toMatch(
      /public static boolean repostActiveAlarmNotification\(Context context\)/
    );
    // O AlarmService chama startForeground(1, ...): notify com o MESMO id
    // atualiza a notificação do serviço em vez de criar uma segunda.
    expect(manager).toMatch(/manager\.notify\(1, notification\)/);
  });

  it("sem alarme ativo não reposta nada", () => {
    // Um DISMISS_ACTION velho (chegando depois do dismiss pelo app) não pode
    // fazer a notificação voltar.
    const manager = afterPatch(MANAGER);
    expect(manager).toMatch(/if \(activeAlarmUid == null\) return false;/);
  });

  it("o DISMISS_ACTION reposta em vez de parar o alarme", () => {
    const receiver = afterPatch(RECEIVER);
    const dismissCase = receiver.match(/case "DISMISS_ACTION":([\s\S]*?)break;/);
    expect(dismissCase).not.toBeNull();
    const body = dismissCase![1];
    expect(body).toMatch(/if \(!Manager\.repostActiveAlarmNotification\(context\)\) \{/);
    // Manager.stop só no ramo SEM alarme ativo — depois da tentativa de repost.
    expect(body.indexOf("repostActiveAlarmNotification")).toBeGreaterThanOrEqual(0);
    expect(body.indexOf("repostActiveAlarmNotification")).toBeLessThan(
      body.indexOf("Manager.stop(context)")
    );
  });
});
