import { describe, expect, it } from "vitest";
import {
  buildAlarmChangePush,
  diffAlarms,
  pickPersonName,
  type AlarmChange,
} from "../server/_core/alarm-diff";

const losartana = { id: "a1", time: "08:00", description: "Losartana", enabled: true, repeat: "daily" };
const metformina = { id: "a2", time: "20:00", description: "Metformina", enabled: true, repeat: "daily" };

describe("diffAlarms", () => {
  it("lista igual não gera mudança", () => {
    expect(diffAlarms([losartana, metformina], [metformina, losartana])).toEqual([]);
  });

  it("alarme que sumiu da lista é 'deleted'", () => {
    expect(diffAlarms([losartana, metformina], [metformina])).toEqual([
      { alarmId: "a1", alarmDescription: "Losartana", changeType: "deleted", oldTime: "08:00", newTime: null },
    ]);
  });

  it("alarme desativado é 'disabled'", () => {
    const result = diffAlarms([losartana], [{ ...losartana, enabled: false }]);
    expect(result).toEqual([
      { alarmId: "a1", alarmDescription: "Losartana", changeType: "disabled", oldTime: "08:00", newTime: "08:00" },
    ]);
  });

  it("mudar o horário é 'rescheduled' com os dois horários", () => {
    const result = diffAlarms([losartana], [{ ...losartana, time: "09:30" }]);
    expect(result).toEqual([
      { alarmId: "a1", alarmDescription: "Losartana", changeType: "rescheduled", oldTime: "08:00", newTime: "09:30" },
    ]);
  });

  it("mudar só os dias é 'rescheduled' com o mesmo horário", () => {
    const before = { ...losartana, repeat: "custom", customDays: [1, 3] };
    const after = { ...losartana, repeat: "custom", customDays: [1, 3, 5] };
    const [change] = diffAlarms([before], [after]);
    expect(change.changeType).toBe("rescheduled");
    expect(change.oldTime).toBe(change.newTime);
  });

  it("a ordem dos dias personalizados não conta como mudança", () => {
    const before = { ...losartana, repeat: "custom", customDays: [1, 3] };
    const after = { ...losartana, repeat: "custom", customDays: [3, 1] };
    expect(diffAlarms([before], [after])).toEqual([]);
  });

  it("criar e reativar não geram registro", () => {
    expect(diffAlarms([losartana], [losartana, metformina])).toEqual([]);
    expect(diffAlarms([{ ...losartana, enabled: false }], [losartana])).toEqual([]);
  });

  it("alarme desligado antes e depois não gera registro, mesmo mudando o horário", () => {
    const before = { ...losartana, enabled: false };
    const after = { ...losartana, enabled: false, time: "09:00" };
    expect(diffAlarms([before], [after])).toEqual([]);
  });

  it("apagar um alarme que já estava desativado também é registrado", () => {
    const [change] = diffAlarms([{ ...losartana, enabled: false }], []);
    expect(change.changeType).toBe("deleted");
  });

  it("sem lista anterior válida não há base de comparação", () => {
    for (const previous of [undefined, null, "lixo", {}, 42]) {
      expect(diffAlarms(previous, [losartana])).toEqual([]);
    }
  });

  it("lista nova ilegível não gera mudança", () => {
    expect(diffAlarms([losartana], "lixo")).toEqual([]);
    expect(diffAlarms([losartana], undefined)).toEqual([]);
  });

  it("itens ilegíveis são ignorados e id repetido vale o primeiro", () => {
    const previous = [null, 42, {}, { id: "" }, losartana, { ...losartana, description: "Outro" }];
    const result = diffAlarms(previous, []);
    expect(result).toHaveLength(1);
    expect(result[0].alarmDescription).toBe("Losartana");
  });

  it("alarme sem 'enabled' (formato antigo) conta como ligado", () => {
    const legacy = { id: "a1", time: "08:00", description: "Losartana" };
    const [change] = diffAlarms([legacy], [{ ...legacy, enabled: false }]);
    expect(change.changeType).toBe("disabled");
  });
});

