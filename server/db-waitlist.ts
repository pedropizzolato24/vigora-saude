/**
 * db-waitlist.ts
 *
 * Lista de espera do site (tabela `waitlist`, ver drizzle/schema.ts). O e-mail
 * chega já normalizado pelo chamador. O UNIQUE do banco decide duplicata:
 * `INSERT IGNORE` não grava (affectedRows 0) quando o e-mail já existe, sem
 * consulta prévia. Escritas lançam sem banco — calar faria o visitante achar
 * que entrou na lista.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { waitlist } from "../drizzle/schema";
import { getDb } from "./db";

export const WAITLIST_REASONS = ["queda", "sem-noticia", "remedio", "internacao", "outro"] as const;
export type WaitlistReason = (typeof WAITLIST_REASONS)[number];

function affectedRows(res: unknown): number {
  return (
    (res as { affectedRows?: number }).affectedRows ??
    (res as Array<{ affectedRows?: number }>)[0]?.affectedRows ??
    0
  );
}

export async function addToWaitlist(input: {
  email: string;
  reasons: WaitlistReason[];
  policyVersion: string;
}): Promise<{ created: true; unsubscribeToken: string } | { created: false }> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const unsubscribeToken = randomBytes(24).toString("base64url");
  const res = await db.insert(waitlist).ignore().values({
    email: input.email,
    reasons: input.reasons,
    policyVersion: input.policyVersion,
    consentAt: new Date(),
    unsubscribeToken,
  });
  return affectedRows(res) > 0 ? { created: true, unsubscribeToken } : { created: false };
}

export async function removeFromWaitlist(token: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const res = await db.delete(waitlist).where(eq(waitlist.unsubscribeToken, token));
  return affectedRows(res) > 0;
}
