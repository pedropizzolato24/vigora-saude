/**
 * android-alarm-vibration-native.test.ts
 *
 * Com a vibração ligada, o alarme não vibrava quando o disparo virava só uma
 * notificação — Android sem a permissão de full-screen intent, aparelho em uso
 * ou OEM restringindo o launch em background. Relatado no aparelho em
 * 01/09/2026.
 *
 * Causa: a ÚNICA fonte de vibração era a tela `alarm-ring`, e a tela nem
 * sempre abre. O canal e o serviço nativo tinham sido silenciados de propósito
 * (eles não conheciam as configurações do usuário e vibravam sempre).
 *
 * A correção devolve a vibração ao serviço nativo — que roda em todo disparo,
 * com ou sem tela — mas agora ele lê as MESMAS duas chaves do app: a global
 * (persistida por `setAlarmVibration`) e a do próprio alarme (campo
 * `vibration`, mandado em todo agendamento). Sem qualquer uma das metades o
 * bug volta em silêncio, então o contrato fica travado nas duas pontas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const manager = readFileSync(join(root, "lib", "native-alarm-manager.ts"), "utf8");
const appContext = readFileSync(join(root, "lib", "app-context.tsx"), "utf8");

const patch = readFileSync(join(root, "patches", "expo-alarm-module.patch"), "utf8");
/** Só as linhas ADICIONADAS pelo patch (o que de fato vai para o build). */
const added = patch
  .split("\n")
  .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
  .map((l) => l.slice(1))
  .join("\n");

describe("lado JS — as duas chaves saem do app", () => {
  it("todo agendamento nativo manda a chave do alarme", () => {
    const schedules = manager.match(/snoozeText: 'Soneca',/g) ?? [];
    const vibrations = manager.match(/vibration: alarm\.vibration !== false,/g) ?? [];
    // Inclui a soneca: re-armar não pode perder a preferência do alarme.
    expect(schedules.length).toBeGreaterThan(0);
    expect(vibrations.length).toBe(schedules.length);
  });

  it("usa `!== false` — chave ausente continua vibrando", () => {
    // Alarme legado tem o campo undefined; `=== true` deixaria todos eles sem
    // vibrar. Não vibrar por falta de informação é pior do que vibrar demais.
    expect(manager).not.toMatch(/vibration: alarm\.vibration === true/);
  });

  it("a chave global indefinida vira `true`, não `false`", () => {
    // `LOAD_STATE` substitui `settings` inteiro sem merge com os defaults, então
    // um blob salvo antes desta chave existir deixa `vibrationEnabled`
    // indefinido (é por isso que `shouldVibrate` também tem `?? true`). Sem o
    // `!== false`, esse undefined atravessaria a ponte para um `boolean` do
    // Java: ou lança, ou vira false e desliga a vibração de quem nunca pediu.
    expect(manager).toMatch(/setAlarmVibration\(enabled !== false\)/);
    expect(manager).not.toMatch(/setAlarmVibration\(enabled\)/);
  });

  it("a chave GLOBAL é empurrada ao nativo na hidratação e a cada mudança", () => {
    // Sem isso, desligar a vibração nas Configurações só valeria na tela — e o
    // serviço nativo continuaria vibrando, que foi o motivo de terem tirado a
    // vibração dele da primeira vez.
    expect(manager).toMatch(/export async function setNativeAlarmVibration/);
    expect(appContext).toMatch(/setNativeAlarmVibration\(state\.settings\.vibrationEnabled\)/);
    expect(appContext).toMatch(/\[state\.settings\.vibrationEnabled, state\.isLoading\]/);
  });
});

describe("lado nativo — o serviço vibra respeitando as duas chaves", () => {
  it("o modelo Alarm ganhou o campo de vibração", () => {
    expect(added).toMatch(/Boolean vibration;/);
  });

  it("usa Boolean (objeto), não primitivo — alarme já gravado não pode parar de vibrar", () => {
    // Gson preenche primitivo ausente com false: com `boolean vibration`, todo
    // alarme salvo antes do update ficaria sem vibrar na primeira leitura.
    expect(added).not.toMatch(/\bboolean vibration;/);
  });

  it("o parser lê a chave vinda do JS com default de vibrar", () => {
    expect(added).toMatch(/hasKey\("vibration"\)/);
  });

  it("a chave global é persistida (o disparo acontece sem o app aberto)", () => {
    expect(added).toMatch(/public void setAlarmVibration/);
    expect(added).toMatch(/static void saveVibrationEnabled/);
    expect(added).toMatch(/static boolean getVibrationEnabled/);
  });

  it("Manager.start só vibra quando AS DUAS chaves permitem", () => {
    expect(added).toMatch(/alarm\.vibration == null \|\| alarm\.vibration/);
    expect(added).toMatch(/!alarmWants \|\| !Storage\.getVibrationEnabled\(context\)/);
  });

  it("vibra também no alarme sem som", () => {
    // "Som" desmarcado sai de Manager.start por um `return` antecipado; sem a
    // chamada nesse ramo, o alarme silencioso ficaria sem nenhum aviso físico.
    expect(added).toMatch(/nao vai tocar"\);\s*\r?\n\s*startVibration\(context, alarm\);/);
  });

  it("repete o padrão até ser cancelado, e todo encerramento cancela", () => {
    expect(added).toMatch(/vibrator\.vibrate\(VIBRATION_PATTERN, 0\)/);
    // stop (dispensar), snooze e remove — os três caminhos que encerram o
    // disparo. Um deles sem cancel deixaria o aparelho vibrando para sempre.
    expect((added.match(/stopVibration\(\);/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("usa o MESMO padrão da tela — nada de vibração dobrada", () => {
    // Vibrator.vibrate do mesmo app substitui a vibração em curso: com padrões
    // iguais, tela e serviço juntos não mudam nada. Padrões diferentes fariam a
    // vibração "pular" no instante em que a tela abre.
    const alarmRing = readFileSync(join(root, "app", "alarm-ring.tsx"), "utf8");
    expect(alarmRing).toMatch(/Vibration\.vibrate\(\[0, 500, 500, 500\], true\)/);
    expect(added).toMatch(/VIBRATION_PATTERN = new long\[\]\{0, 500, 500, 500\}/);
  });
});
