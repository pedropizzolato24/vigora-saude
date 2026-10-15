/**
 * alarm-details.ts
 *
 * Textos das listas de alarmes quando outra pessoa cuida deles (Fase 4, spec
 * 6.2): o aviso no topo e os detalhes de um alarme, sem edição. Sem React Native:
 * tudo aqui é testável no vitest.
 */
import { REPEAT_OPTIONS } from '@/lib/alarm-form';
import { DEFAULT_ESCALATE_MINUTES } from '@/lib/alarm-kind';
import type { Alarm } from '@/lib/app-context';
import { caregiverMid } from '@/lib/managed-alarms-copy';

/** Dias da semana na convenção do app: 0 = domingo (a mesma do getDay() do JS). */
const DAY_ABBR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const READ_ONLY_EMPTY_TEXT = 'Ainda não há nenhum aqui. Quem cuida dos seus alarmes pode adicionar.';

/** "Quem cuida dos seus alarmes é Ana" (ou "... é seu cuidador" quando o nome não veio). */
export function readOnlyBannerText(name: string | null | undefined): string {
  return `Quem cuida dos seus alarmes é ${caregiverMid(name)}`;
}

/** "Diário", "Dias úteis", "Fins de semana" ou os dias escolhidos ("Seg, Qua"). */
export function repeatSummary(alarm: Pick<Alarm, 'repeat' | 'customDays'>): string {
  if (alarm.repeat !== 'custom') {
    return REPEAT_OPTIONS.find((o) => o.value === alarm.repeat)?.label ?? 'Personalizado';
  }
  const days = [...new Set(alarm.customDays ?? [])].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (days.length === 0) return 'Personalizado';
  if (days.length === 7) return 'Todos os dias';
  return days.map((d) => DAY_ABBR[d]).join(', ');
}

/** O que o diálogo de detalhes mostra: horário, nome, repetição e se está ligado. */
export function alarmDetailsCopy(alarm: Alarm): { title: string; message: string; closeLabel: string } {
  const isCheckin = alarm.kind === 'checkin';
  const name = isCheckin ? 'Check-in' : alarm.description.trim() || 'Sem descrição';
  const lines = [
    `Nome: ${name}`,
    `Repetição: ${repeatSummary(alarm)}`,
    `Situação: ${alarm.enabled ? 'Ligado' : 'Desligado'}`,
  ];
  if (isCheckin) {
    lines.push(`Avisa seus contatos após ${alarm.escalateAfterMinutes ?? DEFAULT_ESCALATE_MINUTES} min sem resposta`);
  }
  return { title: alarm.time, message: lines.join('\n'), closeLabel: 'Fechar' };
}
