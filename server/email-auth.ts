// server/email-auth.ts
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { upsertUser } from "./db";
import {
  canSendCode,
  consumeAuthCode,
  findIdentity,
  generateCode,
  normalizeEmail,
  putAuthCode,
  resolveAccount,
  setIdentityPassword,
} from "./db-auth";
import { issueSession } from "./auth-shared";
import { createRateLimit } from "./_core/rate-limit";

/**
 * Login por e-mail+senha com verificação de e-mail obrigatória.
 *
 * A verificação (código de 6 dígitos) não é burocracia: é o que torna segura a
 * vinculação "mesmo e-mail = mesma conta". Sem provar posse da caixa postal,
 * um atacante cadastraria o e-mail da vítima com senha própria e herdaria a
 * conta Google/Apple dela — dados de saúde inclusos.
 *
 * Fluxos:
 *   signup → código por e-mail → verify (cria/vincula conta, auto-login)
 *   login  → senha → sessão
 *   forgot → código por e-mail → reset (nova senha, auto-login)
 *
 * Envio de e-mail via Resend (https://resend.com) — HTTP puro, sem SDK.
 * Requer RESEND_API_KEY e EMAIL_FROM no ambiente; sem eles as rotas de
 * cadastro/reset respondem 503 e o app esconde a opção.
 */

// --- Hash de senha (scrypt nativo do Node — sem dependências) -------------------

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

function scryptAsync(
  password: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number,
  keylen: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, { N, r, p }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(
    password,
    salt,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    SCRYPT_KEYLEN
  );
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "hex");
    expected = Buffer.from(parts[5], "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  try {
    const actual = await scryptAsync(password, salt, N, r, p, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Hash fixo usado para equalizar o tempo de resposta quando o e-mail não
// existe (evita enumeração por timing no login).
const DUMMY_HASH_PROMISE = hashPassword("vigora-timing-dummy");

// --- Envio de e-mail (Resend) ----------------------------------------------------

export function isEmailServiceConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function sendEmail(
  to: string,
  subject: string,
  bodyHtml: string
): Promise<boolean> {
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #0E1417;">
      <h2 style="color: #1E4D8C;">Vigora</h2>
      ${bodyHtml}
    </div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[Email Auth] Resend error:", res.status, body.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Email Auth] Resend network error:", err);
    return false;
  }
}

function sendCodeEmail(
  to: string,
  code: string,
  purpose: "signup" | "reset"
): Promise<boolean> {
  const subject =
    purpose === "signup"
      ? "Seu código de confirmação — Vigora"
      : "Redefinição de senha — Vigora";
  const intro =
    purpose === "signup"
      ? "Use o código abaixo para confirmar seu cadastro no Vigora:"
      : "Use o código abaixo para redefinir sua senha no Vigora:";
  return sendEmail(
    to,
    subject,
    `<p style="font-size: 16px;">${intro}</p>
     <p style="font-size: 36px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 16px; background: #F4EFE5; border-radius: 8px;">${code}</p>
     <p style="font-size: 14px;">O código vale por 15 minutos. Se você não pediu este e-mail, pode ignorá-lo com segurança.</p>`
  );
}

/**
 * Enviado quando alguém tenta se cadastrar com um e-mail que JÁ tem conta.
 * Permite que a resposta HTTP do signup seja idêntica para e-mails existentes
 * e novos (anti-enumeração) sem deixar o usuário legítimo no escuro.
 */
function sendAlreadyRegisteredEmail(to: string): Promise<boolean> {
  return sendEmail(
    to,
    "Você já tem uma conta — Vigora",
    `<p style="font-size: 16px;">Recebemos um pedido de cadastro com este e-mail, mas você já tem uma conta no Vigora.</p>
     <p style="font-size: 16px;">Para entrar, use a opção "Entrar" com sua senha. Se esqueceu a senha, use "Esqueci minha senha".</p>
     <p style="font-size: 14px;">Se não foi você, pode ignorar este e-mail com segurança.</p>`
  );
}

// --- Schemas ---------------------------------------------------------------------

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const passwordSchema = z.string().min(8).max(128);
const codeSchema = z.string().regex(/^\d{6}$/);

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(255),
});
const verifySchema = z.object({ email: emailSchema, code: codeSchema });
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
const forgotSchema = z.object({ email: emailSchema });
const resetSchema = z.object({
  email: emailSchema,
  code: codeSchema,
  newPassword: passwordSchema,
});

// --- Rotas -----------------------------------------------------------------------

