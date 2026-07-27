import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2";
import { InsertUser, InsertUserData, userData, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Lazily create the drizzle instance with a properly configured connection pool.
 *
 * Uses keepAlive and reconnect settings to survive MySQL's idle connection timeout
 * (which causes ECONNRESET errors after ~8 hours of inactivity).
 *
 * The pool is created once and reused across all requests.
 */
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Create a pool with keepAlive to prevent ECONNRESET from MySQL idle timeout
      // (MySQL closes idle connections after ~8 hours by default)
      const pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 30000, // 30 seconds
        connectTimeout: 10000,
      });
      _db = drizzle(pool);
      console.log("[Database] Connection pool created");
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Aplica as migrações pendentes antes do servidor aceitar tráfego.
 *
 * O deploy de 23/07/2026 subiu código que lê account_liveness.batteryExempt sem
 * a migração 0012 ter sido aplicada em produção. O servidor subiu "saudável", o
 * job do dead man's switch quebrou na primeira query e ficou 27h morto sem
 * ninguém perceber. Rodar aqui troca essa falha silenciosa por um deploy que
 * falha alto: o caller derruba o processo e o Railway mantém a versão anterior
 * no ar em vez de servir uma com schema divergente.
 *
 * Sem DATABASE_URL (dev local sem banco) não há o que migrar — mesma tolerância
 * do resto do arquivo, em vez de impedir o boot.
 */
export async function runPendingMigrations(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] DATABASE_URL ausente — migrações ignoradas");
    return;
  }
  // Caminho relativo ao cwd, como o out do drizzle.config.ts: os scripts npm
  // sempre rodam a partir da raiz do repo, em dev e no Railway.
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[Database] Migrações em dia");
}

/**
 * Lightweight DB liveness check for /api/health. Returns true only if a real
 * query round-trips. A health endpoint that can't see the DB must report
 * unhealthy so an external monitor catches a Railway/MySQL outage that would
 * silently disarm the dead man's switch.
 */
export async function checkDatabase(): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "phone", "birthDate", "bloodType"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.userType !== undefined) {
      values.userType = user.userType;
      updateSet.userType = user.userType;
    }

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// --- User Data (cloud backup) -------------------------------------------------

export async function getUserData(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user data: database not available");
    return undefined;
  }
  const result = await db
    .select()
    .from(userData)
    .where(eq(userData.openId, openId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertUserData(data: InsertUserData): Promise<void> {
  if (!data.openId) {
    throw new Error("openId is required to upsert user data");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user data: database not available");
    return;
  }

  const set = {
    anamnesis: data.anamnesis ?? null,
    emergencyContacts: data.emergencyContacts ?? null,
    alarms: data.alarms ?? null,
    settings: data.settings ?? null,
    healthMetrics: data.healthMetrics ?? null,
    profile: data.profile ?? null,
    dataUpdatedAt: data.dataUpdatedAt ?? 0,
  };

  await db
    .insert(userData)
    .values({ openId: data.openId, ...set })
    .onDuplicateKeyUpdate({ set });
}
