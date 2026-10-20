/**
 * waitlist.test.ts
 *
 * Rotas da lista de espera do site: validação do formulário, e-mail de
 * confirmação e saída em dois passos. Dados pessoais: o e-mail nunca vai para
 * o log, GET nunca apaga, e a resposta não revela se o e-mail já estava na lista.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Express, Request, Response } from "express";

const addToWaitlist = vi.fn();
const removeFromWaitlist = vi.fn();
vi.mock("../server/db-waitlist", async (orig) => ({
  ...(await orig<typeof import("../server/db-waitlist")>()),
  addToWaitlist: (...a: unknown[]) => addToWaitlist(...a),
  removeFromWaitlist: (...a: unknown[]) => removeFromWaitlist(...a),
}));

const sendEmail = vi.fn();
const isEmailServiceConfigured = vi.fn();
vi.mock("../server/email-auth", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  isEmailServiceConfigured: () => isEmailServiceConfigured(),
}));

const createRateLimit = vi.fn((_opts: unknown) => (_req: Request, _res: Response, next: () => void) => next());
vi.mock("../server/_core/rate-limit", () => ({ createRateLimit: (o: unknown) => createRateLimit(o) }));

import { SITE_CSP } from "../server/site";
import {
  POLICY_VERSION,
  confirmationEmailHtml,
  parseWaitlistForm,
  registerWaitlistRoutes,
} from "../server/waitlist";

type Handler = (req: Request, res: Response, next?: () => void) => unknown;

function makeApp() {
  const posts: Record<string, Handler[]> = {};
  const gets: Record<string, Handler[]> = {};
  const app = {
    post: vi.fn((path: string, ...h: Handler[]) => {
      posts[path] = h;
    }),
    get: vi.fn((path: string, ...h: Handler[]) => {
      gets[path] = h;
    }),
  };
  return { app: app as unknown as Express, posts, gets };
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

const TOKEN = "A".repeat(32);

/** Roda a cadeia de middlewares + handler da rota, como o Express faria. */
async function call(handlers: Handler[], req: Partial<Request>) {
  const { res, headers } = makeRes();
  const fullReq = { query: {}, body: {}, ...req } as Request;
  let i = 0;
  const next = async (): Promise<void> => {
    const h = handlers[i++];
    if (h) await h(fullReq, res as unknown as Response, next);
  };
  await next();
  return { res, headers };
}

describe("parseWaitlistForm", () => {
  it("normaliza o e-mail", () =>
    expect(parseWaitlistForm({ email: " Ana@Exemplo.com ", aceite: "sim" })?.email).toBe("ana@exemplo.com"));

  it("descarta motivos desconhecidos e repetidos", () =>
    expect(
      parseWaitlistForm({ email: "a@b.co", aceite: "sim", motivo: ["queda", "<script>", "queda", "remedio"] })?.reasons
    ).toEqual(["queda", "remedio"]));

  it("aceita motivo único como string e motivo ausente", () => {
    expect(parseWaitlistForm({ email: "a@b.co", aceite: "sim", motivo: "queda" })?.reasons).toEqual(["queda"]);
    expect(parseWaitlistForm({ email: "a@b.co", aceite: "sim" })?.reasons).toEqual([]);
  });

  it("recusa sem aceite, e-mail inválido e e-mail > 320", () => {
    expect(parseWaitlistForm({ email: "a@b.co" })).toBeNull();
    expect(parseWaitlistForm({ email: "a@b.co", aceite: "nao" })).toBeNull();
    expect(parseWaitlistForm({ email: "nao-e-email", aceite: "sim" })).toBeNull();
    expect(parseWaitlistForm({ email: `${"a".repeat(400)}@b.co`, aceite: "sim" })).toBeNull();
    expect(parseWaitlistForm(undefined)).toBeNull();
    expect(parseWaitlistForm("texto")).toBeNull();
  });

  it("não quebra com campos de tipo inesperado", () => {
    expect(parseWaitlistForm({ email: ["a@b.co"], aceite: "sim" })).toBeNull();
    expect(parseWaitlistForm({ email: "a@b.co", aceite: "sim", motivo: { x: 1 } })).toBeNull();
  });
});

describe("confirmationEmailHtml", () => {
  it("usa a copy exata e o link de saída", () => {
    const html = confirmationEmailHtml("https://x.test/lista/sair?t=abc");
    expect(html).toBe(
      '<p>Obrigado pelo interesse no Vigora. Vamos te avisar por e-mail quando o app for lançado.</p><p>Não foi você que se cadastrou? <a href="https://x.test/lista/sair?t=abc">Tire este e-mail da lista</a>.</p>'
    );
  });
});

