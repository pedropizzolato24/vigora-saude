/**
 * alarm-schedule.test.ts
 *
 * Regra única de dias e horários (shared/alarm-schedule.ts), ciente de fuso.
 * O app usa o fuso do aparelho; o servidor, o fuso guardado da conta. Aqui:
 *  - o cálculo em fusos diferentes (Brasil, Acre, Nova York com horário de verão);
 *  - dias personalizados atravessando a virada de dia (o instante é sábado em
 *    São Paulo e domingo em UTC — o servidor roda em UTC);
 *  - paridade exata com o comportamento antigo do aparelho (Date local), nos
 *    fusos do mundo, incluindo as viradas do horário de verão.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_TIME_ZONE,
  firingDays,
  lastFireMs,
  nextFireMs,
  type ScheduleAlarm,
} from '../shared/alarm-schedule';
import {
  MANAGED_ALARMS_MAX,
  MANAGED_DESCRIPTION_MAX,
  MANAGEMENT_REQUEST_TTL_DAYS,
  NO_SIGNAL_PAUSE_HOURS,
  PENDING_HINT_HOURS,
  SAME_FIRING_WINDOW_MINUTES,
  VISIBLE_NOTICE_DELAY_MINUTES,
} from '../shared/managed-alarm';

const mk = (over: Partial<ScheduleAlarm> = {}): ScheduleAlarm => ({
  time: '08:00',
  enabled: true,
  repeat: 'daily',
  customDays: [],
  ...over,
});

const z = (iso: string) => new Date(iso);
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

describe('constantes compartilhadas', () => {
  it('têm os valores combinados com o servidor e o app', () => {
    expect(MANAGED_ALARMS_MAX).toBe(24);
    expect(MANAGED_DESCRIPTION_MAX).toBe(80);
    expect(MANAGEMENT_REQUEST_TTL_DAYS).toBe(7);
    expect(VISIBLE_NOTICE_DELAY_MINUTES).toBe(10);
    expect(PENDING_HINT_HOURS).toBe(12);
    expect(NO_SIGNAL_PAUSE_HOURS).toBe(48);
    expect(SAME_FIRING_WINDOW_MINUTES).toBe(120);
    expect(DEFAULT_TIME_ZONE).toBe('America/Sao_Paulo');
  });
});

describe('firingDays — a convenção de dias (0 = domingo) numa fonte só', () => {
  it('daily e repetição desconhecida são diários', () => {
    expect(firingDays(mk({ repeat: 'daily' }))).toBe('every');
    expect(firingDays(mk({ repeat: 'qualquer' as never }))).toBe('every');
  });

  it('weekdays = segunda a sexta; weekends = domingo e sábado', () => {
    expect(firingDays(mk({ repeat: 'weekdays' }))).toEqual([1, 2, 3, 4, 5]);
    expect(firingDays(mk({ repeat: 'weekends' }))).toEqual([0, 6]);
  });

  it('custom usa os dias como estão e descarta o que está fora de 0..6', () => {
    expect(firingDays(mk({ repeat: 'custom', customDays: [0, 3, 6] }))).toEqual([0, 3, 6]);
    expect(firingDays(mk({ repeat: 'custom', customDays: [-1, 7, 2.5, 4] }))).toEqual([4]);
    expect(firingDays(mk({ repeat: 'custom' }))).toEqual([]);
  });
});

describe('entradas sem disparo', () => {
  it('desabilitado, horário ilegível ou fora do relógio: null', () => {
    const now = z('2026-06-24T13:00:00Z');
    for (const over of [{ enabled: false }, { time: 'xx:yy' }, { time: '8' }, { time: '25:00' }, { time: '08:60' }, { time: '' }]) {
      expect(nextFireMs(mk(over), DEFAULT_TIME_ZONE, now), JSON.stringify(over)).toBeNull();
      expect(lastFireMs(mk(over), DEFAULT_TIME_ZONE, now), JSON.stringify(over)).toBeNull();
    }
  });

  it('custom sem dias válidos: null', () => {
    const now = z('2026-06-24T13:00:00Z');
    expect(nextFireMs(mk({ repeat: 'custom', customDays: [] }), DEFAULT_TIME_ZONE, now)).toBeNull();
    expect(lastFireMs(mk({ repeat: 'custom', customDays: [9] }), DEFAULT_TIME_ZONE, now)).toBeNull();
  });

  it('data inválida: null, sem lançar', () => {
    expect(nextFireMs(mk(), DEFAULT_TIME_ZONE, new Date(NaN))).toBeNull();
  });

  it('fuso desconhecido, vazio ou nulo cai em America/Sao_Paulo', () => {
    const now = z('2026-06-24T13:00:00Z');
    const esperado = nextFireMs(mk(), DEFAULT_TIME_ZONE, now);
    expect(nextFireMs(mk(), 'Marte/Olympus', now)).toBe(esperado);
    expect(nextFireMs(mk(), '', now)).toBe(esperado);
    expect(nextFireMs(mk(), null, now)).toBe(esperado);
    expect(lastFireMs(mk(), undefined, now)).toBe(lastFireMs(mk(), DEFAULT_TIME_ZONE, now));
  });
});

describe('America/Sao_Paulo (UTC-3, sem horário de verão)', () => {
  const tz = 'America/Sao_Paulo';
  const now = z('2026-06-24T13:00:00Z'); // 10:00 em São Paulo

  it('diário com a hora já passada hoje: próximo = amanhã, último = hoje', () => {
    expect(iso(nextFireMs(mk({ time: '08:00' }), tz, now))).toBe('2026-06-25T11:00:00.000Z');
    expect(iso(lastFireMs(mk({ time: '08:00' }), tz, now))).toBe('2026-06-24T11:00:00.000Z');
  });

  it('diário com a hora ainda por vir hoje: próximo = hoje, último = ontem', () => {
    expect(iso(nextFireMs(mk({ time: '20:00' }), tz, now))).toBe('2026-06-24T23:00:00.000Z');
    expect(iso(lastFireMs(mk({ time: '20:00' }), tz, now))).toBe('2026-06-23T23:00:00.000Z');
  });

  it('exatamente na hora do alarme: próximo é o de amanhã, último é este', () => {
    const naHora = z('2026-06-24T11:00:00Z'); // 08:00:00 em São Paulo
    expect(iso(nextFireMs(mk({ time: '08:00' }), tz, naHora))).toBe('2026-06-25T11:00:00.000Z');
    expect(iso(lastFireMs(mk({ time: '08:00' }), tz, naHora))).toBe('2026-06-24T11:00:00.000Z');
  });

  it('o "próximo" pré-registrado é o mesmo instante do "último" no disparo', () => {
    const antes = z('2026-06-24T10:59:00Z'); // 07:59
    const depois = z('2026-06-24T11:00:30Z'); // 08:00:30
    expect(nextFireMs(mk(), tz, antes)).toBe(lastFireMs(mk(), tz, depois));
  });

  it('weekdays na sexta à noite pula para a segunda', () => {
    const sexta22h = z('2026-06-27T01:00:00Z'); // sexta 26/06, 22:00 em São Paulo
    expect(iso(nextFireMs(mk({ repeat: 'weekdays' }), tz, sexta22h))).toBe('2026-06-29T11:00:00.000Z'); // segunda 08:00
    expect(iso(lastFireMs(mk({ repeat: 'weekdays' }), tz, sexta22h))).toBe('2026-06-26T11:00:00.000Z'); // sexta 08:00
  });
});

describe('America/Rio_Branco (UTC-5, sem horário de verão)', () => {
  const tz = 'America/Rio_Branco';

  it('08:00 do Acre é 13:00 UTC e 2 h depois do mesmo alarme em São Paulo', () => {
    const now = z('2026-06-24T10:00:00Z'); // 05:00 no Acre, 07:00 em São Paulo
    expect(iso(nextFireMs(mk(), tz, now))).toBe('2026-06-24T13:00:00.000Z');
    expect(iso(nextFireMs(mk(), 'America/Sao_Paulo', now))).toBe('2026-06-24T11:00:00.000Z');
  });

  it('uma hora depois do alarme no Acre ainda é "ontem" para o último', () => {
    const now = z('2026-06-24T12:30:00Z'); // 07:30 no Acre
    expect(iso(lastFireMs(mk(), tz, now))).toBe('2026-06-23T13:00:00.000Z');
    expect(iso(lastFireMs(mk(), 'America/Sao_Paulo', now))).toBe('2026-06-24T11:00:00.000Z');
  });
});

describe('America/New_York atravessando o horário de verão', () => {
  const tz = 'America/New_York';

  it('primavera (08/03/2026): 08:00 é 13:00Z antes da virada e 12:00Z depois, e o dia tem 23 h', () => {
    const sabado15h = z('2026-03-07T20:00:00Z'); // 15:00 EST
    expect(iso(nextFireMs(mk(), tz, sabado15h))).toBe('2026-03-08T12:00:00.000Z'); // 08:00 EDT
    expect(iso(lastFireMs(mk(), tz, sabado15h))).toBe('2026-03-07T13:00:00.000Z'); // 08:00 EST
    const domingo14h = z('2026-03-08T18:00:00Z'); // 14:00 EDT
    expect(iso(lastFireMs(mk(), tz, domingo14h))).toBe('2026-03-08T12:00:00.000Z');
    expect(iso(nextFireMs(mk(), tz, domingo14h))).toBe('2026-03-09T12:00:00.000Z');
  });

  it('outono (01/11/2026): 08:00 é 12:00Z antes da virada e 13:00Z depois, e o dia tem 25 h', () => {
    const sabado15h = z('2026-10-31T19:00:00Z'); // 15:00 EDT
    expect(iso(nextFireMs(mk(), tz, sabado15h))).toBe('2026-11-01T13:00:00.000Z'); // 08:00 EST
    expect(iso(lastFireMs(mk(), tz, sabado15h))).toBe('2026-10-31T12:00:00.000Z'); // 08:00 EDT
  });

  it('hora que não existe (02:30 na virada da primavera) dispara adiantada, às 03:30', () => {
    const meiaNoite = z('2026-03-08T05:00:00Z'); // 00:00 EST
    expect(iso(nextFireMs(mk({ time: '02:30' }), tz, meiaNoite))).toBe('2026-03-08T07:30:00.000Z'); // 03:30 EDT
    // No dia seguinte volta a ser 02:30 de verdade (06:30Z).
    const depois = z('2026-03-08T08:00:00Z'); // 04:00 EDT
    expect(iso(nextFireMs(mk({ time: '02:30' }), tz, depois))).toBe('2026-03-09T06:30:00.000Z');
  });

  it('hora que existe duas vezes (01:30 na virada do outono) dispara na primeira', () => {
    const antes = z('2026-11-01T04:00:00Z'); // 00:00 EDT
    expect(iso(nextFireMs(mk({ time: '01:30' }), tz, antes))).toBe('2026-11-01T05:30:00.000Z'); // 1ª vez: 01:30 EDT
    const depoisDoPrimeiro = z('2026-11-01T05:31:00Z');
    expect(iso(nextFireMs(mk({ time: '01:30' }), tz, depoisDoPrimeiro))).toBe('2026-11-02T06:30:00.000Z'); // 01:30 EST de amanhã
    expect(iso(lastFireMs(mk({ time: '01:30' }), tz, z('2026-11-01T07:00:00Z')))).toBe('2026-11-01T05:30:00.000Z');
  });

  it('weekdays atravessa a virada sem perder um dia', () => {
    const sexta = z('2026-03-06T20:00:00Z'); // sexta 15:00 EST
    // sábado e domingo não contam: segunda 09/03 08:00 EDT = 12:00Z
    expect(iso(nextFireMs(mk({ repeat: 'weekdays' }), tz, sexta))).toBe('2026-03-09T12:00:00.000Z');
  });
});

describe('dias personalizados atravessando a virada de dia', () => {
  it('o mesmo instante é sábado em São Paulo e domingo em UTC: vale o dia do fuso da conta', () => {
    const agora = z('2026-06-28T01:00:00Z'); // sáb 27/06 22:00 em São Paulo; dom 28/06 01:00 em UTC
    const domingo2330 = mk({ time: '23:30', repeat: 'custom', customDays: [0] });
    const sabado2330 = mk({ time: '23:30', repeat: 'custom', customDays: [6] });

    // Domingo 28/06 23:30 em São Paulo = 29/06 02:30Z. Se o servidor usasse o dia UTC,
    // acharia que "domingo" é agora e cobraria o alarme do domingo errado.
    expect(iso(nextFireMs(domingo2330, 'America/Sao_Paulo', agora))).toBe('2026-06-29T02:30:00.000Z');
    // Sábado 27/06 23:30 em São Paulo = 28/06 02:30Z, daqui a 1h30.
    expect(iso(nextFireMs(sabado2330, 'America/Sao_Paulo', agora))).toBe('2026-06-28T02:30:00.000Z');
    // Em UTC o mesmo instante já é domingo: o alarme de domingo 23:30 UTC é hoje.
    expect(iso(nextFireMs(domingo2330, 'UTC', agora))).toBe('2026-06-28T23:30:00.000Z');
  });

  it('o último disparo atravessa a meia-noite: segunda 00:30 em São Paulo, o último de domingo 23:30 foi há 1 h', () => {
    const agora = z('2026-06-29T03:30:00Z'); // seg 29/06 00:30 em São Paulo
    const domingo2330 = mk({ time: '23:30', repeat: 'custom', customDays: [0] });
    expect(iso(lastFireMs(domingo2330, 'America/Sao_Paulo', agora))).toBe('2026-06-29T02:30:00.000Z');
    // Em Tóquio (UTC+9) o mesmo instante já é segunda 12:30; o último domingo 23:30 foi ontem 14:30Z.
    expect(iso(lastFireMs(domingo2330, 'Asia/Tokyo', agora))).toBe('2026-06-28T14:30:00.000Z');
  });

  it('a leste de Greenwich o dia vira antes: domingo 08:00 em Tóquio já é hoje no sábado à noite em São Paulo', () => {
    const agora = z('2026-06-27T20:00:00Z'); // dom 28/06 05:00 em Tóquio; sáb 27/06 17:00 em São Paulo
    const domingo0800 = mk({ time: '08:00', repeat: 'custom', customDays: [0] });
    expect(iso(nextFireMs(domingo0800, 'Asia/Tokyo', agora))).toBe('2026-06-27T23:00:00.000Z');
    expect(iso(nextFireMs(domingo0800, 'America/Sao_Paulo', agora))).toBe('2026-06-28T11:00:00.000Z');
  });

  it('vários dias: escolhe o mais próximo, em qualquer fuso', () => {
    const quartaSabado = mk({ time: '09:00', repeat: 'custom', customDays: [6, 3] });
    // quinta 25/06 10:00 em São Paulo -> próximo sábado 27/06 09:00 = 12:00Z; último quarta 24/06 09:00 = 12:00Z
    const quinta = z('2026-06-25T13:00:00Z');
    expect(iso(nextFireMs(quartaSabado, 'America/Sao_Paulo', quinta))).toBe('2026-06-27T12:00:00.000Z');
    expect(iso(lastFireMs(quartaSabado, 'America/Sao_Paulo', quinta))).toBe('2026-06-24T12:00:00.000Z');
  });
});

/**
 * Paridade com o comportamento ANTIGO do aparelho (cálculo com Date local), que
 * o app continua usando via lib/alarm-fire-times.ts. A cópia abaixo é o código
 * antigo, só como oráculo. Roda em vários fusos trocando o TZ do processo.
 *
 * Fora desta comparação ficam os horários dentro de um pulo ou repetição do
 * relógio (02:30 na primavera de Nova York): o código antigo errava o dia
 * seguinte (levava o 03:30 do pulo adiante), e a regra nova acerta — isso está
 * coberto nos testes de Nova York acima.
 */
