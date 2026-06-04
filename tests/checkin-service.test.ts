// tests/checkin-service.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock native modules that checkin-service.ts imports at the top level.
// The pure functions under test (computeTimeoutDate, formatCountdown) don't
// use these at all, but the module-level imports must resolve in Node/vitest.
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
  scheduleNotificationAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    multiRemove: vi.fn(),
  },
}));

// monitoring-service transitively imports device-id → expo-crypto →
// expo-modules-core, which requires TurboModuleRegistry (unavailable in Node).
// The functions under test never call monitoring-service, so a stub is enough.
vi.mock('../lib/monitoring-service', () => ({
  createPendingAlarmEvent: vi.fn(),
}));

import { computeTimeoutDate, computeNextTimeoutDate, formatCountdown, scheduleCheckin } from '../lib/checkin-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

describe('computeTimeoutDate', () => {
  it('adiciona window minutes ao horário do check-in', () => {
    // Agora é 09:15, check-in às 09:00, janela 30min → timeout hoje às 09:30
    const now = new Date('2026-05-25T09:15:00');
    const result = computeTimeoutDate('09:00', 30, now);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(30);
    expect(result.getDate()).toBe(25);
  });

  it('avança para o dia seguinte se o timeout já passou', () => {
    // Agora é 10:00, check-in às 09:00, janela 30min → timeout às 09:30 (já passou)
    const now = new Date('2026-05-25T10:00:00');
    const result = computeTimeoutDate('09:00', 30, now);
    expect(result.getDate()).toBe(26);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(30);
  });

  it('trata overflow de minutos para próxima hora', () => {
    // Check-in às 09:45, janela 30min → timeout às 10:15
    const now = new Date('2026-05-25T09:50:00');
    const result = computeTimeoutDate('09:45', 30, now);
    expect(result.getHours()).toBe(10);
    expect(result.getMinutes()).toBe(15);
  });

  it('trata overflow de hora (meia-noite)', () => {
    // Check-in às 23:45, janela 30min → timeout às 00:15 do dia seguinte
    const now = new Date('2026-05-25T23:50:00');
    const result = computeTimeoutDate('23:45', 30, now);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(15);
    expect(result.getDate()).toBe(26);
  });
});

describe('computeNextTimeoutDate', () => {
  it('arma o timeout para o dia seguinte, nunca para hoje', () => {
    // Check-in 15:30, respondido às 15:35 → próximo timeout AMANHÃ 16:00.
    // (Bug: a versão antiga retornava hoje 16:00 e disparava 30min após confirmar.)
    const now = new Date('2026-05-25T15:35:00');
    const result = computeNextTimeoutDate('15:30', 30, now);
    expect(result.getDate()).toBe(26);
    expect(result.getHours()).toBe(16);
    expect(result.getMinutes()).toBe(0);
  });

  it('é sempre estritamente no futuro em relação a now', () => {
    const now = new Date('2026-05-25T15:35:00');
    const result = computeNextTimeoutDate('15:30', 30, now);
    expect(result.getTime()).toBeGreaterThan(now.getTime());
  });

  it('trata check-in perto da meia-noite (23:45 + 30min)', () => {
    // Respondido às 23:50; próximo check-in amanhã 23:45 → deadline no dia
    // seguinte às 00:15. A versão com "sameDay" falharia aqui.
    const now = new Date('2026-05-25T23:50:00');
    const result = computeNextTimeoutDate('23:45', 30, now);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(15);
    expect(result.getDate()).toBe(27);
  });
});

describe('formatCountdown', () => {
  it('formata segundos em MM:SS', () => {
    expect(formatCountdown(90)).toBe('01:30');
    expect(formatCountdown(60)).toBe('01:00');
    expect(formatCountdown(9)).toBe('00:09');
    expect(formatCountdown(0)).toBe('00:00');
  });

  it('formata minutos completos', () => {
    expect(formatCountdown(1800)).toBe('30:00');
  });
});

describe('scheduleCheckin — não re-arma o timeout de hoje após resposta', () => {
  // Regressão do bug: app fechado → tap no prompt → confirma → 30min depois
  // dispara "não respondido". Causa: scheduleCheckin (rodado no startup pelo
  // CheckinInitializer) re-armava o timeout de hoje, clobberando o cancelamento
  // feito por markCheckinResponded.
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (Notifications.getAllScheduledNotificationsAsync as any).mockResolvedValue([]);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Args dos agendamentos com trigger DATE (o timeout one-shot). */
  function dateTriggerArgs() {
    return (Notifications.scheduleNotificationAsync as any).mock.calls
      .map((c: any[]) => c[0])
      .filter((arg: any) => arg.trigger?.type === 'date');
  }

  it('arma o timeout para AMANHÃ se o check-in de hoje já foi respondido', async () => {
    // Agora 09:05; check-in 09:00 (+30 = 09:30 hoje, ainda no futuro).
    vi.setSystemTime(new Date('2026-05-25T09:05:00'));
    (AsyncStorage.getItem as any).mockImplementation(async (key: string) =>
      key === 'vigora_checkin_responded_date' ? '2026-05-25' : null
    );

    await scheduleCheckin('09:00', 30);

    const dateCalls = dateTriggerArgs();
    expect(dateCalls).toHaveLength(1);
    const when: Date = dateCalls[0].trigger.date;
    expect(when.getDate()).toBe(26); // amanhã, não hoje
    expect(when.getHours()).toBe(9);
    expect(when.getMinutes()).toBe(30);
  });

  it('arma o timeout para HOJE quando ainda não respondeu hoje', async () => {
    vi.setSystemTime(new Date('2026-05-25T09:05:00'));
    (AsyncStorage.getItem as any).mockResolvedValue(null);

    await scheduleCheckin('09:00', 30);

    const dateCalls = dateTriggerArgs();
    expect(dateCalls).toHaveLength(1);
    const when: Date = dateCalls[0].trigger.date;
    expect(when.getDate()).toBe(25); // hoje
    expect(when.getHours()).toBe(9);
    expect(when.getMinutes()).toBe(30);
  });

  it('arma o timeout para HOJE se a resposta foi de um dia anterior', async () => {
    vi.setSystemTime(new Date('2026-05-25T09:05:00'));
    (AsyncStorage.getItem as any).mockImplementation(async (key: string) =>
      key === 'vigora_checkin_responded_date' ? '2026-05-24' : null
    );

    await scheduleCheckin('09:00', 30);

    const dateCalls = dateTriggerArgs();
    expect(dateCalls).toHaveLength(1);
    const when: Date = dateCalls[0].trigger.date;
    expect(when.getDate()).toBe(25); // hoje — resposta de ontem não conta
  });
});
