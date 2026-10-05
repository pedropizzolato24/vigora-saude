/**
 * permission-texts.test.ts
 *
 * A central de permissões mostra, para cada item, uma descrição do que ele faz
 * e — enquanto não liberado — os passos para liberar. O leitor tem 60+ e muitas
 * vezes um aparelho de entrada: os passos precisam descrever o que ele de fato
 * vê e toca, e o que muda entre Android e iPhone.
 */
import { describe, expect, it } from "vitest";
import { permissionTexts, type PermissionKey } from "@/lib/permission-texts";

type Os = "android" | "ios";

/** Em que plataforma cada item existe (checkPermissions só o monta nelas). */
const ONDE: Record<PermissionKey, Os[]> = {
  notifications: ["android", "ios"],
  exactAlarm: ["android"],
  fullScreen: ["android"],
  battery: ["android"],
  alarmKit: ["ios"],
  locationForeground: ["android", "ios"],
  locationBackground: ["android", "ios"],
};

const chaves = Object.keys(ONDE) as PermissionKey[];
const pares = chaves.flatMap((k) => ONDE[k].map((os) => [k, os] as const));

describe("permissionTexts — cobertura", () => {
  it.each(pares)("%s (%s): descrição e passos não vazios", (key, os) => {
    const { description, steps } = permissionTexts(key, os, "motorola");
    expect(description.trim().length).toBeGreaterThan(40);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    for (const passo of steps) {
      expect(passo.trim().length).toBeGreaterThan(0);
      // Passo curto: quem lê tem 60+ e a fonte pode estar no máximo.
      expect(passo.length, `passo longo demais: ${passo}`).toBeLessThanOrEqual(190);
      // A numeração é da tela, não do texto.
      expect(passo, `passo já numerado: ${passo}`).not.toMatch(/^\s*\d+[.)]/);
    }
  });

  it.each(pares)("%s (%s): o primeiro passo é tocar em Liberar", (key, os) => {
    expect(permissionTexts(key, os, "motorola").steps[0]).toMatch(/Liberar/);
  });

  it("a descrição é a mesma nas duas plataformas (só os passos mudam)", () => {
    for (const key of ["notifications", "locationForeground", "locationBackground"] as const) {
      expect(permissionTexts(key, "android").description).toBe(
        permissionTexts(key, "ios").description,
      );
    }
  });
});

describe("permissionTexts — Android e iOS diferem onde o fluxo difere", () => {
  it.each(["notifications", "locationForeground", "locationBackground"] as const)(
    "%s tem passos diferentes por plataforma",
    (key) => {
      expect(permissionTexts(key, "android").steps).not.toEqual(permissionTexts(key, "ios").steps);
    },
  );

  it("localização o tempo todo: Android 'Permitir o tempo todo', iOS 'Sempre'", () => {
    const android = permissionTexts("locationBackground", "android").steps.join(" ");
    const ios = permissionTexts("locationBackground", "ios").steps.join(" ");
    expect(android).toMatch(/Permitir o tempo todo/);
    expect(android).not.toMatch(/Sempre/);
    expect(ios).toMatch(/Sempre/);
    expect(ios).not.toMatch(/tempo todo/);
  });

  it("onde o primeiro pedido pode perguntar e o seguinte abre os ajustes, cobre os dois", () => {
    for (const key of ["notifications", "locationForeground", "locationBackground"] as const) {
      for (const os of ["android", "ios"] as const) {
        const t = permissionTexts(key, os).steps.join(" ");
        expect(t, `${key}/${os}: falta o caso da pergunta`).toMatch(/pergunta/i);
        expect(t, `${key}/${os}: falta o caso dos ajustes`).toMatch(/ajustes/i);
      }
    }
  });

  it("telas de ajustes do Android que o botão realmente abre", () => {
    expect(permissionTexts("exactAlarm", "android").steps.join(" ")).toMatch(/Alarmes e lembretes/);
    expect(permissionTexts("fullScreen", "android").steps.join(" ")).toMatch(
      /Notificações em tela cheia/,
    );
  });
});

describe("permissionTexts — bateria e o passo extra do fabricante", () => {
  const passos = (m: string) => permissionTexts("battery", "android", m).steps;

  it("Samsung ganha os passos extras depois dos básicos", () => {
    const base = passos("motorola");
    const samsung = passos("samsung");
    expect(samsung.length).toBeGreaterThan(base.length);
    expect(samsung.slice(0, base.length)).toEqual(base);
    expect(samsung.slice(base.length).join(" ")).toMatch(/Cuidado do dispositivo/);
    expect(samsung.join(" ")).toMatch(/Apps em suspensão/);
  });

  it("Xiaomi/Redmi/POCO ganham 'Iniciar automaticamente'", () => {
    for (const m of ["Xiaomi", "redmi", "POCO"]) {
      expect(passos(m).join(" ")).toMatch(/Iniciar automaticamente/);
    }
  });

  it("aparelho stock fica só com os passos básicos", () => {
    expect(passos("motorola")).toHaveLength(2);
    expect(passos("")).toHaveLength(2);
  });
});

describe("permissionTexts — linguagem para 60+", () => {
  const proibidos = [
    "Android",
    "Samsung",
    "Xiaomi",
    "Redmi",
    "iPhone",
    "\\biOS\\b",
    "Autostart",
    "segundo plano",
    "background",
    "intent",
    "permissão de sistema",
    "otimização de bateria",
  ];

  it("nenhuma descrição ou passo cita plataforma, fabricante ou jargão", () => {
    const textos: string[] = [];
    for (const [key, os] of pares) {
      for (const m of ["motorola", "samsung", "xiaomi"]) {
        const t = permissionTexts(key, os, m);
        textos.push(t.description, ...t.steps);
      }
    }
    const achados = proibidos.filter((p) => new RegExp(p, "i").test(textos.join(" | ")));
    expect(achados, `termos técnicos: ${achados.join(", ")}`).toEqual([]);
  });
});
