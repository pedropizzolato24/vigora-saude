/**
 * server/db-caregiver.ts
 *
 * DB helpers para o sistema de cuidadores:
 * - Códigos de convite (gerados pelo monitorado, usados pelo cuidador)
 * - Links de cuidado (vínculo ativo entre monitorado e cuidador)
 * - Push tokens (Expo push token por dispositivo)
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { appUsers, caregivingLinks, inviteCodes } from "../drizzle/schema";

// ---------------------------------------------------------------------------
// Expo Push Token
// ---------------------------------------------------------------------------

export async function upsertPushToken(deviceId: string, token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(appUsers)
    .set({ expoPushToken: token })
    .where(eq(appUsers.deviceId, deviceId));
}

export async function getPushToken(deviceId: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ expoPushToken: appUsers.expoPushToken })
    .from(appUsers)
    .where(eq(appUsers.deviceId, deviceId))
    .limit(1);
  return rows[0]?.expoPushToken ?? null;
}

// ---------------------------------------------------------------------------
// Invite Codes
// ---------------------------------------------------------------------------

/** Gera um código aleatório de 6 caracteres alfanuméricos (maiúsculos). */
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I para evitar confusão
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Cria um código de convite para o monitorado.
 * Invalida códigos anteriores não utilizados do mesmo dispositivo antes de criar.
 * Retorna o código gerado e seu prazo de validade.
 */
export async function createInviteCode(
  monitoredDeviceId: string
): Promise<{ code: string; expiresAt: Date }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Expirar códigos anteriores não utilizados deste dispositivo
  await db
    .delete(inviteCodes)
    .where(
      and(
        eq(inviteCodes.monitoredDeviceId, monitoredDeviceId),
        isNull(inviteCodes.usedAt)
      )
    );

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

  // Tentar até 5 vezes para garantir unicidade
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      await db.insert(inviteCodes).values({
        code,
        monitoredDeviceId,
        expiresAt,
      });
      return { code, expiresAt };
    } catch {
      // Colisão de código (unique constraint) — tentar de novo
    }
  }

  throw new Error("Failed to generate unique invite code after 5 attempts");
}

/**
 * Valida e consome um código de convite.
 * Retorna o deviceId do monitorado se válido, ou null se inválido/expirado.
 */
export async function consumeInviteCode(
  code: string,
  caregiverDeviceId: string
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(inviteCodes)
    .where(
      and(
        eq(inviteCodes.code, code.toUpperCase()),
        isNull(inviteCodes.usedAt),
        gt(inviteCodes.expiresAt, new Date())
      )
    )
    .limit(1);

  if (rows.length === 0) return null;
  const invite = rows[0];

  // Marcar como usado
  await db
    .update(inviteCodes)
    .set({ usedAt: new Date(), caregiverDeviceId })
    .where(eq(inviteCodes.id, invite.id));

  return invite.monitoredDeviceId;
}

/**
 * Retorna o código de convite ativo do monitorado (se existir e não tiver expirado).
 */
export async function getActiveInviteCode(
  monitoredDeviceId: string
): Promise<{ code: string; expiresAt: Date } | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({ code: inviteCodes.code, expiresAt: inviteCodes.expiresAt })
    .from(inviteCodes)
    .where(
      and(
        eq(inviteCodes.monitoredDeviceId, monitoredDeviceId),
        isNull(inviteCodes.usedAt),
        gt(inviteCodes.expiresAt, new Date())
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Caregiving Links
// ---------------------------------------------------------------------------

/**
 * Cria o vínculo entre monitorado e cuidador.
 * Idempotente: se o vínculo já existir, não faz nada.
 */
export async function createCaregivingLink(
  monitoredDeviceId: string,
  caregiverDeviceId: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await db
    .select({ id: caregivingLinks.id })
    .from(caregivingLinks)
    .where(
      and(
        eq(caregivingLinks.monitoredDeviceId, monitoredDeviceId),
        eq(caregivingLinks.caregiverDeviceId, caregiverDeviceId)
      )
    )
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(caregivingLinks).values({ monitoredDeviceId, caregiverDeviceId });
}

/**
 * Remove o vínculo entre cuidador e monitorado.
 */
export async function removeCaregivingLink(
  monitoredDeviceId: string,
  caregiverDeviceId: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(caregivingLinks)
    .where(
      and(
        eq(caregivingLinks.monitoredDeviceId, monitoredDeviceId),
        eq(caregivingLinks.caregiverDeviceId, caregiverDeviceId)
      )
    );
}

/**
 * Retorna todos os cuidadores vinculados a um monitorado.
 */
export async function getCaregiversForMonitored(
  monitoredDeviceId: string
): Promise<Array<{ caregiverDeviceId: string; createdAt: Date }>> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      caregiverDeviceId: caregivingLinks.caregiverDeviceId,
      createdAt: caregivingLinks.createdAt,
    })
    .from(caregivingLinks)
    .where(eq(caregivingLinks.monitoredDeviceId, monitoredDeviceId));
}

/**
 * Retorna o monitorado vinculado a um cuidador (um cuidador → um monitorado).
 */
export async function getMonitoredForCaregiver(
  caregiverDeviceId: string
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ monitoredDeviceId: caregivingLinks.monitoredDeviceId })
    .from(caregivingLinks)
    .where(eq(caregivingLinks.caregiverDeviceId, caregiverDeviceId))
    .limit(1);
  return rows[0]?.monitoredDeviceId ?? null;
}

/**
 * Retorna os Expo push tokens de todos os cuidadores de um monitorado.
 * Usado pelo monitoring job para enviar notificações.
 */
export async function getCaregiverPushTokens(
  monitoredDeviceId: string
): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const links = await getCaregiversForMonitored(monitoredDeviceId);
  if (links.length === 0) return [];

  const tokens: string[] = [];
  for (const link of links) {
    const token = await getPushToken(link.caregiverDeviceId);
    if (token) tokens.push(token);
  }
  return tokens;
}
