import { describe, expect, it } from "vitest";
import {
  agendaHasCheckinAlarm,
  eventGraceMinutes,
  isCheckinEvent,
  isEventExpired,
} from "../server/_core/event-kind";

describe("isCheckinEvent", () => {
  it("kind 'checkin' ou o id fixo do sistema antigo", () => {
    expect(isCheckinEvent({ alarmId: "x", kind: "checkin" })).toBe(true);
    expect(isCheckinEvent({ alarmId: "checkin-daily" })).toBe(true);
    expect(isCheckinEvent({ alarmId: "x", kind: "medication" })).toBe(false);
    expect(isCheckinEvent({ alarmId: "x", kind: null })).toBe(false);
  });
});

describe("eventGraceMinutes / isEventExpired", () => {
  const T0 = new Date("2026-10-02T12:00:00Z");
  const at = (min: number) => T0.getTime() + min * 60_000;

  it("sem graceMinutes vale o padrão de 5 min", () => {
    expect(eventGraceMinutes({})).toBe(5);
    expect(eventGraceMinutes({ graceMinutes: null })).toBe(5);
    expect(eventGraceMinutes({ graceMinutes: 0 })).toBe(5);
    expect(eventGraceMinutes({ graceMinutes: -3 })).toBe(5);
  });

  it("cada evento tem o seu prazo", () => {
    expect(isEventExpired({ scheduledAt: T0 }, at(4))).toBe(false);
    expect(isEventExpired({ scheduledAt: T0 }, at(5))).toBe(true);
    expect(isEventExpired({ scheduledAt: T0, graceMinutes: 15 }, at(10))).toBe(false);
    expect(isEventExpired({ scheduledAt: T0, graceMinutes: 15 }, at(15))).toBe(true);
  });
});

describe("agendaHasCheckinAlarm", () => {
  it("só com alarme kind 'checkin' na lista", () => {
    expect(agendaHasCheckinAlarm([{ id: "a", kind: "checkin" }])).toBe(true);
    expect(agendaHasCheckinAlarm([{ id: "a" }, { id: "b", kind: "medication" }])).toBe(false);
    expect(agendaHasCheckinAlarm([])).toBe(false);
  });
  it("agenda ilegível não prova nada", () => {
    expect(agendaHasCheckinAlarm(undefined)).toBe(false);
    expect(agendaHasCheckinAlarm("lixo")).toBe(false);
    expect(agendaHasCheckinAlarm([null, 42])).toBe(false);
  });
});
