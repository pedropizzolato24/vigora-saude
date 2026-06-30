import { describe, it, expect } from 'vitest';
import { nextAlarmFireMs, lastAlarmFireMs } from '../lib/alarm-fire-times';

type A = Parameters<typeof nextAlarmFireMs>[0];
const mk = (over: Partial<A>): A =>
  ({ id: '1', time: '08:00', description: '', enabled: true, repeat: 'daily', customDays: [], sound: true, vibration: true, ...over } as A);

const H = 3600 * 1000;
const now = new Date(2026, 5, 24, 10, 0, 0); // 24 jun 2026, 10:00 local

describe('next/lastAlarmFireMs', () => {
  it('null para alarme desabilitado ou hora inválida', () => {
    expect(nextAlarmFireMs(mk({ enabled: false }), now)).toBeNull();
    expect(lastAlarmFireMs(mk({ enabled: false }), now)).toBeNull();
    expect(nextAlarmFireMs(mk({ time: 'xx:yy' }), now)).toBeNull();
  });

  it('diário com hora já passada hoje: próximo = amanhã, último = hoje', () => {
    const a = mk({ time: '08:00', repeat: 'daily' });
    const next = nextAlarmFireMs(a, now)!;
    const last = lastAlarmFireMs(a, now)!;
    expect(new Date(next).getHours()).toBe(8);
    expect(next).toBeGreaterThan(now.getTime());
    expect(next - now.getTime()).toBe(22 * H); // amanhã 08:00
    expect(last).toBeLessThanOrEqual(now.getTime());
    expect(now.getTime() - last).toBe(2 * H); // hoje 08:00
  });

  it('diário com hora futura hoje: próximo = hoje, último = ontem', () => {
    const a = mk({ time: '20:00', repeat: 'daily' });
    expect(nextAlarmFireMs(a, now)! - now.getTime()).toBe(10 * H); // hoje 20:00
    expect(now.getTime() - lastAlarmFireMs(a, now)!).toBe(14 * H); // ontem 20:00
  });

  it('weekdays: próximo cai em dia útil às 08:00', () => {
    const nd = new Date(nextAlarmFireMs(mk({ time: '08:00', repeat: 'weekdays' }), now)!);
    expect(nd.getHours()).toBe(8);
    expect([1, 2, 3, 4, 5]).toContain(nd.getDay());
  });

  it('custom [0]=domingo: próximo cai num domingo; custom vazio = null', () => {
    const nd = new Date(nextAlarmFireMs(mk({ repeat: 'custom', customDays: [0] }), now)!);
    expect(nd.getDay()).toBe(0);
    expect(nextAlarmFireMs(mk({ repeat: 'custom', customDays: [] }), now)).toBeNull();
  });

  it('dedup: o "próximo" pré-registrado == o "último" no disparo (mesmo timestamp canônico)', () => {
    const a = mk({ time: '08:00', repeat: 'daily' });
    const before = new Date(2026, 5, 24, 7, 59, 0);
    const after = new Date(2026, 5, 24, 8, 0, 30);
    expect(nextAlarmFireMs(a, before)).toBe(lastAlarmFireMs(a, after));
  });
});
