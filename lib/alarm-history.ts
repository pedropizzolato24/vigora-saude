/**
 * alarm-history.ts
 *
 * Regras de exibição do histórico de alarmes. O histórico vem do servidor e
 * guarda o nome do alarme no evento: excluir um alarme no app não mexe nos
 * eventos já registrados. Aqui o passado é mantido (é o registro do que
 * aconteceu) e marcado "(excluído)"; o disparo FUTURO agendado de um alarme
 * excluído ou desativado some — ele não vai acontecer.
 */
import { LEGACY_CHECKIN_ALARM_ID } from '@/lib/caregiver-format';

export interface HistoryEventLike {
  alarmId: string;
  alarmDescription: string;
  status: string;
  scheduledAt: string;
  kind?: string | null;
}

interface AlarmRef {
  id: string;
  enabled: boolean;
}

const isCheckin = (e: { alarmId: string; kind?: string | null }): boolean =>
  e.kind === 'checkin' || e.alarmId === LEGACY_CHECKIN_ALARM_ID;

/** O check-in antigo nunca esteve na lista de alarmes: "ausente" não prova exclusão. */
export function isAlarmGone(e: HistoryEventLike, alarms: AlarmRef[]): boolean {
  if (e.alarmId === LEGACY_CHECKIN_ALARM_ID) return false;
  return !alarms.some((a) => a.id === e.alarmId);
}

export function visibleHistoryEvents<T extends HistoryEventLike>(
  events: T[],
  alarms: AlarmRef[],
  now: number = Date.now()
): T[] {
  return events.filter((e) => {
    const scheduled = e.status === 'pending' && new Date(e.scheduledAt).getTime() > now;
    if (!scheduled) return true;
    if (e.alarmId === LEGACY_CHECKIN_ALARM_ID) return true;
    const alarm = alarms.find((a) => a.id === e.alarmId);
    return !!alarm && alarm.enabled;
  });
}

export function eventDisplayName(e: HistoryEventLike, alarms: AlarmRef[]): string {
  const base = e.alarmDescription || (isCheckin(e) ? 'Check-in' : 'Alarme de Medicamento');
  return isAlarmGone(e, alarms) ? `${base} (excluído)` : base;
}
