import { describe, expect, it } from 'vitest';
import {
  alarmTexts,
  buildCheckinSpeechText,
  checkinAlarms,
  escalateSeconds,
  isCheckinAlarm,
  medicationAlarms,
  normalizeEscalateMinutes,
  ringCopy,
  serverEventExtras,
} from '../lib/alarm-kind';

describe('kind', () => {
  type Item = { id: string; kind?: string | null };
  const med: Item = { id: 'm1' };
  const medExplicit: Item = { id: 'm2', kind: 'medication' };
  const checkin: Item = { id: 'c1', kind: 'checkin' };

  it('alarme sem kind (gravado antes da Fase 3) é remédio', () => {
    expect(isCheckinAlarm(med)).toBe(false);
    expect(medicationAlarms([med, medExplicit, checkin])).toEqual([med, medExplicit]);
    expect(checkinAlarms([med, medExplicit, checkin])).toEqual([checkin]);
  });

  it('kind inesperado (null) também é remédio', () => {
    expect(isCheckinAlarm({ kind: null })).toBe(false);
  });
});

describe('atraso de aviso', () => {
  it('só aceita 5, 10, 15 ou 30; o resto vira 5', () => {
    expect(normalizeEscalateMinutes(15)).toBe(15);
    expect(normalizeEscalateMinutes(7)).toBe(5);
    expect(normalizeEscalateMinutes(undefined)).toBe(5);
    expect(normalizeEscalateMinutes('30')).toBe(5);
  });
  it('escalateSeconds converte para segundos do countdown', () => {
    expect(escalateSeconds({ escalateAfterMinutes: 10 })).toBe(600);
    expect(escalateSeconds({})).toBe(300);
  });
});

describe('serverEventExtras', () => {
  it('remédio não manda nada extra (servidor assume remédio e 5 min)', () => {
    expect(serverEventExtras({})).toEqual({});
    expect(serverEventExtras({ kind: 'medication', escalateAfterMinutes: 30 })).toEqual({});
  });
  it('check-in manda kind e o atraso', () => {
    expect(serverEventExtras({ kind: 'checkin', escalateAfterMinutes: 10 })).toEqual({
      kind: 'checkin',
      graceMinutes: 10,
    });
    expect(serverEventExtras({ kind: 'checkin' })).toEqual({ kind: 'checkin', graceMinutes: 5 });
  });
});

describe('alarmTexts', () => {
  it('remédio mantém EXATAMENTE os textos de hoje', () => {
    const t = alarmTexts({ description: 'Losartana', time: '08:00' });
    expect(t).toEqual({
      nativeTitle: '⏰ Vigora - Alarme de Medicamento',
      nativeBody: 'Losartana - Toque para confirmar que tomou o medicamento',
      dismissText: 'Dispensar',
      notificationTitle: '⏰ Losartana',
      notificationBody: 'Hora do alarme: 08:00 - Losartana',
      alarmKitTitle: 'Losartana',
      stopButtonLabel: 'Desligar',
    });
  });

  it('remédio sem nome', () => {
    const t = alarmTexts({ time: '08:00' });
    expect(t.nativeBody).toBe('Toque aqui para confirmar que tomou o medicamento');
    expect(t.notificationTitle).toBe('⏰ Alarme');
    expect(t.notificationBody).toBe('Hora do alarme: 08:00');
    expect(t.alarmKitTitle).toBe('Hora do remédio');
  });

  it('check-in pergunta se está tudo bem e o botão é "Estou bem"', () => {
    const t = alarmTexts({ kind: 'checkin', description: 'Check-in', time: '09:00' });
    expect(t.nativeTitle).toBe('💚 Vigora - Check-in');
    expect(t.nativeBody).toBe('Está tudo bem? Toque aqui para confirmar.');
    expect(t.dismissText).toBe('Estou bem');
    expect(t.stopButtonLabel).toBe('Estou bem');
    expect(t.notificationTitle).toBe('💚 Check-in: está tudo bem?');
    expect(t.notificationBody).toBe('Hora do seu check-in: 09:00. Toque para confirmar que está tudo bem.');
    expect(t.alarmKitTitle).toBe('Check-in: está tudo bem?');
  });
});

describe('ringCopy', () => {
  it('remédio mantém os textos de hoje', () => {
    expect(ringCopy(false)).toEqual({
      topLabel: 'ALARME',
      fallbackName: 'Alarme',
      countdownLabel: 'Mensagem de emergência em',
      countdownHint: 'Toque em "Desligar" para cancelar o envio',
      escalatedText: 'Mensagem de emergência enviada para seus contatos',
      dismissLabel: 'Desligar Alarme',
      dismissA11y: 'Desligar alarme',
    });
  });
  it('check-in', () => {
    const c = ringCopy(true);
    expect(c.topLabel).toBe('CHECK-IN');
    expect(c.fallbackName).toBe('Está tudo bem?');
    expect(c.dismissLabel).toBe('Estou bem');
    expect(c.countdownHint).toContain('Estou bem');
  });
});

describe('buildCheckinSpeechText', () => {
  it('pede para tocar em "Estou bem"', () => {
    const text = buildCheckinSpeechText('09:00', false);
    expect(text).toContain('Hora do seu check-in');
    expect(text).toContain('Toque em Estou bem');
  });
  it('no AlarmKit o botão já foi apertado', () => {
    const text = buildCheckinSpeechText('09:00', true);
    expect(text).not.toContain('Toque em Estou bem');
    expect(text).toContain('Que bom que você está bem');
  });
});
