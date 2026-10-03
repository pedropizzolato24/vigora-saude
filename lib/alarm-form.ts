/**
 * alarm-form.ts
 *
 * Valores e regras puras do formulário de lembrete (criar/editar). A tela é o
 * AlarmFormModal; aqui fica o que é testável sem React.
 */
import { NEW_CHECKIN_ESCALATE_MINUTES, type AlarmKind } from '@/lib/alarm-kind';
import type { Alarm } from '@/lib/app-context';

export type AlarmFormValues = Omit<Alarm, 'id'>;

export const REPEAT_OPTIONS: { value: Alarm['repeat']; label: string }[] = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekdays', label: 'Dias úteis' },
  { value: 'weekends', label: 'Fins de semana' },
  { value: 'custom', label: 'Personalizado' },
];

export const EMPTY_ALARM_FORM: AlarmFormValues = {
  time: '08:00',
  description: '',
  enabled: true,
  repeat: 'daily',
  customDays: [],
  sound: true,
  vibration: true,
};

/** Formulário em branco para criar um alarme do tipo pedido. */
export function emptyFormFor(kind: AlarmKind): AlarmFormValues {
  if (kind === 'checkin') {
    return {
      ...EMPTY_ALARM_FORM,
      time: '09:00',
      description: 'Check-in',
      kind: 'checkin',
      escalateAfterMinutes: NEW_CHECKIN_ESCALATE_MINUTES,
    };
  }
  return EMPTY_ALARM_FORM;
}

/**
 * Só os campos editáveis. `notificationId`/`nativeAlarmUids` ficam de fora de
 * propósito: `scheduleFullAlarm` os recalcula ao salvar.
 */
export function formFromAlarm(alarm: Alarm | null, newKind: AlarmKind = 'medication'): AlarmFormValues {
  if (!alarm) return emptyFormFor(newKind);
  return {
    time: alarm.time,
    description: alarm.description,
    enabled: alarm.enabled,
    repeat: alarm.repeat,
    customDays: alarm.customDays,
    sound: alarm.sound,
    vibration: alarm.vibration,
    ...(alarm.kind ? { kind: alarm.kind } : {}),
    ...(alarm.escalateAfterMinutes ? { escalateAfterMinutes: alarm.escalateAfterMinutes } : {}),
  };
}

/** "Personalizado" sem nenhum dia não tem quando tocar. */
export function isFormSaveDisabled(form: AlarmFormValues): boolean {
  return form.repeat === 'custom' && (form.customDays ?? []).length === 0;
}
