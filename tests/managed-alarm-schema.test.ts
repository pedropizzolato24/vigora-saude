/**
 * managed-alarm-schema.test.ts
 *
 * As regras do formulário de alarme, aplicadas no servidor (Fase 4):
 *  - `managedAlarmInputSchema` + `normalizeManagedAlarm`: o cuidador cria/edita;
 *  - `sanitizeAcceptedList`: o idoso aceita o pedido mandando a lista dele.
 * Funções puras: nada de banco, nada de rede.
 */
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import {
  managedAlarmInputSchema,
  normalizeManagedAlarm,
  sanitizeAcceptedList,
} from "../server/_core/managed-alarm-schema";

const med = (over: Record<string, unknown> = {}) => ({
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
  sound: true,
  vibration: true,
  kind: "medication",
  ...over,
});

const phoneAlarm = (over: Record<string, unknown> = {}) => ({ id: "a1", ...med(), ...over });

function trpcError(fn: () => unknown): TRPCError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    return err as TRPCError;
  }
  throw new Error("esperava que lançasse");
}

describe("managedAlarmInputSchema", () => {
  it("aceita um remédio válido e padroniza a hora com dois dígitos", () => {
    expect(managedAlarmInputSchema.parse(med()).time).toBe("08:00");
    expect(managedAlarmInputSchema.parse(med({ time: "8:30" })).time).toBe("08:30");
    expect(managedAlarmInputSchema.parse(med({ time: "23:59" })).time).toBe("23:59");
  });

  it("descarta chaves desconhecidas: id do cliente, ids do sistema, lixo", () => {
    const parsed = managedAlarmInputSchema.parse(
      med({ id: "forcado", notificationId: "n1", nativeAlarmUids: ["u1"], monitoredOpenId: "joao", extra: 1 }),
    );
    expect(Object.keys(parsed).sort()).toEqual(
      ["description", "enabled", "kind", "repeat", "sound", "time", "vibration"].sort(),
    );
  });

  const invalidos: Array<[string, Record<string, unknown>]> = [
    ["horário sem dois dígitos nos minutos", { time: "7:5" }],
    ["hora fora do relógio", { time: "25:00" }],
    ["minuto fora do relógio", { time: "08:60" }],
    ["horário em texto", { time: "xx:yy" }],
    ["horário vazio", { time: "" }],
    ["repetição desconhecida", { repeat: "monthly" }],
    ["dias personalizados vazios", { repeat: "custom", customDays: [] }],
    ["personalizado sem a lista de dias", { repeat: "custom" }],
    ["dia personalizado fora de 0 a 6", { repeat: "custom", customDays: [7] }],
    ["dia personalizado negativo", { repeat: "custom", customDays: [-1] }],
    ["dia personalizado quebrado", { repeat: "custom", customDays: [1.5] }],
    ["nome com mais de 80 caracteres", { description: "x".repeat(81) }],
    ["atraso do check-in fora de 5/10/15/30", { kind: "checkin", escalateAfterMinutes: 7 }],
    ["tipo desconhecido", { kind: "exame" }],
    ["enabled que não é booleano", { enabled: "sim" }],
    ["som que não é booleano", { sound: 1 }],
    ["vibração ausente", { vibration: undefined }],
  ];

  it.each(invalidos)("recusa %s", (_nome, over) => {
    expect(managedAlarmInputSchema.safeParse(med(over)).success).toBe(false);
  });

  it("aceita nome com exatamente 80 caracteres e nome vazio (o formulário permite)", () => {
    expect(managedAlarmInputSchema.safeParse(med({ description: "x".repeat(80) })).success).toBe(true);
    expect(managedAlarmInputSchema.safeParse(med({ description: "" })).success).toBe(true);
  });

  it("check-in com repetição qualquer passa (é forçado a diário na normalização)", () => {
    expect(
      managedAlarmInputSchema.safeParse(
        med({ kind: "checkin", repeat: "custom", customDays: [], escalateAfterMinutes: 15 }),
      ).success,
    ).toBe(true);
  });
});

