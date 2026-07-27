/**
 * perf.ts
 *
 * Instrumentação de diagnóstico (feedback 27/07, item 2): splash longo no
 * monitorado e 10–20s intermitentes para os dados do cuidador.
 *
 * Só console.log — sem payloads, sem dados de saúde (LGPD). Barato o
 * suficiente para ficar ligado; colete com `adb logcat | grep "\[Perf\]"`.
 * Remover quando o diagnóstico fechar.
 */

// Âncora: avaliação deste módulo. index.ts importa perf logo no boot, então
// isto marca (aproximadamente) o início da execução do bundle JS.
const jsStart = Date.now();

/** Marca um ponto no tempo, relativo ao início do bundle JS. */
export function perfMark(label: string): void {
  console.log(`[Perf] +${Date.now() - jsStart}ms ${label}`);
}

/** Mede uma operação: `const end = perfSpan('x'); ...; end();` */
export function perfSpan(label: string): () => void {
  const t0 = Date.now();
  return () => console.log(`[Perf] ${label}: ${Date.now() - t0}ms`);
}
