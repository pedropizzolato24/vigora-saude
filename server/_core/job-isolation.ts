/**
 * job-isolation.ts
 *
 * Apoio das rotinas do monitoring-job que percorrem várias contas (Fase 4).
 *
 * Duas regras valem para todas:
 *  - um item com dado ruim não pode travar os outros (a lição de 24/07/2026:
 *    um try único derrubou o job inteiro e o switch ficou 27 h desarmado);
 *  - o log leva só nome e código do erro. A mensagem de um erro do drizzle traz
 *    os parâmetros da query (openId, nome do lembrete) e o `lastError` do job
 *    aparece em /api/health: nome de remédio não pode vazar por aí.
 */

/** Só campos seguros de um erro. */
export function describeError(err: unknown): string {
  const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
  return `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim();
}

/**
 * Roda `fn` em cada item, isolando falhas. Devolve quantos itens falharam; quem
 * chama decide se isso reprova o ciclo (`throw`), sem a mensagem do erro.
 */
export async function runEach<T>(
  items: readonly T[],
  label: string,
  fn: (item: T) => Promise<void>
): Promise<number> {
  let failed = 0;
  for (const item of items) {
    try {
      await fn(item);
    } catch (err) {
      failed++;
      console.error(`[Monitor] ${label} falhou: ${describeError(err)}`);
    }
  }
  return failed;
}

/**
 * Roda os passos em ordem, cada um isolado. Se algum falhou, rejeita no fim com
 * os NOMES dos passos (nunca a mensagem dos erros): quem chama é o monitoring-job,
 * que guarda o texto em `lastError`, visível em /api/health.
 */
export async function runSteps(
  label: string,
  steps: ReadonlyArray<readonly [string, () => Promise<void>]>
): Promise<void> {
  const failed: string[] = [];
  for (const [name, fn] of steps) {
    try {
      await fn();
    } catch (err) {
      failed.push(name);
      console.error(`[Monitor] ${label} (${name}) falhou: ${describeError(err)}`);
    }
  }
  if (failed.length > 0) throw new Error(`${label}: falhou em ${failed.join(", ")}`);
}
