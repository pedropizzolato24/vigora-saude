import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { alarmChangeTitle, alertEventTitle } from '../lib/caregiver-format';

describe('alertEventTitle', () => {
  it('alarme de remédio não respondido', () => {
    expect(alertEventTitle({ alarmId: 'a1', status: 'missed' })).toBe('Alarme não respondido');
  });

  it('not_sent não afirma que o celular está desligado', () => {
    const title = alertEventTitle({ alarmId: 'a1', status: 'not_sent' });
    expect(title).toBe('Alarme sem confirmação do aparelho');
    expect(title).not.toMatch(/desligado|offline/i);
  });

  it('check-in antigo (id fixo) aparece como check-in', () => {
    expect(alertEventTitle({ alarmId: 'checkin-daily', status: 'missed' })).toBe('Check-in não respondido');
  });

  it('check-in novo (kind) aparece como check-in', () => {
    expect(alertEventTitle({ alarmId: 'x', status: 'not_sent', kind: 'checkin' })).toBe(
      'Check-in sem confirmação do aparelho'
    );
  });
});

describe('alarmChangeTitle', () => {
  const base = { alarmDescription: 'Losartana', oldTime: '08:00', newTime: null };

  it('excluído', () => {
    expect(alarmChangeTitle({ ...base, changeType: 'deleted' })).toBe('Excluiu "Losartana"');
  });

  it('desativado', () => {
    expect(alarmChangeTitle({ ...base, changeType: 'disabled' })).toBe('Desativou "Losartana"');
  });

  it('horário mudou', () => {
    expect(alarmChangeTitle({ ...base, changeType: 'rescheduled', newTime: '09:30' })).toBe(
      'Mudou o horário de "Losartana" para 09:30'
    );
  });

  it('só os dias mudaram', () => {
    expect(alarmChangeTitle({ ...base, changeType: 'rescheduled', newTime: '08:00' })).toBe(
      'Mudou os dias de "Losartana"'
    );
  });

  it('sem nome usa o horário', () => {
    expect(alarmChangeTitle({ ...base, alarmDescription: ' ', changeType: 'deleted' })).toBe('Excluiu "08:00"');
  });
});

describe('push do cuidador', () => {
  it('toque nos pushes novos navega (alarm_changed e link_revoked)', () => {
    const src = readFileSync(
      join(__dirname, '..', 'components', 'caregiver-push-initializer.tsx'),
      'utf8'
    );
    expect(src).toMatch(/'alarm_changed'/);
    expect(src).toMatch(/'link_revoked'/);
  });
});
