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
/**
 * Folga do servidor sobre a contagem do cliente no check-in: a contagem do app
 * (escalateSeconds) é igual ao grace, então sem folga o job podia marcar 'missed'
 * e escalar antes de o "Estou bem" (ou o missed do próprio app) chegar.
 */
export const CHECKIN_SERVER_BUFFER_MINUTES = 2;

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

/**
 * O evento já passou do prazo de resposta? Remédio: scheduledAt + grace.
 * Check-in novo (kind 'checkin'): + CHECKIN_SERVER_BUFFER_MINUTES. O legado
 * 'checkin-daily' (kind nulo) não ganha folga: seu prazo já está em scheduledAt.
 */
export function isEventExpired(
  e: { scheduledAt: Date; graceMinutes?: number | null; kind?: string | null },
  nowMs: number,
  fallback: number = DEFAULT_GRACE_MINUTES
): boolean {
  const buffer = e.kind === "checkin" ? CHECKIN_SERVER_BUFFER_MINUTES : 0;
  return nowMs >= e.scheduledAt.getTime() + (eventGraceMinutes(e, fallback) + buffer) * 60_000;
}

/**
 * Âncora da idade do evento sem resposta na escada genérica (Passo 2 do job).
 * Check-in (kind 'checkin') só vira 'missed' no prazo de resposta, então a
 * idade conta daí (senão o aviso genérico sai junto com a escalação do próprio
 * check-in). Remédio e o 'checkin-daily' legado (kind nulo, prazo já embutido
 * em scheduledAt) seguem ancorados em scheduledAt.
 */
export function warningAnchor(e: {
  scheduledAt: Date;
  graceMinutes?: number | null;
  kind?: string | null;
}): Date {
  if (e.kind !== "checkin") return e.scheduledAt;
  return new Date(
    e.scheduledAt.getTime() + (eventGraceMinutes(e) + CHECKIN_SERVER_BUFFER_MINUTES) * 60_000
  );
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
