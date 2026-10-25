// Cloudflare Worker "vigora-site": serve vigorasaude.com sem um 3º domínio no Railway
// (o plano só permite dois: app. e api.). Repassa as rotas do site para o mesmo
// serviço via app.vigorasaude.com; o endereço na barra continua vigorasaude.com.
//
// Deploy: Cloudflare › Workers & Pages › Create › Worker › colar este arquivo ›
// Deploy › Settings › Domains & Routes › Add › Custom Domain: vigorasaude.com e
// www.vigorasaude.com. No Railway, SITE_URL=https://vigorasaude.com (já é o padrão).
//
// O servidor vê o IP do Worker; para o rate limit da lista ser por visitante, o Worker
// repassa o IP real (x-vigora-client-ip) e prova a origem com o segredo
// SITE_PROXY_SECRET (Worker › Settings › Variables, tipo Secret; o mesmo valor no Railway).

const ORIGEM = "https://app.vigorasaude.com";
const RAIZ = "https://vigorasaude.com";

// Só o site passa; a API e o resto continuam só em api./app.
const GET_PERMITIDOS = /^\/(|privacidade|termos|obrigado|lista\/sair|assets\/.+|fonts\/.+)$/;
const POST_PERMITIDOS = /^\/lista(\/sair)?$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === "www.vigorasaude.com") {
      return Response.redirect(RAIZ + url.pathname + url.search, 301);
    }

    const leitura = request.method === "GET" || request.method === "HEAD";
    const permitido = leitura
      ? GET_PERMITIDOS.test(url.pathname)
      : request.method === "POST" && POST_PERMITIDOS.test(url.pathname);
    if (!permitido) return new Response("Página não encontrada", { status: 404 });

    // redirect: "manual" — o 303 do formulário (→ /obrigado) precisa chegar ao navegador.
    const origem = new Request(ORIGEM + url.pathname + url.search, request);
    // set() sobrescreve qualquer valor que o visitante tenha mandado nesses headers.
    origem.headers.set("x-vigora-client-ip", request.headers.get("CF-Connecting-IP") ?? "");
    origem.headers.set("x-vigora-proxy-secret", env.SITE_PROXY_SECRET ?? "");
    return fetch(origem, { redirect: "manual" });
  },
};
