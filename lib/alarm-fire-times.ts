import type { Alarm } from './app-context';

/**
 * Horário de disparo do alarme (próximo / mais recente), em ms epoch.
 *
 * Usado pela rede de segurança do dead man's switch: o app pré-registra no
 * servidor o PRÓXIMO disparo esperado de cada alarme (assim o servidor sabe que
 * era esperado mesmo se o alarme NÃO tocar — Doze/app morto). No disparo real, o
 * handler usa o disparo MAIS RECENTE — o mesmo timestamp canônico (HH:MM:00 do
 * dia) — então o evento idempotente do servidor não duplica. `now` é injetável
 * para teste.
 */

function parseHM(time: string): [number, number] | null {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return [h, m];
}

// Dias JS (getDay: 0=Dom..6=Sáb) em que o alarme dispara, conforme o repeat.
// 'every' = diário (também trata one-time/desconhecido como diário, igual ao
// comportamento anterior do handler).
function firingJsDays(alarm: Alarm): number[] | 'every' {
  switch (alarm.repeat) {
    case 'weekdays': return [1, 2, 3, 4, 5];
    case 'weekends': return [0, 6];
    case 'custom': return alarm.customDays && alarm.customDays.length ? alarm.customDays : [];
    default: return 'every';
  }
}

/** Próximo disparo futuro (> now). null se desabilitado/inválido/sem dias. */
export function nextAlarmFireMs(alarm: Alarm, now: Date = new Date()): number | null {
  if (!alarm.enabled) return null;
  const hm = parseHM(alarm.time);
  if (!hm) return null;
  const [hours, minutes] = hm;
  const days = firingJsDays(alarm);

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

/** Disparo mais recente (<= now). null se desabilitado/inválido/sem dias. */
export function lastAlarmFireMs(alarm: Alarm, now: Date = new Date()): number | null {
  if (!alarm.enabled) return null;
  const hm = parseHM(alarm.time);
  if (!hm) return null;
  const [hours, minutes] = hm;
  const days = firingJsDays(alarm);

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
