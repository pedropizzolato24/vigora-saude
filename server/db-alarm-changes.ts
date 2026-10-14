/**
 * db-alarm-changes.ts
 *
 * Persistência do registro de mudanças de alarme (ver `alarmChanges` em
 * drizzle/schema.ts e `server/_core/alarm-diff.ts`).
 */
import { desc, eq } from "drizzle-orm";
import { alarmChanges, type InsertAlarmChange } from "../drizzle/schema";
import { getDb } from "./db";

export async function insertAlarmChanges(rows: InsertAlarmChange[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  if (!db) return;
  await db.insert(alarmChanges).values(rows);
}

/** Mudanças da conta, MAIS RECENTES PRIMEIRO. */
export async function getRecentAlarmChanges(openId: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(alarmChanges)
    .where(eq(alarmChanges.openId, openId))
    .orderBy(desc(alarmChanges.createdAt), desc(alarmChanges.id))
    .limit(limit);
}
