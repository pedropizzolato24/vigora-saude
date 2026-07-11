/**
 * pick-pending-event.ts
 *
 * Função pura (sem dependência de DB) que escolhe, entre os eventos pendentes
 * de um mesmo alarme, qual deve ser resolvido por uma confirmação.
 *
 * Critério: o evento cujo scheduledAt está MAIS PRÓXIMO do horário de
 * referência. Todos os chamadores de confirmEvent enviam "now" como referência:
 *   - Check-in: o prazo de HOJE está sempre mais perto de agora do que o de
 *     amanhã, então a confirmação resolve o evento de hoje (nunca o de amanhã —
 *     era esse o bug, com a query antiga sem ORDER BY pegando um pendente
 *     arbitrário).
 *   - Alarme comum: o disparo recém-criado (mais perto de agora) é o resolvido.
 *
 * Em empate, mantém o primeiro encontrado (ordem de inserção/PK).
 *
 * `maxWindowMs` limita o quão longe da referência o melhor candidato pode
 * estar. Sem esse limite, uma confirmação atrasada do disparo de HOJE podia
 * "consumir" o evento pré-registrado de AMANHÃ (~24h de distância) quando o de
 * hoje já tinha sido resolvido — marcando amanhã como respondido e deixando o
 * disparo real de amanhã sem cobertura. Default Infinity mantém o comportamento
 * dos chamadores que não passam janela.
 */
export function pickPendingEvent<T extends { scheduledAt: Date }>(
  pending: T[],
  reference: Date,
  maxWindowMs: number = Infinity
): T | null {
  const target = reference.getTime();
  let best: T | null = null;
  let bestDiff = Infinity;
  for (const ev of pending) {
    const diff = Math.abs(ev.scheduledAt.getTime() - target);
    if (diff < bestDiff) {
      best = ev;
      bestDiff = diff;
    }
  }
  if (best && bestDiff > maxWindowMs) return null;
  return best;
}
