/**
 * event-kind.ts
 *
 * Regras puras sobre o tipo e o prazo de um evento de alarme.
 *
 * O check-in virou um alarme (Fase 3): seu evento tem `kind = 'checkin'` e o
 * prazo PRÓPRIO `graceMinutes`. O check-in ANTIGO usava o alarmId fixo
 * 'checkin-daily' e o prazo já embutido em scheduledAt.
 */

export const LEGACY_CHECKIN_ALARM_ID = "checkin-daily";
export const DEFAULT_GRACE_MINUTES = 5;

export function isCheckinEvent(e: { alarmId: string; kind?: string | null }): boolean {
  return e.kind === "checkin" || e.alarmId === LEGACY_CHECKIN_ALARM_ID;
}

export function eventGraceMinutes(
  e: { graceMinutes?: number | null },
  fallback: number = DEFAULT_GRACE_MINUTES
): number {
  return typeof e.graceMinutes === "number" && Number.isFinite(e.graceMinutes) && e.graceMinutes > 0
    ? e.graceMinutes
    : fallback;
}

/** O evento já passou do prazo de resposta (scheduledAt + grace do evento)? */
export function isEventExpired(
  e: { scheduledAt: Date; graceMinutes?: number | null },
  nowMs: number,
  fallback: number = DEFAULT_GRACE_MINUTES
): boolean {
  return nowMs >= e.scheduledAt.getTime() + eventGraceMinutes(e, fallback) * 60_000;
}

/**
 * A agenda da conta já tem um alarme de check-in? Prova positiva de que o
 * check-in migrou para o sistema novo (o evento 'checkin-daily' pendente do
 * sistema antigo não é mais esperado).
 */
export function agendaHasCheckinAlarm(alarms: unknown): boolean {
  return (
    Array.isArray(alarms) &&
    alarms.some((a) => !!a && typeof a === "object" && (a as { kind?: unknown }).kind === "checkin")
  );
}
