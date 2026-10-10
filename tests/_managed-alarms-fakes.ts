/**
 * _managed-alarms-fakes.ts
 *
 * Dublês em memória para testar o router `managedAlarms` e o `link.revokeLink`
 * sem banco. Cada dublê espelha a regra do módulo real (uma linha aberta por
 * idoso, versão que sobe a cada gravação, ack que ignora versão velha) para os
 * testes verificarem COMPORTAMENTO do router, não só "a função foi chamada".
 * O banco de verdade é testado nas Tarefas 4 e 9 a 11.
 *
 * Uso (no topo do arquivo de teste, antes do import do router):
 *   vi.mock("../server/db-alarm-management", async () => (await import("./_managed-alarms-fakes")).fakeManagementModule);
 */
import { TRPCError } from "@trpc/server";
import { vi } from "vitest";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "../server/_core/context";
import type { ManagedAlarm } from "../shared/managed-alarm";

export interface FakeAgreement {
  id: number;
  monitoredOpenId: string;
  caregiverOpenId: string;
  status: "pending" | "active" | "ended";
  endedReason: string | null;
  requestedAt: Date;
  respondedAt: Date | null;
  endedAt: Date | null;
}

export interface FakeList {
  monitoredOpenId: string;
  version: number;
  alarms: ManagedAlarm[];
  appliedVersion: number;
  appliedAlarms: ManagedAlarm[];
  failedAlarmIds: string[];
  appliedAt: Date | null;
  updatedByOpenId: string;
  updatedAt: Date;
  visibleNoticeSentForVersion: number;
}

export const store = {
  agreements: [] as FakeAgreement[],
  lists: new Map<string, FakeList>(),
  links: [] as { caregiverOpenId: string; monitoredOpenId: string }[],
  users: new Map<string, User>(),
  anamnesis: new Map<string, unknown>(),
  tokens: new Map<string, string[]>(),
  nextId: 1,
};

