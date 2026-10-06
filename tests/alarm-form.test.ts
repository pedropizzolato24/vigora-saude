import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_ALARM_FORM,
  type AlarmFormValues,
  formFromAlarm,
  formForSave,
  isFormSaveDisabled,
  REPEAT_OPTIONS,
} from '../lib/alarm-form';
import type { Alarm } from '../lib/app-context';

const alarm: Alarm = {
  id: 'a1',
  time: '09:30',
  description: 'Losartana',
  enabled: false,
  repeat: 'custom',
  customDays: [1, 3],
  sound: false,
  vibration: true,
  notificationId: 'n1',
  nativeAlarmUids: ['vigora_a1_wd1'],
};

describe('formFromAlarm', () => {
  it('sem alarme devolve o formulário em branco', () => {
    expect(formFromAlarm(null)).toEqual(EMPTY_ALARM_FORM);
    expect(EMPTY_ALARM_FORM).toMatchObject({ time: '08:00', repeat: 'daily', sound: true, vibration: true, enabled: true });
  });

  it('copia só os campos editáveis (ids de agendamento são recalculados no salvar)', () => {
    const form = formFromAlarm(alarm);
    expect(form).toEqual({
      time: '09:30',
      description: 'Losartana',
      enabled: false,
      repeat: 'custom',
      customDays: [1, 3],
      sound: false,
      vibration: true,
    });
    expect(form).not.toHaveProperty('notificationId');
    expect(form).not.toHaveProperty('nativeAlarmUids');
  });
});

describe('isFormSaveDisabled', () => {
  it('personalizado sem nenhum dia não salva', () => {
    expect(isFormSaveDisabled({ ...EMPTY_ALARM_FORM, repeat: 'custom', customDays: [] })).toBe(true);
    expect(isFormSaveDisabled({ ...EMPTY_ALARM_FORM, repeat: 'custom', customDays: undefined })).toBe(true);
  });
  it('personalizado com dia, ou outra repetição, salva', () => {
    expect(isFormSaveDisabled({ ...EMPTY_ALARM_FORM, repeat: 'custom', customDays: [2] })).toBe(false);
    expect(isFormSaveDisabled(EMPTY_ALARM_FORM)).toBe(false);
  });
});

describe('REPEAT_OPTIONS', () => {
  it('tem as quatro repetições na ordem da tela', () => {
    expect(REPEAT_OPTIONS.map((o) => o.value)).toEqual(['daily', 'weekdays', 'weekends', 'custom']);
  });
});

describe('telas', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  it('a lista de lembretes usa o componente e não tem mais o assistente', () => {
    const alarms = read('components/alarm-list-screen.tsx');
    expect(alarms).toMatch(/<AlarmFormModal/);
    expect(alarms).not.toMatch(/WizardStep|wizardStep/);
  });

  it('o formulário normal é uma tela única, na ordem da spec', () => {
    const modal = read('components/alarm-form-modal.tsx');
    expect(modal).not.toMatch(/WizardStep/);
    const order = ['Nome do lembrete', 'Que horas tomar?', 'Repetição', 'Som', 'Vibração', 'Habilitado', 'Excluir lembrete'];
    // Só o ramo normal (o acessível vem antes no arquivo e tem outros textos).
    const normal = modal.slice(modal.indexOf('MODO NORMAL'));
    const positions = order.map((label) => normal.indexOf(label));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('o modo acessível ganha Som e Vibração', () => {
    const modal = read('components/alarm-form-modal.tsx');
    const accessible = modal.slice(0, modal.indexOf('MODO NORMAL'));
    expect(accessible).toMatch(/label: 'Som'/);
    expect(accessible).toMatch(/label: 'Vibração'/);
    expect(accessible).toMatch(/value=\{form\[row\.key\]\}/);
    expect(accessible).toMatch(/key: 'sound' as const/);
    expect(accessible).toMatch(/key: 'vibration' as const/);
    expect(accessible).toMatch(/accessibilityLabel=\{`Ativar \$\{row\.label\.toLowerCase\(\)\}`\}/);
    expect(accessible).not.toMatch(/no modo acessível/);
    expect(accessible).toMatch(/thumbColor=\{ac\.onPrimary\}/);
  });

  it('o check-in não tem seção de Repetição em nenhum dos modos', () => {
    const modal = read('components/alarm-form-modal.tsx');
    const accessible = modal.slice(0, modal.indexOf('MODO NORMAL'));
    const normal = modal.slice(modal.indexOf('MODO NORMAL'));
    // Cada bloco "Repetição" só aparece fora do check-in.
    expect(accessible).toMatch(/\{!isCheckin && \(\s*<View style=\{\{ gap: 12 \}\}>\s*<Text[^>]*>Repetição<\/Text>/);
    expect(normal).toMatch(/\{!isCheckin && \(\s*<View style=\{styles\.formGroup\}>\s*<Text[^>]*>Repetição<\/Text>/);
  });

  it('salvar usa formForSave nos dois modos', () => {
    const modal = read('components/alarm-form-modal.tsx');
    expect(modal.match(/onSave\(formForSave\(form\)\)/g)).toHaveLength(2);
    expect(modal).not.toMatch(/onSave\(isCheckin/);
  });
});

describe('check-in repete todo dia', () => {
  const checkin: AlarmFormValues = { ...EMPTY_ALARM_FORM, kind: 'checkin', escalateAfterMinutes: 15 };

  it('formForSave força diário, sem dias, e o nome fixo', () => {
    const saved = formForSave({ ...checkin, repeat: 'custom', customDays: [1, 3], description: 'outro' });
    expect(saved).toMatchObject({ repeat: 'daily', customDays: [], description: 'Check-in', kind: 'checkin', escalateAfterMinutes: 15 });
  });

  it('um check-in antigo com repetição semanal volta a diário ao salvar', () => {
    expect(formForSave({ ...checkin, repeat: 'weekdays' }).repeat).toBe('daily');
  });

  it('remédio passa intacto', () => {
    const med = { ...EMPTY_ALARM_FORM, repeat: 'weekdays' as const, description: 'Losartana' };
    expect(formForSave(med)).toBe(med);
  });

  it('check-in nunca bloqueia o Salvar por "Personalizado sem dias"', () => {
    expect(isFormSaveDisabled({ ...checkin, repeat: 'custom', customDays: [] })).toBe(false);
  });
});