describe("rotas da lista de espera", () => {
  let posts: Record<string, Handler[]>;
  let gets: Record<string, Handler[]>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addToWaitlist.mockReset();
    removeFromWaitlist.mockReset();
    sendEmail.mockReset();
    isEmailServiceConfigured.mockReset();
    isEmailServiceConfigured.mockReturnValue(true);
    sendEmail.mockResolvedValue(true);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = makeApp();
    registerWaitlistRoutes(m.app);
    posts = m.posts;
    gets = m.gets;
  });
  afterEach(() => errorSpy.mockRestore());

  it("registra POST /lista com rate limit de 5 por minuto", () => {
    expect(createRateLimit).toHaveBeenCalledWith({ max: 5, windowMs: 60_000, name: "waitlist" });
    expect(Object.keys(posts).sort()).toEqual(["/lista", "/lista/sair"]);
    expect(Object.keys(gets)).toEqual(["/lista/sair"]);
  });

  it("POST /lista válido redireciona 303 para /obrigado e envia e-mail só quando created", async () => {
    addToWaitlist.mockResolvedValue({ created: true, unsubscribeToken: TOKEN });
    const { res, headers } = await call(posts["/lista"], {
      body: { email: " Ana@Exemplo.com ", aceite: "sim", motivo: ["queda"] },
    });
    expect(res.statusCode).toBe(303);
    expect(res.redirectedTo).toBe("/obrigado");
    expect(headers["Content-Security-Policy"]).toBe(SITE_CSP);
    expect(addToWaitlist).toHaveBeenCalledWith({
      email: "ana@exemplo.com",
      reasons: ["queda"],
      policyVersion: POLICY_VERSION,
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendEmail.mock.calls[0];
    expect(to).toBe("ana@exemplo.com");
    expect(subject).toBe("Você está na lista de espera do Vigora");
    expect(html).toContain(`/lista/sair?t=${TOKEN}`);
  });

  it("POST /lista só responde depois de gravar e envia o e-mail depois da resposta", async () => {
    const ordem: string[] = [];
    let release: (v: { created: true; unsubscribeToken: string }) => void = () => {};
    addToWaitlist.mockReturnValue(new Promise((r) => (release = r)));
    sendEmail.mockImplementation(async () => {
      ordem.push("email");
      return true;
    });
    const { res } = makeRes();
    res.redirect.mockImplementation((code: number, url: string) => {
      ordem.push("resposta");
      res.statusCode = code;
      res.redirectedTo = url;
    });
    const handlers = posts["/lista"];
    const pending = handlers[handlers.length - 1](
      { query: {}, body: { email: "a@b.co", aceite: "sim" } } as Request,
      res as unknown as Response
    );
    await Promise.resolve();
    expect(res.redirectedTo).toBe("");
    release({ created: true, unsubscribeToken: TOKEN });
    await pending;
    await new Promise((r) => setImmediate(r));
    expect(res.redirectedTo).toBe("/obrigado");
    expect(ordem).toEqual(["resposta", "email"]);
  });

  it("POST /lista com e-mail já cadastrado responde igual e não envia e-mail", async () => {
    addToWaitlist.mockResolvedValue({ created: false });
    const { res } = await call(posts["/lista"], { body: { email: "a@b.co", aceite: "sim" } });
    expect(res.statusCode).toBe(303);
    expect(res.redirectedTo).toBe("/obrigado");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("mesmo e-mail com maiúsculas e espaços chega ao banco normalizado", async () => {
    addToWaitlist.mockResolvedValue({ created: false });
    await call(posts["/lista"], { body: { email: "  A@B.CO ", aceite: "sim" } });
    await call(posts["/lista"], { body: { email: "a@b.co", aceite: "sim" } });
    expect(addToWaitlist.mock.calls[0][0].email).toBe("a@b.co");
    expect(addToWaitlist.mock.calls[1][0].email).toBe("a@b.co");
  });

  it("POST /lista inválido redireciona 303 para /?erro=1#erro-lista sem tocar no banco", async () => {
    for (const body of [
      {},
      { email: "a@b.co" },
      { email: "x", aceite: "sim" },
      { email: `${"a".repeat(400)}@b.co`, aceite: "sim" },
      undefined,
    ]) {
      const { res, headers } = await call(posts["/lista"], { body });
      expect(res.statusCode).toBe(303);
      expect(res.redirectedTo).toBe("/?erro=1#erro-lista");
      expect(headers["Content-Security-Policy"]).toBe(SITE_CSP);
    }
    expect(addToWaitlist).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("motivos adulterados são descartados e o cadastro segue", async () => {
    addToWaitlist.mockResolvedValue({ created: false });
    const { res } = await call(posts["/lista"], {
      body: { email: "a@b.co", aceite: "sim", motivo: ["<script>", "queda", "queda"] },
    });
    expect(res.redirectedTo).toBe("/obrigado");
    expect(addToWaitlist.mock.calls[0][0].reasons).toEqual(["queda"]);
  });

  it("falha do Resend não muda a resposta e loga sem o e-mail", async () => {
    addToWaitlist.mockResolvedValue({ created: true, unsubscribeToken: TOKEN });
    sendEmail.mockResolvedValue(false);
    const { res } = await call(posts["/lista"], { body: { email: "a@b.co", aceite: "sim" } });
    expect(res.redirectedTo).toBe("/obrigado");
    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("a@b.co");
  });

  it("sem Resend configurado grava, não envia, redireciona e loga sem o e-mail", async () => {
    isEmailServiceConfigured.mockReturnValue(false);
    addToWaitlist.mockResolvedValue({ created: true, unsubscribeToken: TOKEN });
    const { res } = await call(posts["/lista"], { body: { email: "a@b.co", aceite: "sim" } });
    expect(res.redirectedTo).toBe("/obrigado");
    expect(addToWaitlist).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("a@b.co");
  });

  it("erro do banco não perde o cadastro em silêncio: volta para /?erro=2#erro-lista e loga sem o e-mail", async () => {
    addToWaitlist.mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    const { res, headers } = await call(posts["/lista"], { body: { email: "a@b.co", aceite: "sim" } });
    expect(res.statusCode).toBe(303);
    expect(res.redirectedTo).toBe("/?erro=2#erro-lista");
    expect(headers["Content-Security-Policy"]).toBe(SITE_CSP);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0][0])).toContain("[Waitlist]");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("a@b.co");
  });

  it("GET /lista/sair não apaga nada", async () => {
    const { res, headers } = await call(gets["/lista/sair"], { query: { t: TOKEN } });
    expect(removeFromWaitlist).not.toHaveBeenCalled();
    expect(res.body).toContain('action="/lista/sair"');
    expect(res.body).toContain(`value="${TOKEN}"`);
    expect(res.body).toContain("Sair da lista");
    expect(headers["Content-Security-Policy"]).toBe(SITE_CSP);
  });

  it("GET /lista/sair com token inválido mostra 'Link inválido' sem formulário", async () => {
    for (const t of [undefined, "curto", `${TOKEN}x`, "A".repeat(31) + "!", ["a", "b"]]) {
      const { res } = await call(gets["/lista/sair"], { query: { t } as Request["query"] });
      expect(res.body).toContain("Link inválido");
      expect(res.body).not.toContain("<form");
    }
    expect(removeFromWaitlist).not.toHaveBeenCalled();
  });

  it("POST /lista/sair apaga pelo token", async () => {
    removeFromWaitlist.mockResolvedValue(true);
    const { res, headers } = await call(posts["/lista/sair"], { body: { t: TOKEN } });
    expect(removeFromWaitlist).toHaveBeenCalledWith(TOKEN);
    expect(res.body).toContain("Pronto, seu e-mail saiu da lista do Vigora.");
    expect(headers["Content-Security-Policy"]).toBe(SITE_CSP);
  });

  it("POST /lista/sair com token inexistente responde igual", async () => {
    removeFromWaitlist.mockResolvedValue(false);
    const { res } = await call(posts["/lista/sair"], { body: { t: TOKEN } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Pronto, seu e-mail saiu da lista do Vigora.");
  });

  it("POST /lista/sair com token malformado não consulta o banco", async () => {
    const { res } = await call(posts["/lista/sair"], { body: { t: "x" } });
    expect(removeFromWaitlist).not.toHaveBeenCalled();
    expect(res.body).toContain("Link inválido");
  });

  it("POST /lista/sair com banco fora do ar responde 503 e loga sem quebrar", async () => {
    removeFromWaitlist.mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    const { res } = await call(posts["/lista/sair"], { body: { t: TOKEN } });
    expect(res.statusCode).toBe(503);
    expect(String(errorSpy.mock.calls[0][0])).toContain("[Waitlist]");
  });
});
