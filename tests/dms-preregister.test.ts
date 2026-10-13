/**
 * dms-preregister.test.ts
 *
 * O servidor passa a registrar o próximo disparo de cada conta de idoso. Cada
 * erro aqui é um alarme falso (a família acordada de madrugada por um alarme
 * que nunca existiu) ou um alarme mudo (o switch não sabe que era esperado).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-monitoring", () => ({
  getPreRegisterCandidates: vi.fn(async () => []),
  ensureServerAlarmEvent: vi.fn(async () => "created"),
  deleteFuturePendingEvents: vi.fn(async () => undefined),
}));

import { alarmsToCharge, resolveTimeZone, runPreRegistration } from "../server/dms-preregister";
import * as db from "../server/db-monitoring";
import type { PreRegisterCandidate } from "../server/db-monitoring";

// Sábado 10/10/2026, 06:00 UTC = 03:00 em São Paulo = 01:00 em Rio Branco.
const NOW = new Date("2026-10-10T06:00:00.000Z");

const alarm = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
  sound: true,
  vibration: true,
  ...over,
});

const candidate = (over: Partial<PreRegisterCandidate> = {}): PreRegisterCandidate => ({
  openId: "maria",
  alarms: [],
  timezone: null,
  managed: null,
  ...over,
});

const registered = () =>
  vi.mocked(db.ensureServerAlarmEvent).mock.calls.map(([data]) => data);

function withCandidates(...list: PreRegisterCandidate[]) {
  vi.mocked(db.getPreRegisterCandidates).mockResolvedValue(list);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getPreRegisterCandidates).mockResolvedValue([]);
  vi.mocked(db.ensureServerAlarmEvent).mockResolvedValue("created");
  vi.mocked(db.deleteFuturePendingEvents).mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("conta comum: alarmes do backup", () => {
  it("registra o próximo disparo dos alarmes LIGADOS, no fuso da conta", async () => {
    withCandidates(
      candidate({
        timezone: "America/Rio_Branco",
        alarms: [alarm(), alarm({ id: "a2", time: "20:00", enabled: false })],
      })
    );

    const result = await runPreRegistration(NOW);

    expect(result).toEqual({ registered: 1 });
    expect(registered()).toHaveLength(1);
    expect(registered()[0]).toMatchObject({
      openId: "maria",
      alarmId: "a1",
      alarmDescription: "Losartana",
      timezone: "America/Rio_Branco",
      status: "pending",
    });
    // 08:00 em Rio Branco (UTC-5) = 13:00 UTC.
    expect((registered()[0].scheduledAt as Date).toISOString()).toBe("2026-10-10T13:00:00.000Z");
  });

  it("sem fuso conhecido usa America/Sao_Paulo", async () => {
    withCandidates(candidate({ alarms: [alarm()] }));

    await runPreRegistration(NOW);

    expect((registered()[0].scheduledAt as Date).toISOString()).toBe("2026-10-10T11:00:00.000Z");
    expect(registered()[0].timezone).toBe("America/Sao_Paulo");
  });

  it("fuso inválido guardado na conta não derruba: usa São Paulo", async () => {
    withCandidates(candidate({ timezone: "Marte/Fobos", alarms: [alarm()] }));

    await expect(runPreRegistration(NOW)).resolves.toEqual({ registered: 1 });

    expect((registered()[0].scheduledAt as Date).toISOString()).toBe("2026-10-10T11:00:00.000Z");
  });

  it("só registra disparo das próximas 24 horas", async () => {
    withCandidates(
      candidate({
        alarms: [
          alarm({ id: "hoje", time: "08:00" }),
          alarm({ id: "amanha-cedo", time: "02:00" }), // 23 h adiante
          alarm({ id: "so-segunda", repeat: "weekdays" }), // próximo dia útil é segunda (>24 h)
          alarm({ id: "so-quarta", repeat: "custom", customDays: [3] }),
        ],
      })
    );

    await runPreRegistration(NOW);

    expect(registered().map((e) => e.alarmId).sort()).toEqual(["amanha-cedo", "hoje"]);
  });

  it("alarme com horário ilegível ou sem id é ignorado e não atrapalha os outros", async () => {
    withCandidates(
      candidate({
        alarms: [
          alarm({ id: "ruim", time: "abc" }),
          alarm({ id: "impossivel", time: "25:99" }),
          alarm({ id: undefined }),
          null,
          "lixo",
          alarm({ id: "bom" }),
        ],
      })
    );

    await runPreRegistration(NOW);

    expect(registered().map((e) => e.alarmId)).toEqual(["bom"]);
  });

  it("passa a janela de 120 min que evita o segundo evento do mesmo disparo", async () => {
    withCandidates(candidate({ alarms: [alarm()] }));

    await runPreRegistration(NOW);

    expect(vi.mocked(db.ensureServerAlarmEvent).mock.calls[0][1]).toBe(120);
  });

  it("evento que já existia (janela) não conta como registrado agora", async () => {
    withCandidates(candidate({ alarms: [alarm(), alarm({ id: "a2", time: "09:00" })] }));
    vi.mocked(db.ensureServerAlarmEvent).mockResolvedValueOnce("exists").mockResolvedValueOnce("created");

    await expect(runPreRegistration(NOW)).resolves.toEqual({ registered: 1 });
  });

  it("não apaga evento nenhum numa conta comum", async () => {
    withCandidates(candidate({ alarms: [alarm()] }));

    await runPreRegistration(NOW);

    expect(db.deleteFuturePendingEvents).not.toHaveBeenCalled();
  });
});

describe("check-in: kind e graceMinutes", () => {
  it("evento de check-in leva kind e o atraso escolhido", async () => {
    withCandidates(
      candidate({
        alarms: [alarm({ id: "c1", kind: "checkin", description: "Check-in", escalateAfterMinutes: 15 })],
      })
    );

    await runPreRegistration(NOW);

    expect(registered()[0]).toMatchObject({ alarmId: "c1", kind: "checkin", graceMinutes: 15 });
  });

  it("atraso ausente ou inválido vira 5 minutos", async () => {
    withCandidates(
      candidate({
        alarms: [
          alarm({ id: "c1", kind: "checkin" }),
          alarm({ id: "c2", kind: "checkin", escalateAfterMinutes: 7 }),
        ],
      })
    );

    await runPreRegistration(NOW);

    expect(registered().map((e) => e.graceMinutes)).toEqual([5, 5]);
  });

  it("remédio não leva kind nem graceMinutes", async () => {
    withCandidates(candidate({ alarms: [alarm({ escalateAfterMinutes: 30 })] }));

    await runPreRegistration(NOW);

    expect(registered()[0]).not.toHaveProperty("kind");
    expect(registered()[0]).not.toHaveProperty("graceMinutes");
  });

  it("conta gerenciada também leva kind e graceMinutes do check-in confirmado", async () => {
    withCandidates(
      candidate({
        managed: {
          appliedAlarms: [alarm({ id: "c1", kind: "checkin", escalateAfterMinutes: 30 })],
          failedAlarmIds: [],
        },
      })
    );

    await runPreRegistration(NOW);

    expect(registered()[0]).toMatchObject({ kind: "checkin", graceMinutes: 30 });
  });
});

describe("conta gerenciada: só o que o celular confirmou", () => {
  it("cobra appliedAlarms MENOS failedAlarmIds, só os ligados", async () => {
    withCandidates(
      candidate({
        managed: {
          appliedAlarms: [
            alarm({ id: "ok", time: "08:00" }),
            alarm({ id: "falhou", time: "09:00" }),
            alarm({ id: "desligado", time: "10:00", enabled: false }),
          ],
          failedAlarmIds: ["falhou"],
        },
      })
    );

    await runPreRegistration(NOW);

    expect(registered().map((e) => e.alarmId)).toEqual(["ok"]);
  });

  it("alarme criado pelo cuidador e ainda NÃO confirmado pelo celular nunca é pré-registrado", async () => {
    withCandidates(
      candidate({
        // lista corrente (backup do celular ou a do cuidador): tem o alarme novo "b"
        alarms: [alarm({ id: "a" }), alarm({ id: "b", time: "09:00" })],
        // o que o celular confirmou: só o "a"
        managed: { appliedAlarms: [alarm({ id: "a" })], failedAlarmIds: [] },
      })
    );

    await runPreRegistration(NOW);

    expect(registered().map((e) => e.alarmId)).toEqual(["a"]);
  });

  it("usa o horário CONFIRMADO, não o que o cuidador acabou de mudar", async () => {
    withCandidates(
      candidate({
        alarms: [alarm({ id: "a", time: "09:00" })],
        managed: { appliedAlarms: [alarm({ id: "a", time: "08:00" })], failedAlarmIds: [] },
      })
    );

    await runPreRegistration(NOW);

    expect((registered()[0].scheduledAt as Date).toISOString()).toBe("2026-10-10T11:00:00.000Z");
  });

  it("lista confirmada ilegível não cobra nada (e não usa o backup no lugar)", async () => {
    withCandidates(
      candidate({
        alarms: [alarm({ id: "backup" })],
        managed: { appliedAlarms: "lixo", failedAlarmIds: null },
      })
    );

    await expect(runPreRegistration(NOW)).resolves.toEqual({ registered: 0 });
    expect(db.ensureServerAlarmEvent).not.toHaveBeenCalled();
  });

  it("apaga o evento futuro pendente de alarme que falhou ao agendar", async () => {
    withCandidates(
      candidate({
        managed: { appliedAlarms: [alarm({ id: "ok" }), alarm({ id: "falhou" })], failedAlarmIds: ["falhou"] },
      })
    );

    await runPreRegistration(NOW);

    expect(db.deleteFuturePendingEvents).toHaveBeenCalledWith("maria", ["falhou"], NOW);
  });

  it("sem falha nenhuma não apaga evento", async () => {
    withCandidates(candidate({ managed: { appliedAlarms: [alarm()], failedAlarmIds: [] } }));

    await runPreRegistration(NOW);

    expect(db.deleteFuturePendingEvents).not.toHaveBeenCalled();
  });
});

describe("isolamento de falhas", () => {
  it("uma conta com erro não impede as outras; a rotina rejeita no fim sem vazar o erro", async () => {
    withCandidates(
      candidate({ openId: "ruim", alarms: [alarm({ id: "x" })] }),
      candidate({ openId: "boa", alarms: [alarm({ id: "y" })] })
    );
    vi.mocked(db.ensureServerAlarmEvent).mockImplementation(async (data) => {
      if (data.openId === "ruim") {
        throw new Error("Failed query: insert into alarm_events params: Losartana");
      }
      return "created";
    });

    let message = "";
    await runPreRegistration(NOW).catch((e: Error) => {
      message = e.message;
    });

    expect(message).toBe("Pré-registro: 1 conta(s) falharam");
    expect(registered().map((e) => e.openId)).toEqual(["ruim", "boa"]);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Losartana");
  });

  it("um alarme com erro não impede os outros alarmes da mesma conta", async () => {
    withCandidates(candidate({ alarms: [alarm({ id: "x" }), alarm({ id: "y", time: "09:00" })] }));
    vi.mocked(db.ensureServerAlarmEvent).mockRejectedValueOnce(new Error("deadlock"));

    await expect(runPreRegistration(NOW)).rejects.toThrow("Pré-registro");

    expect(registered().map((e) => e.alarmId)).toEqual(["x", "y"]);
  });

  it("a consulta de candidatos falhar rejeita a rotina (o job registra a falha)", async () => {
    vi.mocked(db.getPreRegisterCandidates).mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));

    await expect(runPreRegistration(NOW)).rejects.toThrow("DATABASE_UNAVAILABLE");
  });

  it("nenhum log leva a descrição do alarme nem o fuso do cliente", async () => {
    withCandidates(candidate({ timezone: "Marte/Fobos", alarms: [alarm()] }));

    await runPreRegistration(NOW);

    const logged = JSON.stringify([
      ...vi.mocked(console.warn).mock.calls,
      ...vi.mocked(console.error).mock.calls,
    ]);
    expect(logged).not.toContain("Losartana");
    expect(logged).not.toContain("Marte");
  });
});

describe("alarmsToCharge e resolveTimeZone (funções puras)", () => {
  it("resolveTimeZone: válido passa, nulo e inválido caem em São Paulo", () => {
    expect(resolveTimeZone("Europe/Lisbon")).toBe("Europe/Lisbon");
    expect(resolveTimeZone(null)).toBe("America/Sao_Paulo");
    expect(resolveTimeZone("Marte/Fobos")).toBe("America/Sao_Paulo");
  });

  it("descarta id vazio, id com mais de 64 caracteres e item que não é objeto", () => {
    const list = alarmsToCharge(
      candidate({
        alarms: [alarm({ id: "" }), alarm({ id: "x".repeat(65) }), 7, alarm({ id: "ok" })],
      })
    );
    expect(list.map((a) => a.id)).toEqual(["ok"]);
  });
});
