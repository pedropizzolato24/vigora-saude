import type { Alarm } from './app-context';
import { firingDays, lastFireMs, nextFireMs } from '@/shared/alarm-schedule';

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
 * da conta). Aqui o fuso é o do aparelho; se o Intl do aparelho não servir, cai
 * no cálculo com o `Date` local (o caminho básico do sistema).
 */

/**
 * Fuso do aparelho. Em ROM enxuta sem dados de ICU o Intl pode não resolver o
 * fuso: devolve null (e loga o motivo) e o chamador usa o relógio local.
 */
function deviceTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
    console.warn('[AlarmFireTimes] fuso do aparelho vazio; usando o relógio local');
  } catch (error) {
    console.warn('[AlarmFireTimes] fuso do aparelho indisponível:', error);
  }
  return null;
}

function localHM(time: string): [number, number] | null {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return [h, m];
}

/** Próximo disparo com o `Date` local do aparelho: o caminho básico se o Intl não servir. */
function localNextFireMs(alarm: Alarm, now: Date): number | null {
  if (!alarm.enabled) return null;
  const hm = localHM(alarm.time);
  if (!hm) return null;
  const [hours, minutes] = hm;
  const days = firingDays(alarm);

  if (days === 'every') {
    const d = new Date(now);
    d.setHours(hours, minutes, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  if (days.length === 0) return null;

  const todayJs = now.getDay();
  const times = days.map((jsDay) => {
    const d = new Date(now);
    d.setHours(hours, minutes, 0, 0);
    let daysUntil = (jsDay - todayJs + 7) % 7;
    if (daysUntil === 0 && d.getTime() <= now.getTime()) daysUntil = 7;
    d.setDate(d.getDate() + daysUntil);
    return d.getTime();
  });
  return Math.min(...times);
}

/** Disparo mais recente com o `Date` local do aparelho. */
function localLastFireMs(alarm: Alarm, now: Date): number | null {
  if (!alarm.enabled) return null;
  const hm = localHM(alarm.time);
  if (!hm) return null;
  const [hours, minutes] = hm;
  const days = firingDays(alarm);

  if (days === 'every') {
    const d = new Date(now);
    d.setHours(hours, minutes, 0, 0);
    if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 1);
    return d.getTime();
  }
  if (days.length === 0) return null;

  const todayJs = now.getDay();
  const times = days.map((jsDay) => {
    const d = new Date(now);
    d.setHours(hours, minutes, 0, 0);
    let daysAgo = (todayJs - jsDay + 7) % 7;
    if (daysAgo === 0 && d.getTime() > now.getTime()) daysAgo = 7;
    d.setDate(d.getDate() - daysAgo);
    return d.getTime();
  });
  return Math.max(...times);
}

/**
 * Regra compartilhada com o fuso do aparelho; se o Intl não servir (sem fuso,
 * erro ou sem resultado numérico), cai no cálculo com o `Date` local. Um `null`
 * legítimo (desabilitado, sem dias) também volta null do cálculo local.
 */
function withLocalFallback(
  shared: (timeZone: string) => number | null,
  local: () => number | null
): number | null {
  const tz = deviceTimeZone();
  if (tz) {
    try {
      const ms = shared(tz);
      if (ms !== null && Number.isFinite(ms)) return ms;
    } catch (error) {
      console.warn('[AlarmFireTimes] regra por fuso falhou; usando o relógio local:', error);
      return local();
    }
  }
  const ms = local();
  if (tz && ms !== null) console.warn('[AlarmFireTimes] regra por fuso sem resultado; usando o relógio local');
  return ms;
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
  return withLocalFallback((tz) => nextFireMs(alarm, tz, now), () => localNextFireMs(alarm, now));
}

/** Disparo mais recente (<= now). null se desabilitado/inválido/sem dias. */
export function lastAlarmFireMs(alarm: Alarm, now: Date = new Date()): number | null {
  return withLocalFallback((tz) => lastFireMs(alarm, tz, now), () => localLastFireMs(alarm, now));
}
