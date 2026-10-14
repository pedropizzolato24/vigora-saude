/**
 * resync-throttle.ts
 *
 * Intervalo mínimo entre dois re-registros dos disparos de alarme no servidor.
 * Voltar ao app dispara um por transição de AppState; o limitador evita uma
 * rajada de chamadas (até 24 por vez) quando o idoso alterna entre apps.
 */
export const RESYNC_MIN_GAP_MS = 60_000;

export function shouldResync(
  lastSyncMs: number | null,
  nowMs: number,
  minGapMs: number = RESYNC_MIN_GAP_MS
): boolean {
  if (lastSyncMs === null) return true;
  // Relógio do aparelho voltou para trás: sem isto o limitador bloquearia até
  // o relógio alcançar o valor antigo.
  if (nowMs < lastSyncMs) return true;
  return nowMs - lastSyncMs >= minGapMs;
}
