import type { Alarm } from './app-context';
import { DEFAULT_TIME_ZONE, firingDays, lastFireMs, nextFireMs } from '@/shared/alarm-schedule';

/**
 * Horário de disparo do alarme (próximo / mais recente), em ms epoch.
 *
 * Usado pela rede de segurança do dead man's switch: o app pré-registra no
 * servidor o PRÓXIMO disparo esperado de cada alarme (assim o servidor sabe que
 * era esperado mesmo se o alarme NÃO tocar — Doze/app morto). No disparo real, o
 * handler usa o disparo MAIS RECENTE — o mesmo timestamp canônico (HH:MM:00 do
 * dia) — então o evento idempotente do servidor não duplica. `now` é injetável
 * para teste.
 *
 * A regra mora em `shared/alarm-schedule.ts` (o servidor usa a mesma, com o fuso
 * da conta). Aqui o fuso é o do aparelho.
 */

/** Fuso do aparelho; sem informação do sistema, o padrão do app. */
function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
}

/**
 * Dias JS (getDay: 0=Dom..6=Sáb) em que o alarme dispara, conforme o repeat.
 * 'every' = diário. Fonte ÚNICA da convenção de dias: `shared/alarm-schedule.ts`.
 */
export function firingJsDays(alarm: Alarm): number[] | 'every' {
  return firingDays(alarm);
}

/** Dias semanais do alarme; vazio quando ele não é semanal. */
export function weeklyJsDays(alarm: Alarm): number[] {
  const dias = firingJsDays(alarm);
  return dias === 'every' ? [] : dias;
}

/** Próximo disparo futuro (> now). null se desabilitado/inválido/sem dias. */
export function nextAlarmFireMs(alarm: Alarm, now: Date = new Date()): number | null {
  return nextFireMs(alarm, deviceTimeZone(), now);
}

/** Disparo mais recente (<= now). null se desabilitado/inválido/sem dias. */
export function lastAlarmFireMs(alarm: Alarm, now: Date = new Date()): number | null {
  return lastFireMs(alarm, deviceTimeZone(), now);
}
