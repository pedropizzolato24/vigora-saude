// O redirect do OAuth Google volta como deep link (`vigora://oauthredirect?code=...`).
// O Expo Router não reconhece esse path e mostraria "Unmatched Route"; aqui o
// roteamos explicitamente para a tela de callback (app/oauthredirect.tsx),
// preservando a query (code/state). Demais deep links seguem inalterados.
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    if (path.includes("oauthredirect")) {
      const queryIndex = path.indexOf("?");
      const query = queryIndex >= 0 ? path.slice(queryIndex) : "";
      return `/oauthredirect${query}`;
    }
  } catch {
    // Em caso de erro de parsing, não quebra o deep linking padrão.
  }
  return path;
}
