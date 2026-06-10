// server/phone-auth.ts
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { getUserByOpenId, upsertUser } from "./db";
import {
  canSendCode,
  consumeAuthCode,
  generateCode,
  putAuthCode,
  resolveAccount,
} from "./db-auth";
import { issueSession } from "./auth-shared";
import { createRateLimit } from "./_core/rate-limit";
import { isWhatsAppApiConfigured, sendWhatsAppAuthCode } from "./whatsapp";

/**
 * Login por telefone com OTP entregue via WhatsApp.
 *
 * Reaproveita a WhatsApp Business API já usada no dead man's switch — no
 * Brasil o WhatsApp entrega melhor (e custa menos) que SMS. Requer um
 * template de autenticação aprovado (WHATSAPP_OTP_TEMPLATE_NAME); sem ele as
 * rotas respondem 503 e o app esconde a opção.
 *
 * O telefone NUNCA vincula a contas existentes por users.phone — aquele campo
 * é autodeclarado no cadastro (sem verificação), e um dígito errado apontaria
 * para a conta de outra pessoa. Cada telefone verificado é uma identidade
 * própria; quem já tem conta Google/Apple/e-mail continua entrando por elas.
 */

export function isPhoneLoginConfigured(): boolean {
  return (
    isWhatsAppApiConfigured() && !!process.env.WHATSAPP_OTP_TEMPLATE_NAME
  );
}

/**
 * Normaliza para dígitos com DDI. Aceita formatos brasileiros comuns
 * ("(51) 99999-9999", "51999999999", "+55 51 99999-9999") e devolve
 * "5551999999999", ou null se não parecer um celular BR válido.
 */
export function normalizeBrPhone(input: string): string | null {
  // Um "+" inicial sempre indica formato internacional com DDI — trata
  // "+55 51 99999-9999" como já tendo o 55, evitando duplicar para 5555...
  const hadPlus = input.trim().startsWith("+");
  const digits = input.replace(/\D/g, "");
  // Já vem com DDI 55 (12 dígitos p/ fixo, 13 p/ celular), ou veio com "+55".
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (hadPlus) {
    // "+55..." com contagem inesperada → não arrisca um número errado.
    return null;
  }
  // Número nacional sem DDI (10 dígitos fixo, 11 celular) → prefixa 55.
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return null;
}

const requestSchema = z.object({ phone: z.string().trim().min(8).max(32) });
const verifySchema = z.object({
  phone: z.string().trim().min(8).max(32),
  code: z.string().regex(/^\d{6}$/),
});

export function registerPhoneAuthRoutes(app: Express): void {
  // Envio de OTP custa mensagem do WhatsApp — orçamento apertado por IP.
  const sendLimiter = createRateLimit({ max: 5, windowMs: 60_000, name: "phone-send" });
  const checkLimiter = createRateLimit({ max: 10, windowMs: 60_000, name: "phone-check" });

  /** POST /api/auth/phone/request — { phone } */
  app.post("/api/auth/phone/request", sendLimiter, async (req: Request, res: Response) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Telefone inválido." });
      return;
    }
    if (!isPhoneLoginConfigured()) {
      res.status(503).json({ error: "Login por telefone indisponível no momento." });
      return;
    }

    const phone = normalizeBrPhone(parsed.data.phone);
    if (!phone) {
      res.status(400).json({ error: "Informe um celular brasileiro válido com DDD." });
      return;
    }

    try {
      // Throttle por destino (1/min), independente de IP — barra bombing de
      // OTP mesmo com X-Forwarded-For forjado.
      if (!(await canSendCode("phone", phone, 60_000))) {
        res.status(429).json({
          error: "Aguarde um minuto antes de pedir um novo código.",
        });
        return;
      }
      const code = generateCode();
      await putAuthCode("phone", phone, code);
      const sent = await sendWhatsAppAuthCode(phone, code);
      if (!sent.success) {
        res.status(502).json({
          error: "Não foi possível enviar o código pelo WhatsApp. Confira o número e tente novamente.",
        });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[Phone Auth] request error:", err);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  });

  /** POST /api/auth/phone/verify — { phone, code } */
  app.post("/api/auth/phone/verify", checkLimiter, async (req: Request, res: Response) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }

    const phone = normalizeBrPhone(parsed.data.phone);
    if (!phone) {
      res.status(400).json({ error: "Informe um celular brasileiro válido com DDD." });
      return;
    }

    try {
      const check = await consumeAuthCode("phone", phone, parsed.data.code);
      if (!check.ok) {
        res.status(401).json({ error: "Código inválido ou expirado." });
        return;
      }

      const { openId, isNew } = await resolveAccount({
        provider: "phone",
        subject: phone,
      });

      const existing = await getUserByOpenId(openId);
      await upsertUser({
        openId,
        loginMethod: "phone",
        lastSignedIn: new Date(),
        // Preenche o telefone verificado em contas novas (o cadastro pede
        // o telefone depois; aqui já chega comprovado).
        ...(isNew || !existing?.phone ? { phone: `+${phone}` } : {}),
      });

      res.json(await issueSession(openId, existing?.name ?? "Usuário"));
    } catch (err) {
      console.error("[Phone Auth] verify error:", err);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  });
}
