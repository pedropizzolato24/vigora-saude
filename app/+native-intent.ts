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
    // O tap (e o full-screen) da notificação nativa do alarme abrem
    // `vigora://alarm-ring?uid=<uid>`. Roteamos direto para a tela do alarme com
    // o alarmId extraído — sem depender do getAlarmState no cold start (Android
    // antigo dava tela preta → home). uid: vigora_<id> | _wd<n> | _snooze.
    // Os botões "Soneca" e "Dispensar" usam o mesmo deep link com &snooze=1 /
    // &dismiss=1 — repassados para a tela executar a ação e confirmá-la no
    // servidor (as actions nativas resolviam só em Java, sem confirmar nada).
    if (path.includes("alarm-ring")) {
      const queryIndex = path.indexOf("?");
      const query = queryIndex >= 0 ? path.slice(queryIndex + 1) : "";
      const uidMatch = query.match(/(?:^|&)uid=([^&]+)/);
      if (uidMatch) {
        const uid = decodeURIComponent(uidMatch[1]);
        const m = uid.match(/^vigora_(.+?)(?:_wd\d+|_snooze)?$/);
        const alarmId = m ? m[1] : uid;
        const snooze = /(?:^|&)snooze=1(?:&|$)/.test(query) ? '&snooze=1' : '';
        const dismiss = /(?:^|&)dismiss=1(?:&|$)/.test(query) ? '&dismiss=1' : '';
        return `/alarm-ring?alarmId=${encodeURIComponent(alarmId)}${snooze}${dismiss}`;
      }
    }
  } catch {
    // Em caso de erro de parsing, não quebra o deep linking padrão.
  }
  return path;
}
