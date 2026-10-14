import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('soneca removida (feedback do beta, out/2026)', () => {
  it('nenhum agendamento nativo oferece soneca', () => {
    const manager = read('lib/native-alarm-manager.ts');
    expect(manager).not.toMatch(/showSnooze: true/);
    expect(manager).not.toMatch(/export async function snoozeNativeAlarm/);
  });

  it('a alarm-ring não tem soneca em nenhum modo', () => {
    expect(read('app/alarm-ring.tsx')).not.toMatch(/snooze|soneca/i);
  });

  it('o sufixo _snooze continua reconhecido (alarme de soneca já armado no aparelho)', () => {
    expect(read('app/+native-intent.ts')).toMatch(/_snooze/);
    expect(read('components/alarm-notification-handler.tsx')).toMatch(/_snooze/);
  });
});
