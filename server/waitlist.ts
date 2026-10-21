import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { clientIp, createRateLimit } from "./_core/rate-limit";
import { normalizeEmail } from "./db-auth";
import { addToWaitlist, removeFromWaitlist, WAITLIST_REASONS } from "./db-waitlist";
import type { WaitlistReason } from "./db-waitlist";
import { isEmailServiceConfigured, sendEmail } from "./email-auth";
import { SITE_CSP, escapeHtml, lerArquivo, renderPage, siteUrl } from "./site";

/**
 * Lista de espera do site (vigorasaude.com).
 *
 * Privacidade: a resposta do POST /lista é sempre a mesma (e-mail novo ou já
 * cadastrado), o envio da confirmação roda depois dela, e o e-mail de quem se
 * cadastra nunca vai para o log. Se o cadastro não puder ser gravado, a pessoa
 * vê um aviso em vez do "obrigado". A saída é em dois passos: GET só mostra a confirmação
 * (leitores de link de provedores de e-mail abrem links), apagar exige POST.
 */

/** Versão da Política de Privacidade aceita no cadastro. */
export const POLICY_VERSION = "2026-10-20";

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const EMAIL_SUBJECT = "Você está na lista de espera do Vigora";

const formSchema = z.object({
  email: z.string().trim().max(320).email(),
  motivo: z.union([z.string(), z.array(z.string())]).optional(),
  aceite: z.literal("sim"),
});

export function parseWaitlistForm(body: unknown): { email: string; reasons: WaitlistReason[] } | null {
  const parsed = formSchema.safeParse(body);
  if (!parsed.success) return null;
  const motivos = parsed.data.motivo === undefined ? [] : [parsed.data.motivo].flat();
  const reasons = [...new Set(motivos)].filter((m): m is WaitlistReason =>
    (WAITLIST_REASONS as readonly string[]).includes(m)
  );
  return { email: normalizeEmail(parsed.data.email), reasons };
}

export function confirmationEmailHtml(unsubscribeUrl: string): string {
  return `<p>Obrigado pelo interesse no Vigora. Vamos te avisar por e-mail quando o app for lançado.</p><p>Não foi você que se cadastrou? <a href="${escapeHtml(unsubscribeUrl)}">Tire este e-mail da lista</a>.</p>`;
}

/**
 * Motivo do erro para o log. Mensagens de erro do driver do banco podem trazer
 * os parâmetros da query (o e-mail), então só código/nome — e a mensagem apenas
 * quando é um sentinela nosso (ex.: DATABASE_UNAVAILABLE).
 */
function motivoDoErro(err: unknown): string {
  if (err instanceof Error && /^[A-Z_]+$/.test(err.message)) return err.message;
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string") return code;
  return err instanceof Error ? err.name : "erro desconhecido";
}

async function enviarConfirmacao(email: string, unsubscribeToken: string): Promise<void> {
  try {
    if (!isEmailServiceConfigured()) {
      console.error("[Waitlist] Resend não configurado; confirmação não enviada");
      return;
    }
    const link = `${siteUrl()}/lista/sair?t=${unsubscribeToken}`;
    if (!(await sendEmail(email, EMAIL_SUBJECT, confirmationEmailHtml(link)))) {
      console.error("[Waitlist] envio da confirmação falhou");
    }
  } catch (err) {
    console.error("[Waitlist] erro ao enviar a confirmação:", motivoDoErro(err));
  }
}

function paginaSair(titulo: string, corpo: string): string {
  return renderPage({
    title: `${titulo} — Vigora`,
    content: `<section class="secao"><h1>${titulo}</h1>${corpo}</section>`,
  });
}

const LINK_INVALIDO = '<p>Este link não é válido. Use o link do e-mail que você recebeu.</p><p><a href="/">Voltar ao início</a></p>';

function tokenDe(valor: unknown): string | null {
  return typeof valor === "string" && TOKEN_RE.test(valor) ? valor : null;
}

function comCspDoSite(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Content-Security-Policy", SITE_CSP);
  next();
}

const IP_RE = /^[0-9A-Fa-f:.]{2,45}$/;

/**
 * Chave do rate limit do site. Pelo Worker do Cloudflare (infra/cloudflare/site-worker.js)
 * todo visitante chega com o IP do Worker; o Worker repassa o IP real num header e prova
 * a origem com SITE_PROXY_SECRET. Sem segredo configurado, ou com segredo errado (alguém
 * forjando o header direto no app.), vale o IP de sempre.
 */
export function siteClientKey(req: Request): string {
  const segredo = process.env.SITE_PROXY_SECRET ?? "";
  const recebido = req.get("x-vigora-proxy-secret") ?? "";
  const ip = req.get("x-vigora-client-ip") ?? "";
  const confere =
    segredo.length > 0 &&
    recebido.length === segredo.length &&
    timingSafeEqual(Buffer.from(recebido), Buffer.from(segredo));
  return confere && IP_RE.test(ip) ? ip : clientIp(req);
}

export function registerWaitlistRoutes(app: Express): void {
  const limiter = createRateLimit({ max: 5, windowMs: 60_000, name: "waitlist", keyFn: siteClientKey });
  const limiterSair = createRateLimit({ max: 10, windowMs: 60_000, name: "waitlist-sair", keyFn: siteClientKey });

  app.post("/lista", comCspDoSite, limiter, async (req: Request, res: Response) => {
    const form = parseWaitlistForm(req.body);
    if (!form) {
      res.redirect(303, "/?erro=1#erro-lista");
      return;
    }
    // Grava antes de responder: se o banco falhar, a pessoa precisa saber. O
    // INSERT IGNORE leva o mesmo tempo para e-mail novo ou repetido.
    let result: Awaited<ReturnType<typeof addToWaitlist>>;
    try {
      result = await addToWaitlist({ email: form.email, reasons: form.reasons, policyVersion: POLICY_VERSION });
    } catch (err) {
      console.error("[Waitlist] erro ao cadastrar:", motivoDoErro(err));
      res.redirect(303, "/?erro=2#erro-lista");
      return;
    }
    res.redirect(303, "/obrigado");
    // O envio (Resend) é o que denunciaria e-mail novo pelo tempo: roda depois da resposta.
    if (result.created) await enviarConfirmacao(form.email, result.unsubscribeToken);
  });

  app.get("/lista/sair", comCspDoSite, (req: Request, res: Response) => {
    const token = tokenDe(req.query.t);
    if (!token) {
      res.type("html").send(paginaSair("Link inválido", LINK_INVALIDO));
      return;
    }
    const formulario = lerArquivo("sair.html").replace("{{token}}", () => token);
    res.type("html").send(paginaSair("Sair da lista", formulario));
  });

  app.post("/lista/sair", comCspDoSite, limiterSair, async (req: Request, res: Response) => {
    const token = tokenDe((req.body as { t?: unknown } | undefined)?.t);
    if (!token) {
      res.type("html").send(paginaSair("Link inválido", LINK_INVALIDO));
      return;
    }
    try {
      await removeFromWaitlist(token);
    } catch (err) {
      console.error("[Waitlist] erro ao remover da lista:", motivoDoErro(err));
      res
        .status(503)
        .type("html")
        .send(paginaSair("Não foi possível agora", "<p>Tente de novo em alguns minutos.</p>"));
      return;
    }
    res
      .type("html")
      .send(paginaSair("Pronto", "<p>Pronto, seu e-mail saiu da lista do Vigora.</p><p><a href=\"/\">Voltar ao início</a></p>"));
  });
}
