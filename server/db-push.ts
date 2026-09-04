/**
 * db-push.ts
 *
 * Persistence for Expo push tokens. Tokens are keyed by account `openId` so the
 * monitoring job can resolve every device a linked caregiver is signed in on.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "./db";
import { pushTokens } from "../drizzle/schema";

type Platform = "ios" | "android" | "web";

/**
 * Store (or refresh) a device's push token for an account. Keyed by the unique
 * token, so a device that re-registers — or signs in under a different account —
 * updates its existing row instead of creating a duplicate.
 *
 * O `deviceId` grava qual aparelho é dono do token; é o que autoriza o
 * desregistro depois (ver deleteOwnedPushToken). Opcional para não quebrar
 * clientes antigos — a linha ganha o valor no próximo registro.
 */
export async function upsertPushToken(data: {
  openId: string;
  token: string;
  platform: Platform;
  deviceId?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // deviceId ausente NÃO apaga o valor já gravado: um cliente antigo não pode
  // desarmar a prova de posse de um aparelho que já a registrou.
  const deviceFields = data.deviceId ? { deviceId: data.deviceId } : {};
  await db
    .insert(pushTokens)
    .values({
      openId: data.openId,
      token: data.token,
      platform: data.platform,
      ...deviceFields,
    })
    .onDuplicateKeyUpdate({
      set: { openId: data.openId, platform: data.platform, ...deviceFields },
    });
}

/**
 * Apaga a linha de um token SOMENTE quando quem pede prova ser dono dela:
 *   - a linha pertence à conta que está chamando, OU
 *   - o chamador apresenta o deviceId gravado na linha.
 *
 * O segundo caso é o que mantém vivo o motivo original de apagar por token: o
 * aparelho registrou como cuidador e depois entrou na conta monitorada, então
 * no logout a linha está chaveada em OUTRA conta. O deviceId (UUID v4 CSPRNG no
 * SecureStore, lib/device-id.ts) é a prova de posse do aparelho — sem ele,
 * conhecer o token bastava para desarmar o alerta em tempo real de qualquer
 * cuidador.
 *
 * Retorna true se alguma linha foi apagada.
 */
export async function deleteOwnedPushToken(
  token: string,
  caller: { openId: string; deviceId?: string }
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const posse = caller.deviceId
    ? or(
        eq(pushTokens.openId, caller.openId),
        eq(pushTokens.deviceId, caller.deviceId)
      )
    : eq(pushTokens.openId, caller.openId);

  const res = await db
    .delete(pushTokens)
    .where(and(eq(pushTokens.token, token), posse));

  const afetadas =
    (res as any).affectedRows ?? (res as any)[0]?.affectedRows ?? 0;
  return afetadas > 0;
}

/** All push tokens belonging to any of the given accounts. */
export async function getPushTokensForOpenIds(openIds: string[]) {
  if (openIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pushTokens).where(inArray(pushTokens.openId, openIds));
}

/**
 * Remove a token Expo reported as no longer valid (DeviceNotRegistered).
 *
 * Sem checagem de posse DE PROPÓSITO: quem chama é o próprio servidor, a partir
 * da resposta da Expo (push.ts), não uma requisição de usuário. A rota exposta
 * ao cliente é deleteOwnedPushToken.
 */
export async function deletePushToken(token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(pushTokens).where(eq(pushTokens.token, token));
}