describe('paridade com o cálculo antigo (Date local do aparelho)', () => {
  function legacyHM(time: string): [number, number] | null {
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return [h, m];
  }
  function legacyDays(a: ScheduleAlarm): number[] | 'every' {
    switch (a.repeat) {
      case 'weekdays': return [1, 2, 3, 4, 5];
      case 'weekends': return [0, 6];
      case 'custom': return (a.customDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      default: return 'every';
    }
  }
  function legacyNext(a: ScheduleAlarm, now: Date): number | null {
    if (!a.enabled) return null;
    const hm = legacyHM(a.time);
    if (!hm) return null;
    const days = legacyDays(a);
    if (days === 'every') {
      const d = new Date(now);
      d.setHours(hm[0], hm[1], 0, 0);
      if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    if (days.length === 0) return null;
    const todayJs = now.getDay();
    return Math.min(
      ...days.map((jsDay) => {
        const d = new Date(now);
        d.setHours(hm[0], hm[1], 0, 0);
        let daysUntil = (jsDay - todayJs + 7) % 7;
        if (daysUntil === 0 && d.getTime() <= now.getTime()) daysUntil = 7;
        d.setDate(d.getDate() + daysUntil);
        return d.getTime();
      })
    );
  }
  function legacyLast(a: ScheduleAlarm, now: Date): number | null {
    if (!a.enabled) return null;
    const hm = legacyHM(a.time);
    if (!hm) return null;
    const days = legacyDays(a);
    if (days === 'every') {
      const d = new Date(now);
      d.setHours(hm[0], hm[1], 0, 0);
      if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 1);
      return d.getTime();
    }
    if (days.length === 0) return null;
    const todayJs = now.getDay();
    return Math.max(
      ...days.map((jsDay) => {
        const d = new Date(now);
        d.setHours(hm[0], hm[1], 0, 0);
        let daysAgo = (todayJs - jsDay + 7) % 7;
        if (daysAgo === 0 && d.getTime() > now.getTime()) daysAgo = 7;
        d.setDate(d.getDate() - daysAgo);
        return d.getTime();
      })
    );
  }

  // Horas fora de qualquer pulo/repetição de relógio dos fusos abaixo.
  const alarms: ScheduleAlarm[] = [
    mk({ time: '08:00' }),
    mk({ time: '23:30' }),
    mk({ time: '12:00', repeat: 'weekdays' }),
    mk({ time: '15:45', repeat: 'weekends' }),
    mk({ time: '09:15', repeat: 'custom', customDays: [0, 3] }),
    mk({ time: '20:00', repeat: 'custom', customDays: [6] }),
  ];

  const ORIGINAL_TZ = process.env.TZ;
  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  /** Instantes onde o deslocamento local muda (virada do horário de verão), no ano. */
  function transitionsOf(year: number): number[] {
    const out: number[] = [];
    const step = 30 * 60_000;
    let prev = new Date(Date.UTC(year, 0, 1)).getTimezoneOffset();
    for (let t = Date.UTC(year, 0, 1) + step; t < Date.UTC(year + 1, 0, 1); t += step) {
      const off = new Date(t).getTimezoneOffset();
      if (off !== prev) out.push(t);
      prev = off;
    }
    return out;
  }

  const zones = [
    'America/Sao_Paulo',
    'America/Rio_Branco',
    'America/New_York',
    'Europe/London',
    'Asia/Calcutta',
    'Australia/Lord_Howe',
    'Pacific/Auckland',
  ];

  it.each(zones)('%s: mesmos resultados do Date local em 2026, inclusive nas viradas', (zone) => {
    process.env.TZ = zone;
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone, 'o TZ do processo não foi aplicado').toBe(zone);

    const instants: number[] = [];
    // Varredura do ano inteiro (passo de 6 h 53 min, que não alinha com nenhum horário).
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 413 * 60_000) instants.push(t);
    // Varredura fina em volta de cada virada do horário de verão.
    for (const tr of transitionsOf(2026)) {
      for (let t = tr - 30 * 3_600_000; t <= tr + 30 * 3_600_000; t += 17 * 60_000) instants.push(t);
    }

    const diffs: string[] = [];
    for (const t of instants) {
      const now = new Date(t);
      for (const a of alarms) {
        const n = nextFireMs(a, zone, now);
        const l = lastFireMs(a, zone, now);
        if (n !== legacyNext(a, now)) diffs.push(`next ${a.time}/${a.repeat} @ ${now.toISOString()}: ${iso(n)} != ${iso(legacyNext(a, now))}`);
        if (l !== legacyLast(a, now)) diffs.push(`last ${a.time}/${a.repeat} @ ${now.toISOString()}: ${iso(l)} != ${iso(legacyLast(a, now))}`);
        if (diffs.length >= 5) break;
      }
      if (diffs.length >= 5) break;
    }
    expect(diffs).toEqual([]);
  }, 60_000);
});