describe("buildAlarmChangePush", () => {
  const change = (over: Partial<AlarmChange>): AlarmChange => ({
    alarmId: "a1",
    alarmDescription: "Losartana",
    changeType: "deleted",
    oldTime: "08:00",
    newTime: null,
    ...over,
  });

  it("sem mudanças não há push", () => {
    expect(buildAlarmChangePush("Maria", [])).toBeNull();
  });

  it("uma exclusão leva o nome do lembrete", () => {
    expect(buildAlarmChangePush("Maria", [change({})])).toEqual({
      title: "Lembrete alterado — Vigora",
      body: 'Maria excluiu o lembrete "Losartana".',
    });
  });

  it("uma desativação", () => {
    const push = buildAlarmChangePush("Maria", [change({ changeType: "disabled", newTime: "08:00" })]);
    expect(push?.body).toBe('Maria desativou o lembrete "Losartana".');
  });

  it("mudança de horário leva o horário novo", () => {
    const push = buildAlarmChangePush("Maria", [
      change({ changeType: "rescheduled", oldTime: "08:00", newTime: "09:30" }),
    ]);
    expect(push?.body).toBe('Maria mudou o horário de "Losartana" para 09:30.');
  });

  it("mudança só de dias não afirma horário", () => {
    const push = buildAlarmChangePush("Maria", [
      change({ changeType: "rescheduled", oldTime: "08:00", newTime: "08:00" }),
    ]);
    expect(push?.body).toBe('Maria mudou os dias do lembrete "Losartana".');
  });

  it("várias mudanças mostram dois nomes e a contagem do resto", () => {
    const push = buildAlarmChangePush("Maria", [
      change({ alarmId: "a1", alarmDescription: "Losartana" }),
      change({ alarmId: "a2", alarmDescription: "Metformina" }),
      change({ alarmId: "a3", alarmDescription: "Vitamina D" }),
    ]);
    expect(push).toEqual({
      title: "Lembretes alterados — Vigora",
      body: 'Maria alterou 3 lembretes: "Losartana", "Metformina" e mais 1.',
    });
  });

  it("duas mudanças não têm 'e mais'", () => {
    const push = buildAlarmChangePush("Maria", [
      change({ alarmId: "a1", alarmDescription: "Losartana" }),
      change({ alarmId: "a2", alarmDescription: "Metformina" }),
    ]);
    expect(push?.body).toBe('Maria alterou 2 lembretes: "Losartana", "Metformina".');
  });

  it("nome muito longo é cortado em 40 caracteres", () => {
    const push = buildAlarmChangePush("Maria", [change({ alarmDescription: "x".repeat(80) })]);
    expect(push?.body).toBe(`Maria excluiu o lembrete "${"x".repeat(39)}…".`);
  });

  it("lembrete sem nome usa o horário", () => {
    const push = buildAlarmChangePush("Maria", [change({ alarmDescription: "" })]);
    expect(push?.body).toBe('Maria excluiu o lembrete "08:00".');
  });
});

describe("buildAlarmChangePush — com o autor da mudança (cuidador)", () => {
  const change = (over: Partial<AlarmChange>): AlarmChange => ({
    alarmId: "a1",
    alarmDescription: "Losartana",
    changeType: "deleted",
    oldTime: "08:00",
    newTime: null,
    ...over,
  });

  it("criação", () => {
    const push = buildAlarmChangePush(
      "Maria",
      [change({ changeType: "created", oldTime: null, newTime: "08:00" })],
      "Ana"
    );
    expect(push).toEqual({
      title: "Lembrete alterado — Vigora",
      body: 'Ana criou o lembrete "Losartana" (08:00) para Maria.',
    });
  });

  it("exclusão", () => {
    expect(buildAlarmChangePush("Maria", [change({})], "Ana")?.body).toBe(
      'Ana apagou o lembrete "Losartana" de Maria.'
    );
  });

  it("desativação", () => {
    const push = buildAlarmChangePush("Maria", [change({ changeType: "disabled", newTime: "08:00" })], "Ana");
    expect(push?.body).toBe('Ana desativou o lembrete "Losartana" de Maria.');
  });

  it("mudança de horário", () => {
    const push = buildAlarmChangePush(
      "Maria",
      [change({ changeType: "rescheduled", oldTime: "08:00", newTime: "09:30" })],
      "Ana"
    );
    expect(push?.body).toBe('Ana mudou o horário de "Losartana" de Maria para 09:30.');
  });

  it("mudança só de dias", () => {
    const push = buildAlarmChangePush(
      "Maria",
      [change({ changeType: "rescheduled", oldTime: "08:00", newTime: "08:00" })],
      "Ana"
    );
    expect(push?.body).toBe('Ana mudou os dias do lembrete "Losartana" de Maria.');
  });

  it("várias mudanças", () => {
    const push = buildAlarmChangePush(
      "Maria",
      [
        change({ alarmId: "a1", alarmDescription: "Losartana" }),
        change({ alarmId: "a2", alarmDescription: "Metformina" }),
        change({ alarmId: "a3", alarmDescription: "Vitamina D" }),
      ],
      "Ana"
    );
    expect(push).toEqual({
      title: "Lembretes alterados — Vigora",
      body: 'Ana alterou 3 lembretes de Maria: "Losartana", "Metformina" e mais 1.',
    });
  });

  it("sem autor o texto antigo não muda", () => {
    expect(buildAlarmChangePush("Maria", [change({})])?.body).toBe('Maria excluiu o lembrete "Losartana".');
  });

  it("criação sem autor (não acontece pelo backup, mas não quebra)", () => {
    const push = buildAlarmChangePush("Maria", [change({ changeType: "created", oldTime: null, newTime: "08:00" })]);
    expect(push?.body).toBe('Maria criou o lembrete "Losartana".');
  });
});

describe("pickPersonName", () => {
  it("prefere o nome da anamnese", () => {
    expect(pickPersonName({ fullName: " Maria Souza " }, "Conta")).toBe("Maria Souza");
  });
  it("cai para o nome da conta e depois para o genérico", () => {
    expect(pickPersonName(null, "Conta")).toBe("Conta");
    expect(pickPersonName({ fullName: "  " }, null)).toBe("A pessoa que você acompanha");
    expect(pickPersonName("lixo", undefined)).toBe("A pessoa que você acompanha");
  });
});
