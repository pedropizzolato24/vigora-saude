/**
 * checkin-dedup.ts
 *
 * Dedup de respostas de notificação do check-in. Sem dependências nativas —
 * testável em vitest. Usado por checkin-notification-handler.ts.
 *
 * Dois mecanismos, porque os dois tipos de notificação são diferentes:
 *   - TIMEOUT: one-shot (DATE), identifier NOVO a cada dia → Set permanente
 *     (uma vez processado, nunca mais, mesmo se tocado horas depois).
 *   - PROMPT: trigger DAILY, MESMO identifier todo dia → um Set permanente
 *     bloquearia o check-in de amanhã. O duplo de cold-start ocorre em instantes,
 *     então deduplicamos só dentro de uma janela curta de tempo.
 */

const handledTimeoutIds = new Set<string>();

/** true na 1ª vez que vê o identifier; false depois (permanente). Sem id: sempre true. */
export function claimTimeout(identifier: string | undefined): boolean {
  if (!identifier) return true;
  if (handledTimeoutIds.has(identifier)) return false;
  handledTimeoutIds.add(identifier);
  // Limita o crescimento do set — mantém só os mais recentes.
  if (handledTimeoutIds.size > 50) {
    const oldest = handledTimeoutIds.values().next().value;
    if (oldest !== undefined) handledTimeoutIds.delete(oldest);
  }
  return true;
}

export const PROMPT_DEDUP_WINDOW_MS = 60_000;
const recentPromptIds = new Map<string, number>();

/**
 * true se o identifier não foi visto na última janela; false dentro dela.
 * Sem id (ex.: popup in-app): sempre true. Identifiers iguais a mais de
 * PROMPT_DEDUP_WINDOW_MS de distância (o disparo de amanhã) são processados.
 */
export function claimPrompt(identifier: string | undefined): boolean {
  if (!identifier) return true;
  const now = Date.now();
  const last = recentPromptIds.get(identifier);
  if (last !== undefined && now - last < PROMPT_DEDUP_WINDOW_MS) return false;
  recentPromptIds.set(identifier, now);
  if (recentPromptIds.size > 50) {
    for (const [id, ts] of recentPromptIds) {
      if (now - ts >= PROMPT_DEDUP_WINDOW_MS) recentPromptIds.delete(id);
    }
  }
  return true;
}
