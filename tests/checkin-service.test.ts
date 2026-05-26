// tests/checkin-service.test.ts
import { describe, it, expect, vi } from 'vitest';

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
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    multiRemove: vi.fn(),
  },
}));

import { computeTimeoutDate, formatCountdown } from '../lib/checkin-service';

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
