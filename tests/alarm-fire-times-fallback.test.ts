/**
 * alarm-fire-times-fallback.test.ts
 *
 * Aparelho de entrada com ROM enxuta pode não ter o Intl completo (fuso, formatToParts).
 * Aí lib/alarm-fire-times.ts cai no cálculo com o Date local, com o mesmo resultado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lastAlarmFireMs, nextAlarmFireMs } from '../lib/alarm-fire-times';

type A = Parameters<typeof nextAlarmFireMs>[0];
const mk = (over: Partial<A>): A =>
  ({ id: '1', time: '08:00', description: '', enabled: true, repeat: 'daily', customDays: [], sound: true, vibration: true, ...over } as A);

const now = new Date(2026, 5, 24, 10, 0, 0); // quarta 24 jun 2026, 10:00 local
const local = (y: number, mo: number, d: number, h: number) => new Date(y, mo, d, h, 0, 0).getTime();

function expectLocalDateResults() {
  expect(nextAlarmFireMs(mk({}), now)).toBe(local(2026, 5, 25, 8));
  expect(lastAlarmFireMs(mk({}), now)).toBe(local(2026, 5, 24, 8));
  const quarta = mk({ repeat: 'custom', customDays: [3] });
  expect(nextAlarmFireMs(quarta, now)).toBe(local(2026, 6, 1, 8));
  expect(lastAlarmFireMs(quarta, now)).toBe(local(2026, 5, 24, 8));
  expect(nextAlarmFireMs(mk({ enabled: false }), now)).toBeNull();
  expect(nextAlarmFireMs(mk({ repeat: 'custom', customDays: [] }), now)).toBeNull();
}

describe('fallback para o Date local quando o Intl não serve', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('Intl lança ao resolver o fuso do aparelho: usa o relógio local e loga o motivo', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('sem ICU');
    });
    expectLocalDateResults();
    expect(warn).toHaveBeenCalledWith('[AlarmFireTimes] fuso do aparelho indisponível:', expect.any(Error));
  });

  it('fuso do aparelho vazio: usa o relógio local e loga', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: '' }) }) as unknown as Intl.DateTimeFormat
    );
    expectLocalDateResults();
    expect(warn).toHaveBeenCalledWith('[AlarmFireTimes] fuso do aparelho vazio; usando o relógio local');
  });

  it('a regra por fuso lança (formatador não monta): usa o relógio local e loga', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(((...args: unknown[]) => {
      if (args.length === 0) return { resolvedOptions: () => ({ timeZone: 'Test/Lanca' }) };
      throw new Error('Intl quebrado');
    }) as never);
    expectLocalDateResults();
    expect(warn).toHaveBeenCalledWith('[AlarmFireTimes] regra por fuso falhou; usando o relógio local:', expect.any(Error));
  });

  it('formatToParts sem partes (sem resultado numérico): usa o relógio local e loga', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(((...args: unknown[]) => {
      if (args.length === 0) return { resolvedOptions: () => ({ timeZone: 'Test/SemPartes' }) };
      return { formatToParts: () => [] };
    }) as never);
    expectLocalDateResults();
    expect(warn).toHaveBeenCalledWith('[AlarmFireTimes] regra por fuso sem resultado; usando o relógio local');
  });
});
