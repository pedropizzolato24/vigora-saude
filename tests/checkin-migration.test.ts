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
    scheduleAlarm: vi.fn(async (a: Alarm) => ({ ...a, nativeAlarmUids: ['u'] })),
    addAlarm: vi.fn(),
    disableLegacy: vi.fn(),
    cancelLegacyNotifications: vi.fn(async () => undefined),
    ...over,
  } as never;
}

const enabled = { checkinEnabled: true, checkinTime: '09:30' };
const disabled = { checkinEnabled: false, checkinTime: '09:30' };

describe('buildMigratedCheckin', () => {
  it('cria um alarme diário de check-in no horário antigo, com aviso em 30 min e id fixo', () => {
    expect(buildMigratedCheckin(enabled, [medication])).toEqual({
      id: 'checkin-migrated', time: '09:30', description: 'Check-in', enabled: true,
      repeat: 'daily', customDays: [], sound: true, vibration: true,
      kind: 'checkin', escalateAfterMinutes: 30,
    });
  });
  it('check-in desligado não cria nada', () => {
    expect(buildMigratedCheckin(disabled, [])).toBeNull();
  });
  it('já existe um check-in: não duplica', () => {
    const existing = { ...medication, id: 'c1', kind: 'checkin' as const };
    expect(buildMigratedCheckin(enabled, [existing])).toBeNull();
  });
  it('hora de um dígito é completada', () => {
    expect(buildMigratedCheckin({ checkinEnabled: true, checkinTime: '9:05' }, [])?.time).toBe('09:05');
  });
});

describe('migrateLegacyCheckin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('check-in ligado: cria, agenda e desarma o sistema antigo', async () => {
    const d = deps();
    const outcome = await migrateLegacyCheckin({ alarms: [medication], settings: enabled }, d);

    expect(outcome).toBe('migrated');
    expect(d.scheduleAlarm).toHaveBeenCalledTimes(1);
    expect(d.addAlarm).toHaveBeenCalledTimes(1);
    expect(d.addAlarm.mock.calls[0][0]).toMatchObject({
      id: 'checkin-migrated', kind: 'checkin', time: '09:30', nativeAlarmUids: ['u'],
    });
    expect(d.disableLegacy).toHaveBeenCalledTimes(1);
  });

  it('desligado no estado local: nada; depois o estado restaurado da nuvem (ligado) migra', async () => {
    const d = deps();
    expect(await migrateLegacyCheckin({ alarms: [], settings: disabled }, d)).toBe('nothing');
    expect(d.scheduleAlarm).not.toHaveBeenCalled();
    expect(d.disableLegacy).not.toHaveBeenCalled();

    expect(await migrateLegacyCheckin({ alarms: [], settings: enabled }, d)).toBe('migrated');
    expect(d.addAlarm).toHaveBeenCalledTimes(1);
    expect(d.disableLegacy).toHaveBeenCalledTimes(1);
  });

  it('desligado (já migrado antes ou nunca ligado): cancela as notificações antigas que sobraram', async () => {
    const d = deps();
    expect(await migrateLegacyCheckin({ alarms: [], settings: disabled }, d)).toBe('nothing');
    expect(d.cancelLegacyNotifications).toHaveBeenCalledTimes(1);
    expect(d.scheduleAlarm).not.toHaveBeenCalled();
  });

  it('migrou: cancela as notificações antigas depois de desarmar o sistema antigo', async () => {
    const d = deps();
    expect(await migrateLegacyCheckin({ alarms: [], settings: enabled }, d)).toBe('migrated');
    expect(d.cancelLegacyNotifications).toHaveBeenCalledTimes(1);
  });

  it('migração falhou: as notificações antigas são canceladas mesmo assim e a flag continua ligada', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = deps({ scheduleAlarm: vi.fn(async () => { throw new Error('x'); }) });
    expect(await migrateLegacyCheckin({ alarms: [], settings: enabled }, d)).toBe('failed');
    expect(d.cancelLegacyNotifications).toHaveBeenCalledTimes(1);
    expect(d.disableLegacy).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('sem espaço: as notificações antigas são canceladas e a flag continua ligada', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const d = deps();
    const full = Array.from({ length: 24 }, (_, i) => ({ ...medication, id: `m${i}` }));
    expect(await migrateLegacyCheckin({ alarms: full, settings: enabled }, d)).toBe('failed');
    expect(d.cancelLegacyNotifications).toHaveBeenCalledTimes(1);
    expect(d.disableLegacy).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falha ao cancelar não derruba a migração nem some em silêncio', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = deps({ cancelLegacyNotifications: vi.fn(async () => { throw new Error('nope'); }) });
    expect(await migrateLegacyCheckin({ alarms: [], settings: enabled }, d)).toBe('migrated');
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it('ligado e já existe check-in: não cria outro, só desliga o antigo', async () => {
    const d = deps();
    const existing = { ...medication, id: 'c1', kind: 'checkin' as const };
    expect(await migrateLegacyCheckin({ alarms: [existing], settings: enabled }, d)).toBe('nothing');
    expect(d.scheduleAlarm).not.toHaveBeenCalled();
    expect(d.addAlarm).not.toHaveBeenCalled();
    expect(d.disableLegacy).toHaveBeenCalledTimes(1);
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

  it('horário inválido: usa 09:00, avisa no log e migra', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const d = deps();
    const outcome = await migrateLegacyCheckin(
      { alarms: [], settings: { checkinEnabled: true, checkinTime: 'lixo' } },
      d
    );
    expect(outcome).toBe('migrated');
    expect(d.addAlarm.mock.calls[0][0]).toMatchObject({ kind: 'checkin', time: '09:00' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain('lixo');
    warn.mockRestore();
  });

  it('falha ao agendar: a flag continua ligada para tentar de novo depois', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = deps({ scheduleAlarm: vi.fn(async () => { throw new Error('sistema recusou'); }) });
    expect(await migrateLegacyCheckin({ alarms: [], settings: enabled }, d)).toBe('failed');
    expect(d.addAlarm).not.toHaveBeenCalled();
    expect(d.disableLegacy).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('sem espaço (24 alarmes): não migra e a flag continua ligada', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const d = deps();
    const full = Array.from({ length: 24 }, (_, i) => ({ ...medication, id: `m${i}` }));
    expect(await migrateLegacyCheckin({ alarms: full, settings: enabled }, d)).toBe('failed');
    expect(d.scheduleAlarm).not.toHaveBeenCalled();
    expect(d.disableLegacy).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('com 23 alarmes ainda cabe o check-in (o limite é o total de 24)', async () => {
    const d = deps();
    const almostFull = Array.from({ length: 23 }, (_, i) => ({ ...medication, id: `m${i}` }));
    expect(await migrateLegacyCheckin({ alarms: almostFull, settings: enabled }, d)).toBe('migrated');
  });

  it('24 alarmes entre remédios (com e sem kind) lotam o limite', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const d = deps();
    const mixed = Array.from({ length: 24 }, (_, i) => ({
      ...medication,
      id: `m${i}`,
      ...(i % 2 === 0 ? { kind: 'medication' as const } : {}),
    }));
    expect(await migrateLegacyCheckin({ alarms: mixed, settings: enabled }, d)).toBe('failed');
    warn.mockRestore();
  });
});