describe("normalizeManagedAlarm", () => {
  it("remédio: usa o id dado, mantém o que veio e não leva atraso de check-in", () => {
    const input = managedAlarmInputSchema.parse(med({ escalateAfterMinutes: 10, repeat: "weekdays" }));
    expect(normalizeManagedAlarm(input, "id-novo")).toEqual({
      id: "id-novo",
      time: "08:00",
      description: "Losartana",
      enabled: true,
      repeat: "weekdays",
      customDays: [],
      sound: true,
      vibration: true,
      kind: "medication",
    });
  });

  it("remédio sem 'kind' continua sem 'kind' (ausente = remédio)", () => {
    const input = managedAlarmInputSchema.parse(med({ kind: undefined }));
    expect(normalizeManagedAlarm(input, "x")).not.toHaveProperty("kind");
  });

  it("personalizado: dias ordenados e sem repetição; nos outros tipos de repetição, customDays vira []", () => {
    const custom = managedAlarmInputSchema.parse(med({ repeat: "custom", customDays: [6, 0, 3, 3] }));
    expect(normalizeManagedAlarm(custom, "x").customDays).toEqual([0, 3, 6]);

    const daily = managedAlarmInputSchema.parse(med({ repeat: "daily", customDays: [2, 4] }));
    expect(normalizeManagedAlarm(daily, "x").customDays).toEqual([]);
  });

  it("check-in: sempre diário, sem dias, com o nome fixo e o atraso escolhido", () => {
    const input = managedAlarmInputSchema.parse(
      med({
        kind: "checkin",
        repeat: "weekdays",
        customDays: [1, 2],
        description: "Como você está?",
        escalateAfterMinutes: 10,
        time: "9:00",
      }),
    );
    expect(normalizeManagedAlarm(input, "c1")).toEqual({
      id: "c1",
      time: "09:00",
      description: "Check-in",
      enabled: true,
      repeat: "daily",
      customDays: [],
      sound: true,
      vibration: true,
      kind: "checkin",
      escalateAfterMinutes: 10,
    });
  });

  it("não altera o objeto de entrada", () => {
    const input = managedAlarmInputSchema.parse(med({ repeat: "custom", customDays: [3, 1] }));
    const before = JSON.stringify(input);
    normalizeManagedAlarm(input, "x");
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("sanitizeAcceptedList", () => {
  it("lista vazia é válida (o idoso ainda não tem alarmes)", () => {
    expect(sanitizeAcceptedList([])).toEqual([]);
  });

  it("mantém os ids e descarta notificationId, nativeAlarmUids e qualquer chave desconhecida", () => {
    const [alarm] = sanitizeAcceptedList([
      phoneAlarm({ id: "meu-id", notificationId: "n1", nativeAlarmUids: ["u1", "u2"], extra: true }),
    ]);
    expect(alarm.id).toBe("meu-id");
    expect(alarm).not.toHaveProperty("notificationId");
    expect(alarm).not.toHaveProperty("nativeAlarmUids");
    expect(alarm).not.toHaveProperty("extra");
  });

  it("corta o nome acima de 80 caracteres em vez de recusar o aceite", () => {
    const [alarm] = sanitizeAcceptedList([phoneAlarm({ description: "x".repeat(120) })]);
    expect(alarm.description).toHaveLength(80);
  });

  it("hora com um dígito, como o formulário já gravou no passado, vira dois dígitos", () => {
    const [alarm] = sanitizeAcceptedList([phoneAlarm({ time: "8:30" })]);
    expect(alarm.time).toBe("08:30");
  });

  it("check-in antigo: vira diário com o nome fixo e mantém o atraso", () => {
    const [alarm] = sanitizeAcceptedList([
      phoneAlarm({ id: "c1", kind: "checkin", repeat: "weekdays", description: "Tudo bem?", escalateAfterMinutes: 30 }),
    ]);
    expect(alarm).toMatchObject({
      id: "c1",
      kind: "checkin",
      repeat: "daily",
      customDays: [],
      description: "Check-in",
      escalateAfterMinutes: 30,
    });
  });

  it("aceita exatamente 24 alarmes", () => {
    const list = Array.from({ length: 24 }, (_, i) => phoneAlarm({ id: `a${i}` }));
    expect(sanitizeAcceptedList(list)).toHaveLength(24);
  });

  it("mais de 24 alarmes: BAD_REQUEST", () => {
    const list = Array.from({ length: 25 }, (_, i) => phoneAlarm({ id: `a${i}` }));
    expect(trpcError(() => sanitizeAcceptedList(list)).code).toBe("BAD_REQUEST");
  });

  const ilegiveis: Array<[string, unknown]> = [
    ["não é uma lista", { alarms: [] }],
    ["texto", "lixo"],
    ["nulo", null],
    ["item que não é objeto", [42]],
    ["item nulo", [null]],
    ["item sem id", [{ ...med() }]],
    ["id vazio", [phoneAlarm({ id: "" })]],
    ["id com mais de 64 caracteres", [phoneAlarm({ id: "i".repeat(65) })]],
    ["horário inválido", [phoneAlarm({ time: "25:99" })]],
    ["repetição desconhecida", [phoneAlarm({ repeat: "once" })]],
    ["personalizado sem dias", [phoneAlarm({ repeat: "custom", customDays: [] })]],
    ["dia personalizado fora de 0 a 6", [phoneAlarm({ repeat: "custom", customDays: [9] })]],
    ["atraso do check-in inválido", [phoneAlarm({ kind: "checkin", escalateAfterMinutes: 7 })]],
    ["id repetido", [phoneAlarm({ id: "igual" }), phoneAlarm({ id: "igual", time: "20:00" })]],
  ];

  it.each(ilegiveis)("recusa o aceite inteiro quando %s", (_nome, raw) => {
    const err = trpcError(() => sanitizeAcceptedList(raw));
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toBe("Não foi possível ler seus alarmes.");
  });

  it("um item ruim no meio recusa tudo (nada é ativado com a lista pela metade)", () => {
    const list = [phoneAlarm({ id: "ok" }), phoneAlarm({ id: "ruim", time: "99:99" }), phoneAlarm({ id: "ok2" })];
    expect(trpcError(() => sanitizeAcceptedList(list)).code).toBe("BAD_REQUEST");
  });

  it("não altera a lista de entrada", () => {
    const raw = [phoneAlarm({ description: "x".repeat(120), notificationId: "n" })];
    const before = JSON.stringify(raw);
    sanitizeAcceptedList(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });
});
