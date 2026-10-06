import { describe, expect, it } from 'vitest';
import { eventDisplayName, isAlarmGone, visibleHistoryEvents } from '../lib/alarm-history';

const NOW = new Date('2026-10-02T12:00:00Z').getTime();
const FUTURE = '2026-10-03T08:00:00.000Z';
const PAST = '2026-10-01T08:00:00.000Z';

const ev = (over: Record<string, unknown> = {}) => ({
  alarmId: 'a1',
  alarmDescription: 'Losartana',
  status: 'responded',
  scheduledAt: PAST,
  ...over,
});

describe('visibleHistoryEvents', () => {
  const alarms = [{ id: 'a1', enabled: true }];

  it('mantém o passado de um alarme excluído (é o registro do que aconteceu)', () => {
    const events = [ev({ alarmId: 'gone', status: 'missed' })];
    expect(visibleHistoryEvents(events, alarms, NOW)).toHaveLength(1);
  });

  it('esconde o "Agendado" de um alarme excluído', () => {
    const events = [ev({ alarmId: 'gone', status: 'pending', scheduledAt: FUTURE })];
    expect(visibleHistoryEvents(events, alarms, NOW)).toEqual([]);
  });

  it('esconde o "Agendado" de um alarme desativado', () => {
    const events = [ev({ status: 'pending', scheduledAt: FUTURE })];
    expect(visibleHistoryEvents(events, [{ id: 'a1', enabled: false }], NOW)).toEqual([]);
  });

  it('mantém o "Agendado" de um alarme ligado', () => {
    const events = [ev({ status: 'pending', scheduledAt: FUTURE })];
    expect(visibleHistoryEvents(events, alarms, NOW)).toHaveLength(1);
  });

  it('o check-in antigo (id fixo) nunca some por não estar na lista', () => {
    const events = [ev({ alarmId: 'checkin-daily', status: 'pending', scheduledAt: FUTURE })];
    expect(visibleHistoryEvents(events, alarms, NOW)).toHaveLength(1);
  });
});

describe('isAlarmGone / eventDisplayName', () => {
  const alarms = [{ id: 'a1', enabled: true }];

  it('alarme na lista não está excluído', () => {
    expect(isAlarmGone(ev(), alarms)).toBe(false);
    expect(eventDisplayName(ev(), alarms)).toBe('Losartana');
  });

  it('alarme fora da lista leva "(excluído)"', () => {
    expect(isAlarmGone(ev({ alarmId: 'gone' }), alarms)).toBe(true);
    expect(eventDisplayName(ev({ alarmId: 'gone' }), alarms)).toBe('Losartana (excluído)');
  });

  it('check-in antigo nunca é "excluído" e tem nome próprio', () => {
    const e = ev({ alarmId: 'checkin-daily', alarmDescription: '' });
    expect(isAlarmGone(e, alarms)).toBe(false);
    expect(eventDisplayName(e, alarms)).toBe('Check-in');
  });

  it('sem descrição, remédio excluído usa o nome genérico', () => {
    expect(eventDisplayName(ev({ alarmId: 'gone', alarmDescription: '' }), alarms)).toBe(
      'Alarme de Medicamento (excluído)'
    );
  });
});
