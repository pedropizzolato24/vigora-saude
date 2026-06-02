/**
 * caregiver-format.ts
 *
 * Pure presentational helpers for rendering a monitored person's data on the
 * caregiver screens. No interpretation/scoring of health values (ANVISA) —
 * these only format raw values for display.
 */
import type { Alarm, HealthMetric } from './app-context';

export function metricTypeLabel(type: HealthMetric['type']): string {
  switch (type) {
    case 'heart_rate':
      return 'Frequência cardíaca';
    case 'blood_pressure':
      return 'Pressão arterial';
    case 'glucose':
      return 'Glicemia';
    default:
      return 'Métrica';
  }
}

export function formatMetricValue(m: HealthMetric): string {
  return `${m.value} ${m.unit}`.trim();
}

export function latestMetric(metrics: HealthMetric[]): HealthMetric | null {
  if (!metrics.length) return null;
  return metrics.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * The next enabled alarm by time-of-day relative to `now`. Repeat-day logic is
 * intentionally ignored for this summary — it shows the next upcoming time,
 * wrapping to the earliest alarm if all of today's have passed.
 */
export function nextAlarm(alarms: Alarm[], now: Date = new Date()): Alarm | null {
  const enabled = alarms.filter((a) => a.enabled);
  if (!enabled.length) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const sorted = [...enabled].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  return sorted.find((a) => timeToMinutes(a.time) >= nowMin) ?? sorted[0];
}

/** Coarse "time ago" label in pt-BR. */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

/** True if the timestamp is within the last `minutes` (default 15). */
export function isRecent(ts: number, minutes = 15, now: number = Date.now()): boolean {
  return now - ts <= minutes * 60_000;
}
