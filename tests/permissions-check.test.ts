/**
 * permissions-check.test.ts
 *
 * O app pedia cada permissão UMA vez, na tela onde ela é usada. Quem tocasse
 * "Agora não" (ou não entendesse o diálogo do sistema — nosso público tem 60+)
 * ficava sem ela para sempre: alarme sem tela cheia, app morto pelo OEM antes
 * do alarme tocar, dead man's switch desarmado em silêncio.
 *
 * `checkPermissions` é a fonte única do que falta. As regras que ela precisa
 * cumprir, e que este arquivo trava:
 *
 *  - o cuidador não recebe permissões de alarme (o perfil dele não toca alarme);
 *  - permissão que o aparelho NÃO TEM (ROM enxuta, módulo nativo ausente) some
 *    da lista em vez de virar um item vermelho impossível de resolver;
 *  - "o tempo todo" só aparece depois da localização em primeiro plano, que é
 *    pré-requisito dela no Android.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  os: "android" as "android" | "ios",
  notif: "granted" as string,
  notifCanAskAgain: true,
  exactAlarm: true as boolean | Error,
  fullScreen: true as boolean | Error,
  battery: true as boolean | Error,
  locationFg: true,
  locationBg: true,
  alarmKitAvailable: false,
  alarmKitStatus: "authorized" as "authorized" | "denied" | "notDetermined",
  manufacturer: "motorola",
}));

const resolveOrThrow = (v: boolean | Error) => {
  if (v instanceof Error) return Promise.reject(v);
  return Promise.resolve(v);
};

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return env.os;
    },
    Version: 34,
    get constants() {
      return { Manufacturer: env.manufacturer };
    },
  },
  Linking: { openSettings: async () => {}, openURL: async () => {} },
}));

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: async () => ({
    status: env.notif,
    canAskAgain: env.notifCanAskAgain,
  }),
}));

vi.mock("@/lib/notifications-utils", () => ({
  requestNotificationPermissions: async () => env.notif === "granted",
}));

vi.mock("expo-alarm-countdown", () => ({
  canScheduleExactAlarms: () => resolveOrThrow(env.exactAlarm),
  canUseFullScreenIntent: () => resolveOrThrow(env.fullScreen),
  isIgnoringBatteryOptimizations: () => resolveOrThrow(env.battery),
  openExactAlarmSettings: async () => {},
  openFullScreenIntentSettings: async () => {},
}));

vi.mock("@/lib/battery-optimization", () => ({
  openBatteryOptimizationSettings: async () => {},
}));

vi.mock("@/lib/location-permission", () => ({
  isForegroundLocationGranted: async () => env.locationFg,
  isBackgroundLocationGranted: async () => env.locationBg,
  requestForegroundLocation: async () => env.locationFg,
  requestBackgroundLocation: async () => env.locationBg,
  openLocationSettings: async () => {},
}));

vi.mock("@/lib/ios-alarm-kit", () => ({
  isAlarmKitAvailable: () => env.alarmKitAvailable,
  requestAlarmKitAuthorization: async () => env.alarmKitStatus,
}));

import { canInterruptRoute, checkPermissions } from "@/lib/permissions-check";

const keys = async (userType: "monitored" | "caregiver" = "monitored") =>
  (await checkPermissions(userType)).map((p) => p.key);

beforeEach(() => {
  env.os = "android";
  env.notif = "granted";
  env.notifCanAskAgain = true;
  env.exactAlarm = true;
  env.fullScreen = true;
  env.battery = true;
  env.locationFg = true;
  env.locationBg = true;
  env.alarmKitAvailable = false;
  env.alarmKitStatus = "authorized";
  env.manufacturer = "motorola";
  vi.restoreAllMocks();
});

describe("checkPermissions", () => {
  it("lista as permissões de alarme do idoso no Android", async () => {
    expect(await keys()).toEqual([
      "notifications",
      "exactAlarm",
      "fullScreen",
      "battery",
      "locationForeground",
      "locationBackground",
    ]);
  });

  it("não pede permissão de alarme ao cuidador", async () => {
    expect(await keys("caregiver")).toEqual(["notifications"]);
  });

  it("marca como concedida a permissão que o sistema já liberou", async () => {
    const itens = await checkPermissions("monitored");
    expect(itens.every((p) => p.granted)).toBe(true);
  });

  it("marca como faltando a permissão negada", async () => {
    env.battery = false;
    const item = (await checkPermissions("monitored")).find((p) => p.key === "battery");
    expect(item?.granted).toBe(false);
  });

  it("omite (e loga) a permissão que o aparelho não sabe responder", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    env.fullScreen = new Error("módulo nativo ausente");

    expect(await keys()).not.toContain("fullScreen");
    expect(warn.mock.calls.flat().join(" ")).toContain("módulo nativo ausente");
  });

  it("só oferece localização o tempo todo depois da localização em uso", async () => {
    env.locationFg = false;
    const k = await keys();
    expect(k).toContain("locationForeground");
    expect(k).not.toContain("locationBackground");
  });

  it("no iOS troca as permissões de alarme do Android pela do AlarmKit", async () => {
    env.os = "ios";
    env.alarmKitAvailable = true;
    env.alarmKitStatus = "denied";

    const itens = await checkPermissions("monitored");
    const k = itens.map((p) => p.key);
    expect(k).toEqual(["notifications", "alarmKit", "locationForeground", "locationBackground"]);
    expect(itens.find((p) => p.key === "alarmKit")?.granted).toBe(false);
  });

  it("não mostra AlarmKit em iPhone que não o tem", async () => {
    env.os = "ios";
    env.alarmKitAvailable = false;
    expect(await keys()).not.toContain("alarmKit");
  });
});

describe("canInterruptRoute", () => {
  it("interrompe a home do idoso e a do cuidador", () => {
    expect(canInterruptRoute("/")).toBe(true);
    expect(canInterruptRoute("/alarms")).toBe(true);
    expect(canInterruptRoute("/health")).toBe(true);
  });

  it("NUNCA interrompe um alarme tocando", () => {
    expect(canInterruptRoute("/alarm-ring")).toBe(false);
    expect(canInterruptRoute("/alarm-ring?alarmId=a1&fromAlarmKit=1")).toBe(false);
    expect(canInterruptRoute("/checkin-response")).toBe(false);
  });

  it("não interrompe o funil de entrada", () => {
    for (const rota of [
      "/onboarding",
      "/login",
      "/email-login",
      "/phone-login",
      "/register",
      "/caregiver-onboarding",
      "/convite/abc123",
      "/oauthredirect",
      "/oauth/callback",
    ]) {
      expect(canInterruptRoute(rota), rota).toBe(false);
    }
  });

  it("não se empilha sobre si mesma", () => {
    expect(canInterruptRoute("/permissions")).toBe(false);
  });

  it("com a rota ainda indefinida, não interrompe", () => {
    expect(canInterruptRoute(null)).toBe(false);
  });
});

describe("passo extra de bateria por fabricante", () => {
  const porqueDaBateria = async () => {
    env.battery = false;
    const itens = await checkPermissions("monitored");
    return itens.find((p) => p.key === "battery")?.why ?? "";
  };

  it("ensina o passo da lista propria do fabricante quando ele existe", async () => {
    env.manufacturer = "samsung";
    const why = await porqueDaBateria();
    expect(why).toMatch(/Cuidado do dispositivo/);
    // O passo do fabricante e o 3o: sem os passos 1 e 2 no proprio texto, ele
    // comeca numerando do nada.
    expect(why).toContain("1.");
    expect(why).toContain("2.");
  });

  it("aparelho stock nao ganha passo extra", async () => {
    env.manufacturer = "motorola";
    expect(await porqueDaBateria()).not.toMatch(/Cuidado do dispositivo/);
  });
});

describe("linguagem da central — publico 60+", () => {
  const proibidos = ["Android", "Samsung", "Xiaomi", "Redmi", "iPhone", "Autostart", "segundo plano"];

  it("nenhum titulo ou explicacao cita plataforma, fabricante ou jargao", async () => {
    env.os = "ios";
    env.alarmKitAvailable = true;
    const ios = await checkPermissions("monitored");
    env.os = "android";
    env.manufacturer = "samsung";
    const android = await checkPermissions("monitored");

    const textos = [...ios, ...android].map((p) => `${p.title} ${p.why}`).join(" | ");
    const achados = proibidos.filter((t) => new RegExp(t, "i").test(textos));
    expect(achados, `termos tecnicos na central: ${achados.join(", ")}`).toEqual([]);
  });
});