export function makeUser(openId: string, userType: "monitored" | "caregiver", name: string | null): User {
  return {
    id: 1,
    openId,
    name,
    email: `${openId}@example.com`,
    phone: null,
    userType,
    birthDate: null,
    bloodType: null,
    loginMethod: "google",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

/**
 * Cenário padrão: Maria (idoso) e João (outro idoso); Ana e Bia cuidam da Maria;
 * Dina cuida do João; Carol é cuidadora SEM vínculo; Rita cuida do "rita-mon".
 */
export function resetStore(): void {
  store.agreements = [];
  store.lists = new Map();
  store.nextId = 1;
  store.users = new Map([
    ["maria", makeUser("maria", "monitored", "Conta Maria")],
    ["joao", makeUser("joao", "monitored", "João")],
    ["rita-mon", makeUser("rita-mon", "monitored", "Seu Rita")],
    ["ana", makeUser("ana", "caregiver", "Ana")],
    ["bia", makeUser("bia", "caregiver", "Bia")],
    ["carol", makeUser("carol", "caregiver", "Carol")],
    ["dina", makeUser("dina", "caregiver", "Dina")],
    ["rita", makeUser("rita", "caregiver", "Rita")],
  ]);
  store.anamnesis = new Map([["maria", { fullName: "Vó Maria" }]]);
  store.links = [
    { caregiverOpenId: "ana", monitoredOpenId: "maria" },
    { caregiverOpenId: "bia", monitoredOpenId: "maria" },
    { caregiverOpenId: "dina", monitoredOpenId: "joao" },
    { caregiverOpenId: "rita", monitoredOpenId: "rita-mon" },
  ];
  store.tokens = new Map([
    ["maria", ["ExpoTok[maria]"]],
    ["joao", ["ExpoTok[joao]"]],
    ["ana", ["ExpoTok[ana]"]],
    ["bia", ["ExpoTok[bia]"]],
    ["dina", ["ExpoTok[dina]"]],
  ]);
}

export function makeCtx(openId: string): TrpcContext {
  const user = store.users.get(openId);
  if (!user) throw new Error(`usuário de teste inexistente: ${openId}`);
  return {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

export function sampleAlarm(over: Partial<ManagedAlarm> = {}): ManagedAlarm {
  return {
    id: "a1",
    time: "08:00",
    description: "Losartana",
    enabled: true,
    repeat: "daily",
    sound: true,
    vibration: true,
    kind: "medication",
    ...over,
  };
}

/** Pedido pendente de `caregiverOpenId` para `monitoredOpenId`. */
export function seedPendingRequest(caregiverOpenId = "ana", monitoredOpenId = "maria"): FakeAgreement {
  const row: FakeAgreement = {
    id: store.nextId++,
    monitoredOpenId,
    caregiverOpenId,
    status: "pending",
    endedReason: null,
    requestedAt: new Date(),
    respondedAt: null,
    endedAt: null,
  };
  store.agreements.push(row);
  return row;
}

/** Acordo ativo + lista gerenciada na versão 1, já confirmada pelo celular. */
export function seedActiveAgreement(
  opts: { caregiverOpenId?: string; monitoredOpenId?: string; alarms?: ManagedAlarm[] } = {}
): FakeAgreement {
  const caregiverOpenId = opts.caregiverOpenId ?? "ana";
  const monitoredOpenId = opts.monitoredOpenId ?? "maria";
  const alarms = opts.alarms ?? [sampleAlarm()];
  const row: FakeAgreement = {
    id: store.nextId++,
    monitoredOpenId,
    caregiverOpenId,
    status: "active",
    endedReason: null,
    requestedAt: new Date(Date.now() - 86_400_000),
    respondedAt: new Date(Date.now() - 3_600_000),
    endedAt: null,
  };
  store.agreements.push(row);
  store.lists.set(monitoredOpenId, {
    monitoredOpenId,
    version: 1,
    alarms: alarms.map((a) => ({ ...a })),
    appliedVersion: 1,
    appliedAlarms: alarms.map((a) => ({ ...a })),
    failedAlarmIds: [],
    appliedAt: new Date(),
    updatedByOpenId: monitoredOpenId,
    updatedAt: new Date(),
    visibleNoticeSentForVersion: 0,
  });
  return row;
}

const openOf = (monitoredOpenId: string) =>
  store.agreements.find((a) => a.monitoredOpenId === monitoredOpenId && a.status !== "ended");

// --- ../server/db-alarm-management -----------------------------------------------

export const fakeManagementModule = {
  getOpenManagementForMonitored: vi.fn(async (monitoredOpenId: string) => {
    const row = openOf(monitoredOpenId);
    return row ? { ...row } : null;
  }),
  getActiveManagementForMonitored: vi.fn(async (monitoredOpenId: string) => {
    const row = store.agreements.find((a) => a.monitoredOpenId === monitoredOpenId && a.status === "active");
    return row ? { ...row } : null;
  }),
  getOpenManagementForCaregiver: vi.fn(async (caregiverOpenId: string) => {
    const row = store.agreements.find((a) => a.caregiverOpenId === caregiverOpenId && a.status !== "ended");
    return row ? { ...row } : null;
  }),
  createManagementRequest: vi.fn(async (caregiverOpenId: string, monitoredOpenId: string) => {
    if (openOf(monitoredOpenId)) {
      throw new TRPCError({ code: "CONFLICT", message: "Já existe um pedido ou acordo para esta pessoa." });
    }
    const row = seedPendingRequest(caregiverOpenId, monitoredOpenId);
    return { ...row };
  }),
  activateManagement: vi.fn(async (id: number, list: ManagedAlarm[], monitoredOpenId: string) => {
    const row = store.agreements.find((a) => a.id === id);
    if (!row) return;
    row.status = "active";
    row.respondedAt = new Date();
    store.lists.set(monitoredOpenId, {
      monitoredOpenId,
      version: 1,
      alarms: list.map((a) => ({ ...a })),
      appliedVersion: 1,
      appliedAlarms: list.map((a) => ({ ...a })),
      failedAlarmIds: [],
      appliedAt: new Date(),
      updatedByOpenId: monitoredOpenId,
      updatedAt: new Date(),
      visibleNoticeSentForVersion: 0,
    });
  }),
  endManagement: vi.fn(async (id: number, reason: string) => {
    const row = store.agreements.find((a) => a.id === id);
    if (!row) return;
    row.status = "ended";
    row.endedReason = reason;
    row.endedAt = new Date();
    if (reason === "declined") row.respondedAt = new Date();
    store.lists.delete(row.monitoredOpenId);
  }),
  getExpiredManagementRequests: vi.fn(async () => []),
  getManagementHistory: vi.fn(async () => []),
};

// --- ../server/db-managed-alarm-list -----------------------------------------------

export class FakeManagedListConflictError extends Error {}

export const fakeListModule = {
  ManagedListConflictError: FakeManagedListConflictError,
  getManagedList: vi.fn(async (monitoredOpenId: string) => {
    const row = store.lists.get(monitoredOpenId);
    return row ? { ...row, alarms: row.alarms.map((a) => ({ ...a })) } : null;
  }),
  writeManagedList: vi.fn(
    async (monitoredOpenId: string, baseVersion: number, alarms: ManagedAlarm[], updatedByOpenId: string) => {
      const row = store.lists.get(monitoredOpenId);
      if (!row || row.version !== baseVersion) throw new FakeManagedListConflictError("versão mudou");
      row.version += 1;
      row.alarms = alarms.map((a) => ({ ...a }));
      row.updatedByOpenId = updatedByOpenId;
      row.updatedAt = new Date();
      return row.version;
    }
  ),
  recordManagedAck: vi.fn(async (monitoredOpenId: string, version: number, failedAlarmIds: string[]) => {
    const row = store.lists.get(monitoredOpenId);
    if (!row) return false;
    // Ack velho (<= aplicada) ou de versão que já foi superada/inexistente: ignorado.
    if (version <= row.appliedVersion || version !== row.version) return false;
    row.appliedVersion = version;
    row.appliedAlarms = row.alarms.map((a) => ({ ...a }));
    row.failedAlarmIds = [...failedAlarmIds];
    row.appliedAt = new Date();
    return true;
  }),
  getListsNeedingVisibleNotice: vi.fn(async () => []),
  markVisibleNoticeSent: vi.fn(async () => undefined),
};

// --- ../server/db-links --------------------------------------------------------------

export const fakeLinksModule = {
  getActiveLinkForCaregiver: vi.fn(async (caregiverOpenId: string) => {
    const link = store.links.find((l) => l.caregiverOpenId === caregiverOpenId);
    return link ? { id: 1, ...link, status: "active" } : null;
  }),
  getActiveCaregiversForMonitored: vi.fn(async (monitoredOpenId: string) =>
    store.links.filter((l) => l.monitoredOpenId === monitoredOpenId).map((l) => ({ id: 1, ...l, status: "active" }))
  ),
  revokeLink: vi.fn(async (caregiverOpenId: string, monitoredOpenId: string) => {
    store.links = store.links.filter(
      (l) => !(l.caregiverOpenId === caregiverOpenId && l.monitoredOpenId === monitoredOpenId)
    );
  }),
  createInvite: vi.fn(),
  consumeInviteByCode: vi.fn(),
  getInviteByCode: vi.fn(),
  getRecentMissedEventsForAccount: vi.fn(async () => []),
  getRecentWarningsForAccount: vi.fn(async () => []),
  upsertActiveLink: vi.fn(),
};

// --- ../server/db-push e ../server/push ------------------------------------------------

export const fakePushDbModule = {
  getPushTokensForOpenIds: vi.fn(async (openIds: string[]) =>
    openIds.flatMap((openId) => (store.tokens.get(openId) ?? []).map((token) => ({ token, openId })))
  ),
  getPushTokensWithOwner: vi.fn(async (openIds: string[]) =>
    openIds.flatMap((openId) => (store.tokens.get(openId) ?? []).map((token) => ({ token, openId })))
  ),
  countPushTokens: vi.fn(async (openId: string) => (store.tokens.get(openId) ?? []).length),
  upsertPushToken: vi.fn(async () => undefined),
  deleteOwnedPushToken: vi.fn(async () => false),
  deletePushToken: vi.fn(async () => undefined),
};

export const fakePushModule = {
  sendExpoPush: vi.fn(async () => 1),
  sendExpoDataPush: vi.fn(async (tokens: string[]) =>
    tokens.map((token) => ({ token, ticketId: "ticket", deviceNotRegistered: false }))
  ),
  fetchExpoReceipts: vi.fn(async () => ({})),
};

// --- ../server/db (só o que os routers leem) -------------------------------------------

export const fakeDbOverrides = {
  getUserByOpenId: vi.fn(async (openId: string) => store.users.get(openId)),
  getUserData: vi.fn(async (openId: string) =>
    store.anamnesis.has(openId) ? { anamnesis: store.anamnesis.get(openId), alarms: [] } : undefined
  ),
};
