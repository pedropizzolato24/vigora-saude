import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMigratedCheckin, migrateLegacyCheckin, type MigrationDeps } from '../lib/checkin-migration';
import type { Alarm } from '../lib/app-context';

const medication: Alarm = {
  id: 'm1', time: '08:00', description: 'Losartana', enabled: true,
  repeat: 'daily', customDays: [], sound: true, vibration: true,
};

type MockDeps = { [K in keyof MigrationDeps]: ReturnType<typeof vi.fn> };

function deps(over: Partial<Record<keyof MigrationDeps, unknown>> = {}): MockDeps & MigrationDeps {
  return {
    isDone: vi.fn(async () => false),
    markDone: vi.fn(async () => undefined),
    scheduleAlarm: vi.fn(async (a: Alarm) => ({ ...a, nativeAlarmUids: ['u'] })),
    addAlarm: vi.fn(),
    disableLegacy: vi.fn(),
    newId: vi.fn(() => 'new-id'),
    ...over,
  } as never;
}

const enabled = { checkinEnabled: true, checkinTime: '09:30' };

describe('buildMigratedCheckin', () => {
  it('cria um alarme diário de check-in no horário antigo, com aviso em 30 min', () => {
    expect(buildMigratedCheckin(enabled, [medication], 'abc')).toEqual({
      id: 'abc', time: '09:30', description: 'Check-in', enabled: true,
      repeat: 'daily', customDays: [], sound: true, vibration: true,
      kind: 'checkin', escalateAfterMinutes: 30,
    });
  });
  it('check-in desligado não cria nada', () => {
    expect(buildMigratedCheckin({ checkinEnabled: false, checkinTime: '09:30' }, [], 'abc')).toBeNull();
  });
  it('já existe um check-in: não duplica', () => {
    const existing = { ...medication, id: 'c1', kind: 'checkin' as const };
    expect(buildMigratedCheckin(enabled, [existing], 'abc')).toBeNull();
  });
  it('horário inválido não cria nada; hora de um dígito é completada', () => {
    expect(buildMigratedCheckin({ checkinEnabled: true, checkinTime: 'lixo' }, [], 'abc')).toBeNull();
    expect(buildMigratedCheckin({ checkinEnabled: true, checkinTime: '9:05' }, [], 'abc')?.time).toBe('09:05');
  });
});

describe('migrateLegacyCheckin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('check-in ligado: cria, agenda, desarma o sistema antigo e marca como feito', async () => {
    const d = deps();
    const outcome = await migrateLegacyCheckin({ alarms: [medication], settings: enabled }, d);

    expect(outcome).toBe('migrated');
    expect(d.scheduleAlarm).toHaveBeenCalledTimes(1);
    expect(d.addAlarm).toHaveBeenCalledTimes(1);
    expect(d.addAlarm.mock.calls[0][0]).toMatchObject({ kind: 'checkin', time: '09:30', nativeAlarmUids: ['u'] });
    expect(d.disableLegacy).toHaveBeenCalledTimes(1);
    expect(d.markDone).toHaveBeenCalledTimes(1);
  });

  it('check-in desligado: nada a criar, mas marca como feito', async () => {
    const d = deps();
    const outcome = await migrateLegacyCheckin(
      { alarms: [], settings: { checkinEnabled: false, checkinTime: '09:00' } },
      d
    );
    expect(outcome).toBe('nothing');
    expect(d.scheduleAlarm).not.toHaveBeenCalled();
    expect(d.disableLegacy).not.toHaveBeenCalled();
    expect(d.markDone).toHaveBeenCalledTimes(1);
  });

  it('já migrado (interrompido no meio): não duplica, desarma o antigo e marca', async () => {
    const d = deps();
    const existing = { ...medication, id: 'c1', kind: 'checkin' as const };
    const outcome = await migrateLegacyCheckin({ alarms: [existing], settings: enabled }, d);
    expect(outcome).toBe('nothing');
    expect(d.scheduleAlarm).not.toHaveBeenCalled();
    expect(d.disableLegacy).toHaveBeenCalledTimes(1);
    expect(d.markDone).toHaveBeenCalledTimes(1);
  });

  it('já feito antes: não faz nada', async () => {
    const d = deps({ isDone: vi.fn(async () => true) });
    expect(await migrateLegacyCheckin({ alarms: [], settings: enabled }, d)).toBe('skipped');
    expect(d.scheduleAlarm).not.toHaveBeenCalled();
    expect(d.markDone).not.toHaveBeenCalled();
  });

  it('duas chamadas ao mesmo tempo criam UM alarme só', async () => {
    const d = deps();
    const state = { alarms: [medication], settings: enabled };
    const [a, b] = await Promise.all([migrateLegacyCheckin(state, d), migrateLegacyCheckin(state, d)]);
    expect(a).toBe('migrated');
    expect(b).toBe('migrated');
    expect(d.scheduleAlarm).toHaveBeenCalledTimes(1);
    expect(d.addAlarm).toHaveBeenCalledTimes(1);
  });

  it('falha ao agendar: o sistema antigo continua valendo e tenta de novo na próxima abertura', async () => {
    const d = deps({ scheduleAlarm: vi.fn(async () => { throw new Error('sistema recusou'); }) });
    expect(await migrateLegacyCheckin({ alarms: [], settings: enabled }, d)).toBe('failed');
    expect(d.addAlarm).not.toHaveBeenCalled();
    expect(d.disableLegacy).not.toHaveBeenCalled();
    expect(d.markDone).not.toHaveBeenCalled();
  });

  it('sem espaço (24 alarmes): não migra e o sistema antigo continua valendo', async () => {
    const d = deps();
    const full = Array.from({ length: 24 }, (_, i) => ({ ...medication, id: `m${i}` }));
    expect(await migrateLegacyCheckin({ alarms: full, settings: enabled }, d)).toBe('failed');
    expect(d.scheduleAlarm).not.toHaveBeenCalled();
    expect(d.disableLegacy).not.toHaveBeenCalled();
  });

  it('com 23 alarmes ainda cabe o check-in (o limite é o total de 24)', async () => {
    const d = deps();
    const almostFull = Array.from({ length: 23 }, (_, i) => ({ ...medication, id: `m${i}` }));
    expect(await migrateLegacyCheckin({ alarms: almostFull, settings: enabled }, d)).toBe('migrated');
  });

  it('24 alarmes entre remédios (com e sem kind) lotam o limite', async () => {
    const d = deps();
    const mixed = Array.from({ length: 24 }, (_, i) => ({
      ...medication,
      id: `m${i}`,
      ...(i % 2 === 0 ? { kind: 'medication' as const } : {}),
    }));
    expect(await migrateLegacyCheckin({ alarms: mixed, settings: enabled }, d)).toBe('failed');
  });
});
