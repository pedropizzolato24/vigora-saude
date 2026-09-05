/**
 * parse-lat-lng.ts
 *
 * Saneamento do par "lat,lng" que o cliente envia no heartbeat.
 *
 * Por que existe: esse valor é gravado em `account_liveness.lastLocation` e
 * depois vira a URL de mapa DENTRO da mensagem de WhatsApp que o dead man's
 * switch envia aos contatos de emergência, sob o remetente confiável do Vigora
 * (monitoring-job.ts). Aceitar texto livre permitia injetar link arbitrário
 * nesse corpo — a mesma ameaça que o `.url()` de whatsapp.sendEmergencyAlert
 * já barra no caminho gêmeo (routers.ts).
 *
 * Descartar em vez de rejeitar: a localização é telemetria opcional, mas o
 * heartbeat é o sinal de vida da pessoa. Fazer o zod recusar a chamada inteira
 * por causa de uma coordenada estranha derrubaria o heartbeat junto — o exato
 * modo de falha que desarma o switch. Então o handler segue, sem a localização.
 */

/** Sem casas decimais o suficiente para localizar uma pessoa; 10 é folga. */
const COORD = /^-?\d{1,3}(?:\.\d{1,10})?$/;

/**
 * Devolve "lat,lng" canônico (só dígitos, ponto, vírgula e sinal) quando a
 * entrada é um par de coordenadas válido, ou null caso contrário.
 */
export function parseLatLng(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const partes = raw.split(",");
  if (partes.length !== 2) return null;

  const [latRaw, lngRaw] = partes.map((p) => p.trim());
  if (!COORD.test(latRaw) || !COORD.test(lngRaw)) return null;

  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return `${lat},${lng}`;
}
