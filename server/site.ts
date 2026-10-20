import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { DEPOIMENTOS } from "../site/depoimentos";
import type { Depoimento } from "../site/depoimentos";

/**
 * Site público (vigorasaude.com), servido pelo mesmo Express da API.
 *
 * Só HTML/CSS estático: sem JavaScript, sem recurso de terceiros. A CSP da API
 * (`default-src 'none'`) é relaxada aqui, e apenas nas rotas do site, o
 * suficiente para estilo, fonte e formulário do próprio domínio.
 *
 * Caminhos relativos ao cwd (raiz do repo), como `runPendingMigrations` faz
 * com `./drizzle`.
 */
export const SITE_CSP =
  "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

const SITE_DIR = path.resolve("site");
const FONTS_DIR = path.resolve("assets", "fonts");

const PAGINAS: Record<string, { arquivo: string; titulo: string }> = {
  "/": { arquivo: "index.html", titulo: "Vigora — uma mensagem, na hora em que ela importa" },
  "/privacidade": { arquivo: "privacidade.html", titulo: "Política de Privacidade — Vigora" },
  "/termos": { arquivo: "termos.html", titulo: "Termos de Uso — Vigora" },
  "/obrigado": { arquivo: "obrigado.html", titulo: "Você está na lista — Vigora" },
};

// Sem JS, `role="alert"` presente no carregamento não é anunciado: o
// redirecionamento para `#erro-lista` leva o foco ao aviso (tabindex="-1"), e o
// título da página e o campo de e-mail também indicam o erro.
const AVISO_ERRO_LISTA =
  '<p class="aviso-erro" id="erro-lista" tabindex="-1">Erro: confira o e-mail e marque a caixa de aceite para entrar na lista.</p>';
const TITULO_ERRO_LISTA = "Erro: confira os dados — Vigora";
const AVISO_FALHA_LISTA =
  '<p class="aviso-erro" id="erro-lista" tabindex="-1">Erro: não conseguimos registrar agora. Tente de novo em alguns minutos.</p>';
const TITULO_FALHA_LISTA = "Erro: tente de novo — Vigora";

const cache = new Map<string, string>();

export function lerArquivo(nome: string): string {
  let conteudo = cache.get(nome);
  if (conteudo === undefined) {
    conteudo = fs.readFileSync(path.join(SITE_DIR, nome), "utf8");
    cache.set(nome, conteudo);
  }
  return conteudo;
}

export function siteUrl(): string {
  return (process.env.SITE_URL || "https://vigorasaude.com").replace(/\/+$/, "");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderPage(opts: { title: string; content: string; path?: string }): string {
  const layout = lerArquivo("_layout.html");
  const comCanonical =
    opts.path === undefined
      ? layout.replace(/^[^\n]*\{\{canonical\}\}[^\n]*\r?\n/m, "")
      : layout.replace("{{canonical}}", () => escapeHtml(siteUrl() + opts.path));
  return comCanonical
    .replace("{{title}}", () => escapeHtml(opts.title))
    .replace("{{content}}", () => opts.content);
}

export function renderTestimonials(list: Depoimento[]): string {
  if (list.length === 0) return "";
  const itens = list
    .map((d) => {
      const detalhe = d.detalhe ? `, ${escapeHtml(d.detalhe)}` : "";
      return `<figure class="depoimento"><blockquote><p>${escapeHtml(d.texto)}</p></blockquote><figcaption>${escapeHtml(d.nome)}${detalhe}</figcaption></figure>`;
    })
    .join("");
  return `<section id="depoimentos" class="secao"><h2>Quem já conversou com a gente</h2>${itens}</section>`;
}

function comCspDoSite(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Content-Security-Policy", SITE_CSP);
  next();
}

function paginaEstatica(rota: string) {
  const { arquivo, titulo } = PAGINAS[rota];
  return (req: Request, res: Response): void => {
    let content = lerArquivo(arquivo);
    let title = titulo;
    if (rota === "/") {
      const erro = req.query.erro === "1";
      const falha = req.query.erro === "2";
      content = content
        .replace("<!--depoimentos-->", () => renderTestimonials(DEPOIMENTOS))
        .replace("<!--erro-lista-->", () => (erro ? AVISO_ERRO_LISTA : falha ? AVISO_FALHA_LISTA : ""));
      if (erro) {
        title = TITULO_ERRO_LISTA;
        content = content.replace(
          'id="email-lista"',
          'id="email-lista" aria-invalid="true" aria-describedby="erro-lista"'
        );
      } else if (falha) {
        title = TITULO_FALHA_LISTA;
      }
    }
    res.setHeader("Content-Security-Policy", SITE_CSP);
    res.type("html").send(renderPage({ title, content, path: rota }));
  };
}

export function registerSiteRoutes(app: Express): void {
  // www. → domínio principal, preservando caminho e query.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.hostname.startsWith("www.")) {
      res.redirect(301, siteUrl() + req.originalUrl);
      return;
    }
    next();
  });

  app.use("/assets", comCspDoSite, express.static(path.join(SITE_DIR, "assets")));
  app.use("/fonts", comCspDoSite, express.static(FONTS_DIR));

  for (const rota of Object.keys(PAGINAS)) {
    app.get(rota, paginaEstatica(rota));
  }
}
