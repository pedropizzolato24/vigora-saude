/**
 * anonymous-auth.ts — conta sem login ("Continuar sem conta").
 *
 * O usuário sem login É uma conta real (users row, openId normal) com
 * loginMethod "anonymous" — nada no domínio é chaveado por device (ver
 * docs/design/2026-07-12-monitoring-account-ownership.md, "Contas sem login").
 * O deviceId (SecureStore, UUID CSPRNG de 122 bits) é a credencial que
 * reautentica nessa conta — o "login invisível" dela.
 *
 * O openId é DETERMINÍSTICO (`anon:<deviceId>`): reautenticar é idempotente,
 * e mesmo que a conta seja expurgada por abandono, o app recria o MESMO
 * openId — o estado local por conta (vigora_app_state:<openId>) continua
 * batendo e os alarmes do aparelho não somem.
 *
 * POST /api/auth/anonymous  Body: { deviceId }  →  { sessionToken, user }
 */
import type { Express, Request, Response } from "express";
import { getUserByOpenId, upsertUser } from "./db";
import { issueSession } from "./auth-shared";
import { createRateLimit } from "./_core/rate-limit";

// UUID v4 do lib/device-id.ts (expo-crypto.randomUUID). Estrito de propósito:
// este endpoint cria contas sem outra credencial — não aceite formatos livres.
const DEVICE_ID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function registerAnonymousAuthRoute(app: Express): void {
  // Cadastro anônimo é superfície de abuso (contas infinitas): limite próprio,
  // bem mais apertado que o envelope de /api/auth (30/min).
  const limiter = createRateLimit({ max: 5, windowMs: 60_000, name: "auth-anonymous" });

  app.post("/api/auth/anonymous", limiter, async (req: Request, res: Response) => {
    const { deviceId } = req.body as { deviceId?: string };
    if (!deviceId || !DEVICE_ID_RE.test(deviceId)) {
      res.status(400).json({ error: "deviceId inválido" });
      return;
    }

    try {
      const openId = `anon:${deviceId.toLowerCase()}`;
      const existing = await getUserByOpenId(openId);

      // Conta que já linkou um login real: o deviceId DEIXA de ser credencial
      // (a porta anônima só existe enquanto a conta é anônima). Sem isto, o
      // upgrade não reduziria a superfície de acesso da conta.
      if (existing && existing.loginMethod !== "anonymous") {
        res.status(403).json({
          error:
            "Esta conta já está protegida por um login. Entre com seu Google, e-mail ou telefone.",
        });
        return;
      }

      await upsertUser({
        openId,
        loginMethod: "anonymous",
        lastSignedIn: new Date(),
      });
      const result = await issueSession(openId, existing?.name ?? "Usuário");
      res.json(result);
    } catch (err) {
      console.error("[Anonymous Auth] Error:", err);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  });
}
