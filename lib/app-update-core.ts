/**
 * lib/app-update-core.ts
 *
 * Lógica pura da verificação de atualização nas lojas (sem React/Expo) —
 * testável em Node. O fetch e a decisão de exibir o aviso vivem em
 * lib/app-update-check.ts e components/update-banner.tsx.
 */

/**
 * Compara versões "x.y.z" numericamente por segmento (segmento ausente = 0).
 * Retorna >0 se a > b, <0 se a < b, 0 se iguais. Segmentos não numéricos
 * contam como 0 (defensivo contra formatos inesperados das lojas).
 */
export function compareVersions(a: string, b: string): number {
  const segsA = a.split('.');
  const segsB = b.split('.');
  const length = Math.max(segsA.length, segsB.length);
  for (let i = 0; i < length; i++) {
    const numA = parseInt(segsA[i] ?? '0', 10) || 0;
    const numB = parseInt(segsB[i] ?? '0', 10) || 0;
    if (numA !== numB) return numA - numB;
  }
  return 0;
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}

export interface StoreVersionInfo {
  version: string;
  storeUrl: string | null;
}

/**
 * Resposta do iTunes Lookup (https://itunes.apple.com/lookup?bundleId=...).
 * `resultCount: 0` = app não publicado/não encontrado → null (sem aviso).
 */
export function parseItunesLookup(json: unknown): StoreVersionInfo | null {
  const data = json as { results?: { version?: unknown; trackViewUrl?: unknown }[] } | null;
  const first = data?.results?.[0];
  if (!first || typeof first.version !== 'string' || first.version.length === 0) return null;
  return {
    version: first.version,
    storeUrl: typeof first.trackViewUrl === 'string' ? first.trackViewUrl : null,
  };
}

/**
 * Extrai a versão atual do HTML da página do app na Play Store.
 * A Play Store não tem API pública; a versão aparece no blob de dados da
 * página no padrão [[["1.2.3"]] . Se o layout mudar, retorna null e o aviso
 * simplesmente não aparece (falha silenciosa proposital).
 */
export function extractPlayStoreVersion(html: string): string | null {
  const match = html.match(/\[\[\["(\d+(?:\.\d+)+)"\]\]/);
  return match ? match[1] : null;
}
