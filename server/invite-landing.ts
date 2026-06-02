/**
 * invite-landing.ts
 *
 * Server-rendered "instale o app" page shown at https://<host>/convite/<token>
 * when the link is opened WITHOUT the app installed (or on desktop). When the
 * app IS installed, the OS opens it via the verified App Link / Universal Link
 * and this page is never served.
 *
 * No external resources and no inline script — the logo is inline SVG and all
 * styling is inline CSS — so it renders under a tight CSP (the route relaxes the
 * API's `default-src 'none'` only enough for inline styles).
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

/** Brand "crescent moon" mark (matches the in-app login symbol). */
const LOGO_SVG = `
<svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="36" cy="36" r="28" fill="#1E4D8C"/>
  <circle cx="48" cy="28" r="22" fill="#F4EFE5"/>
</svg>`;

export function renderInviteLanding(opts: {
  token: string;
  iosUrl?: string;
  androidUrl: string;
}): string {
  // Only embed the token if it matches the share-token charset (anti-XSS — the
  // value is reflected into an href). Invalid tokens still get the install page.
  const safeToken = /^[A-Za-z0-9_-]{1,32}$/.test(opts.token) ? opts.token : "";
  const appHref = safeToken ? `vigora://convite/${safeToken}` : "";

  const iosButton = opts.iosUrl
    ? `<a class="store" href="${escapeHtml(opts.iosUrl)}">Baixar na App Store</a>`
    : "";
  const androidButton = `<a class="store" href="${escapeHtml(opts.androidUrl)}">Baixar no Google Play</a>`;
  const openButton = appHref
    ? `<a class="open" href="${escapeHtml(appHref)}">Já tenho o app — abrir convite</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Convite — Vigora Saúde</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #F4EFE5; color: #11181C; padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
  }
  .card {
    background: #FFFFFF; border-radius: 20px; padding: 32px 28px; max-width: 420px; width: 100%;
    text-align: center; box-shadow: 0 12px 40px rgba(30,77,140,0.12);
  }
  .logo { margin-bottom: 16px; }
  h1 { font-size: 22px; line-height: 1.3; margin: 0 0 10px; color: #1E4D8C; }
  p { font-size: 16px; line-height: 1.5; color: #687076; margin: 0 0 24px; }
  .store, .open {
    display: block; text-decoration: none; font-weight: 700; font-size: 16px;
    padding: 16px; border-radius: 14px; margin-bottom: 12px;
  }
  .store { background: #1E4D8C; color: #FFFFFF; }
  .open { background: transparent; color: #1E4D8C; border: 1.5px solid #1E4D8C; }
  .foot { font-size: 12px; color: #9BA1A6; line-height: 1.5; margin: 16px 0 0; }
</style>
</head>
<body>
  <main class="card">
    <div class="logo">${LOGO_SVG}</div>
    <h1>Alguém quer acompanhar a sua saúde no Vigora Saúde</h1>
    <p>Instale o aplicativo e abra este convite no seu celular para aceitar. É grátis e leva menos de um minuto.</p>
    ${iosButton}
    ${androidButton}
    ${openButton}
    <p class="foot">
      Vigora Saúde é um app de monitoramento e tranquilidade para a família. Não substitui
      acompanhamento médico. Em emergências, ligue 192 (SAMU).
    </p>
  </main>
</body>
</html>`;
}
