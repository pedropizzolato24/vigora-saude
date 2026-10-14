import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkinAlarms, medicationAlarms } from '../lib/alarm-kind';
import { nextAlarm } from '../lib/caregiver-format';
import type { Alarm } from '../lib/app-context';

const base = { description: '', enabled: true, repeat: 'daily' as const, customDays: [], sound: true, vibration: true };
const alarms: Alarm[] = [
  { ...base, id: 'm1', time: '08:00', description: 'Losartana' },
  { ...base, id: 'c1', time: '09:00', description: 'Check-in', kind: 'checkin', escalateAfterMinutes: 15 },
];
const NOW = new Date('2026-10-02T07:00:00');

describe('próximo remédio × próximo check-in', () => {
  it('cada um olha só a sua lista', () => {
    expect(nextAlarm(medicationAlarms(alarms), NOW)?.id).toBe('m1');
    expect(nextAlarm(checkinAlarms(alarms), NOW)?.id).toBe('c1');
  });
});

describe('telas do cuidador', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  it('o Início tem o card "Próximo check-in"', () => {
    const src = read('app/(caregiver-tabs)/index.tsx');
    expect(src).toMatch(/Próximo check-in/);
    expect(src).toMatch(/checkinAlarms\(/);
  });
  it('a tela da pessoa lista os check-ins separados das medicações', () => {
    const src = read('app/(caregiver-tabs)/person.tsx');
    expect(src).toMatch(/title="Check-ins"/);
    expect(src).toMatch(/checkinAlarms\(/);
  });
  it('sem check-in recebido não afirma que não existe', () => {
    for (const f of ['app/(caregiver-tabs)/index.tsx', 'app/(caregiver-tabs)/person.tsx']) {
      const src = read(f);
      expect(src).toMatch(/Nenhum check-in recebido do aparelho/);
      expect(src).not.toMatch(/Nenhum check-in ativo/);
    }
  });
});
