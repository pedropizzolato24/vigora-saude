import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const card = read("components/managed-alarms-card.tsx");
const settings = read("app/(tabs)/settings.tsx");

describe("ManagedAlarmsCard", () => {
  it("existe versão para o modo acessível, com alvo de toque grande", () => {
    expect(card).toContain("useAccessibility");
    expect(card).toMatch(/isAccessibilityMode \? \(/);
    expect(card).toMatch(/minHeight: as_\.touchTarget/);
    expect(card).toMatch(/minHeight: fs\.touch\(44\)/);
  });

  it("só aparece com acordo ativo", () => {
    expect(card).toMatch(/const management = state\.management;/);
    expect(card).toMatch(/\{management \? \(/);
  });

  it("parar pede confirmação e só limpa o acordo local depois que o servidor aceitou", () => {
    expect(card).toMatch(/variant: 'confirm'/);
    expect(card).toMatch(/style: 'destructive'/);
    const parar = card.slice(card.indexOf("managedAlarms.stopBeingManaged"));
    const falha = parar.indexOf("result === null");
    const limpa = parar.indexOf("type: 'SET_MANAGEMENT', payload: null");
    expect(falha).toBeGreaterThan(-1);
    expect(limpa).toBeGreaterThan(falha);
  });

  it("não usa Alert.alert nem cor fixa", () => {
    expect(card).not.toMatch(/Alert\.alert/);
    expect(card).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
  });
});

describe("Configurações", () => {
  it("o cartão aparece nos dois modos (normal e acessível)", () => {
    expect(settings).toMatch(/import \{ ManagedAlarmsCard \} from '@\/components\/managed-alarms-card';/);
    expect((settings.match(/<ManagedAlarmsCard \/>/g) ?? []).length).toBe(2);
  });
});