export function registerEmailAuthRoutes(app: Express): void {
  // Rotas que disparam e-mail: orçamento apertado (5/min/IP) — custo real por
  // request. Demais: 10/min/IP. O envelope /api/auth (30/min) continua valendo.
  const sendLimiter = createRateLimit({ max: 5, windowMs: 60_000, name: "email-send" });
  const checkLimiter = createRateLimit({ max: 10, windowMs: 60_000, name: "email-check" });

  /**
   * POST /api/auth/email/signup — { email, password, name }
   * Não cria nada ainda: guarda o pedido (hash da senha + nome) junto do
   * código e só materializa a conta no verify.
   *
   * Anti-enumeração: responde SEMPRE 200 {ok:true} (e-mail novo ou já
   * cadastrado têm resposta idêntica). O trabalho — hash, gravação do código,
   * envio — roda em background depois da resposta, então o tempo de resposta
   * também não denuncia se o e-mail existe. E-mail já cadastrado recebe um
   * aviso "você já tem conta" em vez do código.
   */
  app.post("/api/auth/email/signup", sendLimiter, async (req: Request, res: Response) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Dados inválidos. Verifique e-mail, senha (mínimo 8 caracteres) e nome." });
      return;
    }
    if (!isEmailServiceConfigured()) {
      res.status(503).json({ error: "Cadastro por e-mail indisponível no momento." });
      return;
    }

    const email = normalizeEmail(parsed.data.email);
    res.json({ ok: true });

    // Fire-and-forget: nada além daqui altera a resposta já enviada.
    void (async () => {
      try {
        // Throttle por destino (1/min) — barra bombing mesmo com IP forjado.
        if (!(await canSendCode("signup", email, 60_000))) return;

        const identity = await findIdentity("email", email);
        if (identity?.passwordHash) {
          await sendAlreadyRegisteredEmail(email);
          return;
        }

        const passwordHash = await hashPassword(parsed.data.password);
        const code = generateCode();
        await putAuthCode("signup", email, code, {
          passwordHash,
          name: parsed.data.name,
        });
        await sendCodeEmail(email, code, "signup");
      } catch (err) {
        console.error("[Email Auth] signup background error:", err);
      }
    })();
  });

  /**
   * POST /api/auth/email/verify — { email, code }
   * Prova de posse da caixa postal: cria a conta (ou vincula à conta existente
   * com o mesmo e-mail) e já devolve a sessão.
   */
  app.post("/api/auth/email/verify", checkLimiter, async (req: Request, res: Response) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }

    try {
      const email = normalizeEmail(parsed.data.email);
      const check = await consumeAuthCode("signup", email, parsed.data.code);
      if (!check.ok) {
        res.status(401).json({ error: "Código inválido ou expirado." });
        return;
      }

      const payload = (check.row.payload ?? {}) as {
        passwordHash?: string;
        name?: string;
      };
      if (!payload.passwordHash) {
        res.status(401).json({ error: "Código inválido ou expirado." });
        return;
      }
      const name = payload.name?.trim() || email;

      const { openId } = await resolveAccount({
        provider: "email",
        subject: email,
        email,
        emailVerified: true,
        name,
        passwordHash: payload.passwordHash,
      });
      // Garante a senha mesmo quando a identidade já existia sem hash
      // (ex.: corrida entre dois verifies).
      await setIdentityPassword(email, payload.passwordHash);

      await upsertUser({
        openId,
        email,
        loginMethod: "email",
        lastSignedIn: new Date(),
      });

      res.json(await issueSession(openId, name));
    } catch (err) {
      console.error("[Email Auth] verify error:", err);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  });

  /**
   * POST /api/auth/email/login — { email, password }
   * Erro sempre genérico ("e-mail ou senha incorretos") para não revelar
   * quais e-mails têm conta.
   */
  app.post("/api/auth/email/login", checkLimiter, async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }

    try {
      const email = normalizeEmail(parsed.data.email);
      const identity = await findIdentity("email", email);

      if (!identity?.passwordHash) {
        // Equaliza o tempo com uma verificação descartável (anti-enumeração).
        await verifyPassword(parsed.data.password, await DUMMY_HASH_PROMISE);
        res.status(401).json({ error: "E-mail ou senha incorretos." });
        return;
      }

      const valid = await verifyPassword(parsed.data.password, identity.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "E-mail ou senha incorretos." });
        return;
      }

      await upsertUser({
        openId: identity.openId,
        loginMethod: "email",
        lastSignedIn: new Date(),
      });
      res.json(await issueSession(identity.openId, email));
    } catch (err) {
      console.error("[Email Auth] login error:", err);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  });

  /**
   * POST /api/auth/email/forgot — { email }
   * Anti-enumeração: responde SEMPRE 200 imediatamente; o envio do código (só
   * quando existe identidade de senha) roda em background, então nem o corpo
   * nem o tempo de resposta revelam se o e-mail tem conta.
   */
  app.post("/api/auth/email/forgot", sendLimiter, async (req: Request, res: Response) => {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    if (!isEmailServiceConfigured()) {
      res.status(503).json({ error: "Redefinição de senha indisponível no momento." });
      return;
    }

    const email = normalizeEmail(parsed.data.email);
    res.json({ ok: true });

    void (async () => {
      try {
        if (!(await canSendCode("reset", email, 60_000))) return;
        const identity = await findIdentity("email", email);
        if (identity?.passwordHash) {
          const code = generateCode();
          await putAuthCode("reset", email, code);
          await sendCodeEmail(email, code, "reset");
        }
      } catch (err) {
        console.error("[Email Auth] forgot background error:", err);
      }
    })();
  });

  /**
   * POST /api/auth/email/reset — { email, code, newPassword }
   * Troca a senha e já entrega a sessão (auto-login pós-reset).
   */
  app.post("/api/auth/email/reset", checkLimiter, async (req: Request, res: Response) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Dados inválidos. A nova senha precisa de ao menos 8 caracteres." });
      return;
    }

    try {
      const email = normalizeEmail(parsed.data.email);
      const check = await consumeAuthCode("reset", email, parsed.data.code);
      if (!check.ok) {
        res.status(401).json({ error: "Código inválido ou expirado." });
        return;
      }

      const identity = await findIdentity("email", email);
      if (!identity) {
        res.status(401).json({ error: "Código inválido ou expirado." });
        return;
      }

      await setIdentityPassword(email, await hashPassword(parsed.data.newPassword));
      await upsertUser({
        openId: identity.openId,
        loginMethod: "email",
        lastSignedIn: new Date(),
      });
      res.json(await issueSession(identity.openId, email));
    } catch (err) {
      console.error("[Email Auth] reset error:", err);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  });
}
