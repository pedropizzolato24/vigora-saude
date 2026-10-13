/**
 * Plano de aplicação da lista gerenciada (função pura): o que cancelar, o que
 * agendar e qual lista vira o estado local.
 */
import { describe, expect, it } from "vitest";
import { planManagedApply, sameManagedFields } from "../lib/managed-alarms-apply";
import type { Alarm } from "../lib/app-context";
import type { ManagedAlarm } from "../shared/managed-alarm";

const srv = (id: string, over: Partial<ManagedAlarm> = {}): ManagedAlarm => ({
  id,
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
  sound: true,
  vibration: true,
  ...over,
});

const loc = (id: string, over: Partial<Alarm> = {}): Alarm => ({
  ...srv(id),
  nativeAlarmUids: [`vigora_${id}`],
  notificationId: `n-${id}`,
  ...over,
});

describe("planManagedApply", () => {
  it("lista igual: nada a cancelar nem agendar, e os inalterados mantêm os uids", () => {
    const a = loc("a");
    const plan = planManagedApply([a], [srv("a")]);
    expect(plan.toCancel).toEqual([]);
    expect(plan.toSchedule).toEqual([]);
    expect(plan.next).toEqual([a]);
    expect(plan.next[0]).toBe(a);
  });

  it("alarme novo e ligado: agenda; sem uids", () => {
    const plan = planManagedApply([], [srv("a")]);
    expect(plan.toCancel).toEqual([]);
    expect(plan.toSchedule.map((x) => x.id)).toEqual(["a"]);
    expect(plan.next).toHaveLength(1);
    expect(plan.next[0].nativeAlarmUids).toBeUndefined();
  });

  it("alarme novo e desligado: entra na lista, mas não agenda", () => {
    const plan = planManagedApply([], [srv("a", { enabled: false })]);
    expect(plan.toSchedule).toEqual([]);
    expect(plan.next.map((x) => x.id)).toEqual(["a"]);
  });

  it("alarme removido pelo cuidador: cancela o local (com os uids dele)", () => {
    const a = loc("a");
    const plan = planManagedApply([a], []);
    expect(plan.toCancel).toEqual([a]);
    expect(plan.toSchedule).toEqual([]);
    expect(plan.next).toEqual([]);
  });

  it("horário mudou: cancela o antigo (com uids) e agenda o novo sem herdar os uids", () => {
    const a = loc("a");
    const plan = planManagedApply([a], [srv("a", { time: "09:30" })]);
    expect(plan.toCancel).toEqual([a]);
    expect(plan.toSchedule).toHaveLength(1);
    expect(plan.toSchedule[0].time).toBe("09:30");
    expect(plan.toSchedule[0].nativeAlarmUids).toBeUndefined();
    expect(plan.toSchedule[0].notificationId).toBeUndefined();
  });

  it.each([
    ["descrição", { description: "Metformina" }],
    ["som", { sound: false }],
    ["vibração", { vibration: false }],
    ["repetição", { repeat: "weekdays" as const }],
  ])("só %s mudou: também reagenda (o texto/canal do alarme muda)", (_nome, over) => {
    const plan = planManagedApply([loc("a")], [srv("a", over)]);
    expect(plan.toCancel).toHaveLength(1);
    expect(plan.toSchedule).toHaveLength(1);
  });

  it("ligado -> desligado: cancela e não agenda", () => {
    const plan = planManagedApply([loc("a")], [srv("a", { enabled: false })]);
    expect(plan.toCancel).toHaveLength(1);
    expect(plan.toSchedule).toEqual([]);
    expect(plan.next[0].enabled).toBe(false);
  });

  it("desligado -> ligado: agenda", () => {
    const off = loc("a", { enabled: false, nativeAlarmUids: [], notificationId: undefined });
    const plan = planManagedApply([off], [srv("a")]);
    expect(plan.toSchedule.map((x) => x.id)).toEqual(["a"]);
  });

  it("dias personalizados em outra ordem NÃO contam como mudança", () => {
    const a = loc("a", { repeat: "custom", customDays: [3, 1] });
    const plan = planManagedApply([a], [srv("a", { repeat: "custom", customDays: [1, 3] })]);
    expect(plan.toCancel).toEqual([]);
    expect(plan.toSchedule).toEqual([]);
  });

  it("customDays vazio x ausente em alarme que não é personalizado NÃO conta como mudança", () => {
    const a = loc("a", { customDays: undefined });
    const plan = planManagedApply([a], [srv("a", { customDays: [] })]);
    expect(plan.toCancel).toEqual([]);
  });

  it("o servidor sempre grava customDays (talvez []) e omite kind em remédio: a lista local sem esses campos NÃO conta como mudança", () => {
    // Forma canônica do servidor: customDays presente (vazio) e kind ausente.
    const canonico = srv("a", { customDays: [] });
    expect(canonico.kind).toBeUndefined();
    const a = loc("a"); // local sem customDays e sem kind
    const b = loc("b", { kind: "medication", customDays: [] }); // local com tudo explícito
    expect(sameManagedFields(a, canonico)).toBe(true);
    expect(sameManagedFields(b, canonico)).toBe(true);
    const plan = planManagedApply([a, loc("b")], [canonico, srv("b", { customDays: [] })]);
    expect(plan.toCancel).toEqual([]);
    expect(plan.toSchedule).toEqual([]);
  });

  it("repeat 'custom' com customDays ausente x [] também é igual", () => {
    const a = loc("a", { repeat: "custom", customDays: undefined });
    expect(sameManagedFields(a, srv("a", { repeat: "custom", customDays: [] }))).toBe(true);
  });

  it("kind ausente é remédio: igual a 'medication'", () => {
    const a = loc("a");
    expect(sameManagedFields(a, srv("a", { kind: "medication" }))).toBe(true);
  });

  it("check-in: mudar o atraso do aviso reagenda; em remédio o campo é ignorado", () => {
    const c = loc("c", { kind: "checkin", escalateAfterMinutes: 15 });
    expect(sameManagedFields(c, srv("c", { kind: "checkin", escalateAfterMinutes: 30 }))).toBe(false);
    expect(sameManagedFields(c, srv("c", { kind: "checkin", escalateAfterMinutes: 15 }))).toBe(true);
    const m = loc("m", { escalateAfterMinutes: 5 });
    expect(sameManagedFields(m, srv("m"))).toBe(true);
  });

  it("mistura: mantém, remove, altera e cria na mesma aplicação", () => {
    const keep = loc("keep");
    const gone = loc("gone");
    const edit = loc("edit");
    const plan = planManagedApply(
      [keep, gone, edit],
      [srv("keep"), srv("edit", { time: "21:00" }), srv("new", { time: "07:00" })]
    );
    expect(plan.toCancel.map((x) => x.id).sort()).toEqual(["edit", "gone"]);
    expect(plan.toSchedule.map((x) => x.id).sort()).toEqual(["edit", "new"]);
    expect(plan.next.map((x) => x.id)).toEqual(["keep", "edit", "new"]);
    expect(plan.next[0]).toBe(keep);
  });
});
