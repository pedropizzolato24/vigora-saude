import type { ManagedAlarm } from './managed-alarm';

/**
 * Regra ÚNICA de dias e horários dos alarmes, ciente de fuso horário.
 *
 * Importada pelo app (com o fuso do aparelho, via `lib/alarm-fire-times.ts`) e
 * pelo servidor (com o fuso guardado da conta). Módulo PURO: só `Intl`, sem
 * dependência nova, sem React Native e sem Node.
 *
 * A convenção de dias (0 = domingo .. 6 = sábado, a do `getDay()` do JS) mora
 * aqui e em nenhum outro lugar: foi a duplicação dela que fez todo alarme semanal
 * disparar um dia depois.
 *
 * Horário de verão, decidido de forma determinística (o mesmo que o `Date` local
 * do JS faz no aparelho):
 *  - horário que NÃO existe (pulo da primavera, ex.: 02:30 em 08/03/2026 em Nova
 *    York) dispara adiantado, às 03:30;
 *  - horário que existe DUAS vezes (volta do outono, ex.: 01:30) dispara na
 *    primeira vez.
 */

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

export type ScheduleAlarm = Pick<ManagedAlarm, 'time' | 'enabled' | 'repeat' | 'customDays'>;

const DAY_MS = 86_400_000;

/**
 * Dias (0 = domingo .. 6 = sábado) em que o alarme dispara, ou 'every' (diário;
 * também trata repetição desconhecida como diário). `customDays` pode vir de
 * estado restaurado da nuvem, então dia fora de 0..6 é descartado aqui, uma vez só.
 */
export function firingDays(alarm: ScheduleAlarm): number[] | 'every' {
  switch (alarm.repeat) {
    case 'weekdays':
      return [1, 2, 3, 4, 5];
    case 'weekends':
      return [0, 6];
    case 'custom':
      return (alarm.customDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    default:
      return 'every';
  }
}

function parseHM(time: string): [number, number] | null {
  if (typeof time !== 'string') return null;
  const [h, m] = time.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return [h, m];
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Formatador do fuso, ou null se o nome não for um fuso IANA conhecido. */
function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, fmt);
    return fmt;
  } catch (err) {
    // Fuso inválido é entrada normal (vem do aparelho/banco): cai no padrão.
    // Qualquer outro erro é bug de verdade e não pode ser engolido.
    if (!(err instanceof RangeError)) throw err;
    return null;
  }
}

/** Parede (ano, mês, dia, hora, minuto, segundo) do instante `ms` no fuso, lida como se fosse UTC. */
function wallAsUtc(fmt: Intl.DateTimeFormat, ms: number): number {
  const parts = fmt.formatToParts(new Date(ms));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
}

/** Deslocamento do fuso (ms, positivo a leste de Greenwich) no instante `ms`. */
function offsetAt(fmt: Intl.DateTimeFormat, ms: number): number {
  const whole = Math.floor(ms / 1000) * 1000;
  return wallAsUtc(fmt, whole) - whole;
}

/**
 * Instante em que a parede do fuso marca `year-month-day hour:minute`.
 * Relógio que pula: usa o deslocamento de ANTES da virada (02:30 vira 03:30).
 * Relógio que repete: fica com a primeira ocorrência.
 */
function zonedWallToMs(
  fmt: Intl.DateTimeFormat,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const before = offsetAt(fmt, asUtc - DAY_MS);
  const after = offsetAt(fmt, asUtc + DAY_MS);
  const valid = [before, after]
    .map((offset) => asUtc - offset)
    .filter((t) => wallAsUtc(fmt, t) === asUtc)
    .sort((a, b) => a - b);
  return valid.length > 0 ? valid[0] : asUtc - before;
}

type Today = { fmt: Intl.DateTimeFormat; year: number; month: number; day: number; weekday: number };

/** O dia de hoje no fuso, para o instante `now`. */
function resolveToday(timeZone: string | null | undefined, now: Date): Today | null {
  if (Number.isNaN(now.getTime())) return null;
  const fmt = formatterFor(timeZone || DEFAULT_TIME_ZONE) ?? formatterFor(DEFAULT_TIME_ZONE);
  if (!fmt) return null;
  const wall = new Date(wallAsUtc(fmt, Math.floor(now.getTime() / 1000) * 1000));
  return {
    fmt,
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth() + 1,
    day: wall.getUTCDate(),
    weekday: wall.getUTCDay(),
  };
}

/** `hour:minute` no dia `hoje + offsetDays` (dias de calendário, não blocos de 24 h). */
function atDay(today: Today, offsetDays: number, hm: [number, number]): number {
  const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offsetDays));
  return zonedWallToMs(today.fmt, day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hm[0], hm[1]);
}

/**
 * Próximo disparo futuro (> now) do alarme, em ms epoch, com os dias e a hora
 * lidos no `timeZone`. null se desabilitado, horário ilegível ou sem dias.
 * Fuso desconhecido ou vazio cai em `DEFAULT_TIME_ZONE`.
 */
export function nextFireMs(alarm: ScheduleAlarm, timeZone: string | null | undefined, now: Date): number | null {
  if (!alarm.enabled) return null;
  const hm = parseHM(alarm.time);
  if (!hm) return null;
  const days = firingDays(alarm);
  if (days !== 'every' && days.length === 0) return null;
  const today = resolveToday(timeZone, now);
  if (!today) return null;

  const nowMs = now.getTime();
  const todayAt = atDay(today, 0, hm);
  if (days === 'every') return todayAt > nowMs ? todayAt : atDay(today, 1, hm);

  const times = days.map((jsDay) => {
    let daysUntil = (jsDay - today.weekday + 7) % 7;
    if (daysUntil === 0 && todayAt <= nowMs) daysUntil = 7;
    return daysUntil === 0 ? todayAt : atDay(today, daysUntil, hm);
  });
  return Math.min(...times);
}

/**
 * Disparo mais recente (<= now) do alarme, em ms epoch. É o mesmo instante
 * canônico (HH:MM:00 do dia) que `nextFireMs` devolveu antes do disparo, então o
 * evento idempotente do servidor não duplica.
 */
export function lastFireMs(alarm: ScheduleAlarm, timeZone: string | null | undefined, now: Date): number | null {
  if (!alarm.enabled) return null;
  const hm = parseHM(alarm.time);
  if (!hm) return null;
  const days = firingDays(alarm);
  if (days !== 'every' && days.length === 0) return null;
  const today = resolveToday(timeZone, now);
  if (!today) return null;

  const nowMs = now.getTime();
  const todayAt = atDay(today, 0, hm);
  if (days === 'every') return todayAt <= nowMs ? todayAt : atDay(today, -1, hm);

  const times = days.map((jsDay) => {
    let daysAgo = (today.weekday - jsDay + 7) % 7;
    if (daysAgo === 0 && todayAt > nowMs) daysAgo = 7;
    return daysAgo === 0 ? todayAt : atDay(today, -daysAgo, hm);
  });
  return Math.max(...times);
}
