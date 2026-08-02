/**
 * data-export.ts
 *
 * Monta o payload de exportação de dados do titular (LGPD Art. 18, V —
 * portabilidade). Função pura, sem UI e sem I/O: quem busca os dados é o
 * componente; aqui só se decide o formato.
 *
 * O par export/delete é espelhado: as seções de `ExportServerData` cobrem as
 * mesmas tabelas que `server/db-account.ts` apaga. Tabela nova precisa entrar
 * nos DOIS lugares — senão o app passa a guardar dado que não exporta.
 *
 * As chaves do nível de topo são em português porque o arquivo é lido pelo
 * titular (ou pelo filho adulto), fora do app.
 */

/** O que está no aparelho (recorte do `state` do AppContext). */
export interface ExportLocalData {
  alarmes: unknown[];
  contatosDeEmergencia: unknown[];
  anamnese: unknown;
  metricasDeSaude: unknown[];
  configuracoes: unknown;
  perfil: unknown;
}

/** O que o servidor guarda, conforme devolvido por `userData.export`. */
export interface ExportServerData {
  conta: { nome: string | null; email: string | null; telefone: string | null } | null;
  dadosDaConta: unknown;
  historicoDeAlarmes: unknown[];
  alertasEnviados: unknown[];
  sinalDeVida: unknown;
  cuidadoresVinculados: unknown[];
}

export interface ExportPayload {
  gerado_em: string;
  app_versao: string;
  /** false quando a parte do servidor não pôde ser buscada. */
  servidor_incluido: boolean;
  /** Só presente quando `servidor_incluido` é false. */
  aviso?: string;
  no_aparelho: ExportLocalData;
  no_servidor: ExportServerData | null;
}

export const AVISO_SERVIDOR_INDISPONIVEL =
  'Os dados guardados no servidor NÃO puderam ser incluídos porque não houve ' +
  'conexão no momento em que este arquivo foi gerado. O que está aqui é ' +
  'somente o que estava no seu aparelho. Para receber o arquivo completo, ' +
  'gere novamente com internet ou escreva para privacidade@vigora.com.br.';

export function buildExportPayload(input: {
  local: ExportLocalData;
  server: ExportServerData | null;
  serverUnavailable: boolean;
  appVersion: string;
  now?: number;
}): ExportPayload {
  const { local, server, serverUnavailable, appVersion } = input;
  const now = input.now ?? Date.now();

  return {
    gerado_em: new Date(now).toISOString(),
    app_versao: appVersion,
    servidor_incluido: !serverUnavailable,
    ...(serverUnavailable ? { aviso: AVISO_SERVIDOR_INDISPONIVEL } : {}),
    no_aparelho: local,
    no_servidor: server,
  };
}

/** `vigora-meus-dados-AAAA-MM-DD.json` — data local do aparelho. */
export function exportFileName(now: number = Date.now()): string {
  const d = new Date(now);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `vigora-meus-dados-${yyyy}-${mm}-${dd}.json`;
}
