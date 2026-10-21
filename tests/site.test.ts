/**
 * site.test.ts
 *
 * Casca do site (vigorasaude.com) servida pelo mesmo Express da API:
 * layout, CSP própria, redirecionamento www e slot de depoimentos.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Express, Request, Response } from "express";
import {
  SITE_CSP,
  escapeHtml,
  registerSiteRoutes,
  renderPage,
  renderTestimonials,
  siteUrl,
} from "../server/site";

type Handler = (req: Request, res: Response, next: () => void) => void;

function makeApp() {
  const uses: unknown[][] = [];
  const gets: Record<string, Handler> = {};
  const app = {
    use: vi.fn((...args: unknown[]) => {
      uses.push(args);
    }),
    get: vi.fn((path: string, handler: Handler) => {
      gets[path] = handler;
    }),
  };
  return { app: app as unknown as Express, uses, gets };
}

function makeRes() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    body: "",
    redirectedTo: "",
    setHeader: vi.fn((name: string, val: string) => {
      headers[name] = val;
    }),
    type: vi.fn(() => res),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    send: vi.fn((body: string) => {
      res.body = body;
      return res;
    }),
    redirect: vi.fn((code: number, url: string) => {
      res.statusCode = code;
      res.redirectedTo = url;
    }),
  };
  return { res, headers };
}

describe("site", () => {
  const originalSiteUrl = process.env.SITE_URL;
  afterEach(() => {
    if (originalSiteUrl === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = originalSiteUrl;
  });

  it("renderTestimonials vazio não renderiza nada", () => {
    expect(renderTestimonials([])).toBe("");
  });

  it("renderTestimonials escapa o texto", () => {
    const html = renderTestimonials([{ texto: "<b>oi</b>", nome: "Ana" }]);
    expect(html).toContain("&lt;b&gt;oi&lt;/b&gt;");
    expect(html).toContain('id="depoimentos"');
  });

  it("escapeHtml escapa os cinco caracteres perigosos", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });

  it("SITE_CSP libera só o próprio domínio para estilo, fonte e formulário", () => {
    for (const d of ["style-src 'self'", "font-src 'self'", "form-action 'self'", "frame-ancestors 'none'"]) {
      expect(SITE_CSP).toContain(d);
    }
    expect(SITE_CSP).not.toMatch(/unsafe|https?:/);
  });

  it("renderPage põe título e conteúdo no layout", () => {
    const html = renderPage({ title: "Termos de Uso", content: "<p>x</p>" });
    expect(html).toContain("<title>Termos de Uso");
    expect(html).toContain("<p>x</p>");
    expect(html).toContain("suporte@vigorasaude.com");
  });

  it("renderPage põe a URL canônica quando recebe o caminho e omite a tag sem ele", () => {
    process.env.SITE_URL = "https://exemplo.test/";
    const html = renderPage({ title: "x", content: "", path: "/termos" });
    expect(html).toContain('<link rel="canonical" href="https://exemplo.test/termos">');
    const semCaminho = renderPage({ title: "x", content: "" });
    expect(semCaminho).not.toContain("canonical");
    expect(semCaminho).not.toContain("{{canonical}}");
    delete process.env.SITE_URL;
  });

  it("renderPage escapa o título e não interpreta $ no conteúdo", () => {
    const html = renderPage({ title: "<x>", content: "<p>$&</p>" });
    expect(html).toContain("<title>&lt;x&gt;");
    expect(html).toContain("<p>$&</p>");
  });

  it("siteUrl usa SITE_URL sem barra final e tem padrão", () => {
    delete process.env.SITE_URL;
    expect(siteUrl()).toBe("https://vigorasaude.com");
    process.env.SITE_URL = "https://exemplo.test/";
    expect(siteUrl()).toBe("https://exemplo.test");
  });

  it("www redireciona 301 para a raiz preservando o caminho", () => {
    delete process.env.SITE_URL;
    const { app, uses } = makeApp();
    registerSiteRoutes(app);
    const www = uses[0][0] as Handler;
    const { res } = makeRes();
    const next = vi.fn();
    www({ hostname: "www.vigorasaude.com", originalUrl: "/termos?a=1" } as Request, res as unknown as Response, next);
    expect(res.statusCode).toBe(301);
    expect(res.redirectedTo).toBe("https://vigorasaude.com/termos?a=1");
    expect(next).not.toHaveBeenCalled();
  });

  it("host sem www segue adiante", () => {
    const { app, uses } = makeApp();
    registerSiteRoutes(app);
    const www = uses[0][0] as Handler;
    const { res } = makeRes();
    const next = vi.fn();
    www({ hostname: "api.vigorasaude.com", originalUrl: "/x" } as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("páginas do site respondem com a CSP do site e HTML", () => {
    const { app, gets } = makeApp();
    registerSiteRoutes(app);
    for (const path of ["/", "/privacidade", "/termos", "/obrigado"]) {
      const { res, headers } = makeRes();
      gets[path]({ query: {} } as unknown as Request, res as unknown as Response, vi.fn());
      expect(headers["Content-Security-Policy"]).toBe(SITE_CSP);
      expect(res.body).toContain("<!doctype html>");
    }
  });

  it("cada página aponta para a própria URL canônica", () => {
    delete process.env.SITE_URL;
    const { app, gets } = makeApp();
    registerSiteRoutes(app);
    const esperado: Record<string, string> = {
      "/": "https://vigorasaude.com/",
      "/privacidade": "https://vigorasaude.com/privacidade",
      "/termos": "https://vigorasaude.com/termos",
      "/obrigado": "https://vigorasaude.com/obrigado",
    };
    for (const [path, url] of Object.entries(esperado)) {
      const { res } = makeRes();
      gets[path]({ query: {} } as unknown as Request, res as unknown as Response, vi.fn());
      expect(res.body, path).toContain(`<link rel="canonical" href="${url}">`);
    }
  });

  it("/ com ?erro=2 mostra o aviso de falha ao registrar, sem marcar o e-mail como inválido", () => {
    const { app, gets } = makeApp();
    registerSiteRoutes(app);
    const erro = makeRes();
    gets["/"]({ query: { erro: "2" } } as unknown as Request, erro.res as unknown as Response, vi.fn());
    expect(erro.res.body).toContain(
      '<p class="aviso-erro" id="erro-lista" tabindex="-1">Erro: não conseguimos registrar agora. Tente de novo em alguns minutos.</p>'
    );
    expect(erro.res.body).not.toContain("Erro: confira o e-mail");
    expect(erro.res.body).toContain("<title>Erro: tente de novo — Vigora</title>");
    expect(erro.res.body).not.toContain("aria-invalid");
    expect(erro.res.body).not.toContain("<!--erro-lista-->");
  });

  it("/ mostra o aviso de erro só com ?erro=1 e não deixa marcadores no HTML", () => {
    const { app, gets } = makeApp();
    registerSiteRoutes(app);
    const ok = makeRes();
    gets["/"]({ query: {} } as unknown as Request, ok.res as unknown as Response, vi.fn());
    expect(ok.res.body).not.toContain("Erro: confira");
    expect(ok.res.body).not.toContain("<!--erro-lista-->");
    expect(ok.res.body).not.toContain("<!--depoimentos-->");
    expect(ok.res.body).not.toContain("aria-invalid");
    expect(ok.res.body).not.toMatch(/<title>Erro/);
    const erro = makeRes();
    gets["/"]({ query: { erro: "1" } } as unknown as Request, erro.res as unknown as Response, vi.fn());
    expect(erro.res.body).toContain(
      '<p class="aviso-erro" id="erro-lista" tabindex="-1">Erro: confira o e-mail e marque a caixa de aceite para entrar na lista.</p>'
    );
    expect(erro.res.body).toContain("<title>Erro: confira os dados — Vigora</title>");
    expect(erro.res.body).toMatch(/id="email-lista" aria-invalid="true" aria-describedby="erro-lista"/);
  });

  it("assets e fontes recebem a CSP do site", () => {
    const { app, uses } = makeApp();
    registerSiteRoutes(app);
    for (const prefix of ["/assets", "/fonts"]) {
      const entry = uses.find((u) => u[0] === prefix);
      expect(entry, prefix).toBeDefined();
      const { res, headers } = makeRes();
      const next = vi.fn();
      (entry![1] as Handler)({} as Request, res as unknown as Response, next);
      expect(headers["Content-Security-Policy"]).toBe(SITE_CSP);
      expect(next).toHaveBeenCalled();
    }
  });
});
