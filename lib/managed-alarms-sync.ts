/**
 * managed-alarms-sync.ts
 *
 * Busca a lista gerenciada no servidor, aplica no aparelho (cancela e agenda no
 * sistema), troca a lista local e confirma ao servidor (`ack`).
 *
 * A ORDEM é a regra: cancelar -> agendar (esperando cada um) -> REPLACE_ALARMS
 * -> ack -> SET_MANAGEMENT. O ack nunca sai antes de o agendamento terminar, e
 * a versão só conta como aplicada depois que o ack chegou ao servidor.
 * Ver docs da Tarefa 12 (Regras de desenho).
 *
 * Só tipos no topo: o módulo é testável sem React Native. As dependências de
 * verdade (alarm-sync, monitoring-service) entram por import dinâmico em
 * createManagedAlarmsDeps.
 */
import type { Alarm, ManagementInfo } from './app-context';
import type { ManagedAlarm } from '@/shared/managed-alarm';
import { planManagedApply } from './managed-alarms-apply';

export type MineResponse = {
  pendingRequest: null | { id: number; caregiverName: string };
  management: null | { id: number; caregiverOpenId: string; caregiverName: string; since: number };
  list: null | { version: number; alarms: ManagedAlarm[] };
};

export type ManagedSyncResult = 'applied' | 'unchanged' | 'not-managed' | 'offline';

export type ManagedSyncAction =
  | { type: 'REPLACE_ALARMS'; payload: Alarm[] }
  | { type: 'SET_MANAGEMENT'; payload: ManagementInfo | null };

export interface ManagedSyncDeps {
  getLocal(): Alarm[];
  getManagement(): ManagementInfo | null;
  dispatch(action: ManagedSyncAction): void;
  schedule(alarm: Alarm): Promise<Alarm>;
  cancel(alarm: Alarm): Promise<void>;
  fetchMine(): Promise<MineResponse | null>;
  /** LANÇA se a confirmação não chegou ao servidor. */
  ack(version: number, failedAlarmIds: string[]): Promise<void>;
}

// Só o nome do erro vai para o log: a mensagem pode carregar dado do alarme.
const errName = (e: unknown): string => (e instanceof Error ? e.name : typeof e);

async function runOnce(deps: ManagedSyncDeps): Promise<ManagedSyncResult> {
  let mine: MineResponse | null;
  try {
    mine = await deps.fetchMine();
  } catch (e) {
    console.warn('[ManagedAlarms] não foi possível buscar a lista:', errName(e));
    return 'offline';
  }
  if (!mine) return 'offline';

  const current = deps.getManagement();
  const agreement = mine.management;
  if (!agreement) {
    // Sem acordo: os alarmes ficam como estão (spec 3.4); só a edição volta ao idoso.
    if (current) deps.dispatch({ type: 'SET_MANAGEMENT', payload: null });
    return 'not-managed';
  }

  const list = mine.list;
  if (!list) return 'unchanged';

  // `since` identifica o acordo: o acordo novo recomeça na versão 1, e comparar
  // com o appliedVersion de um acordo antigo faria o app ignorar a lista nova.
  const appliedVersion = current && current.since === agreement.since ? current.appliedVersion : 0;
  if (list.version <= appliedVersion) return 'unchanged';

  const plan = planManagedApply(deps.getLocal(), list.alarms);

  // 1. Cancela os removidos e os alterados. Uma falha aqui é registrada e não
  // impede o resto: o agendamento seguinte substitui o mesmo uid.
  for (const alarm of plan.toCancel) {
    try {
      await deps.cancel(alarm);
    } catch (e) {
      console.warn('[ManagedAlarms] o sistema não cancelou um alarme:', errName(e));
    }
  }

  // 2. Agenda os novos e alterados, UM A UM, esperando cada um. A falha de um
  // não derruba os outros: o id vai para failedAlarmIds.
  const scheduled = new Map<string, Alarm>();
  const failed: string[] = [];
  for (const alarm of plan.toSchedule) {
    try {
      scheduled.set(alarm.id, await deps.schedule(alarm));
    } catch (e) {
      failed.push(alarm.id);
      console.warn('[ManagedAlarms] o sistema recusou agendar um alarme:', errName(e));
    }
  }

  // 3. Monta a lista local. Alarme que falhou fica DESLIGADO e sem uids: um
  // alarme que não existe no sistema não pode aparecer ligado (o aparelho
  // pré-registraria um evento e o dead man's switch acusaria o idoso). Como
  // fica diferente do servidor, a próxima aplicação tenta de novo.
  const next = plan.next.map((a) => {
    const done = scheduled.get(a.id);
    if (done) return done;
    if (failed.includes(a.id)) {
      return { ...a, enabled: false, notificationId: undefined, nativeAlarmUids: [] };
    }
    return a;
  });

  // 4. Só agora (TODO o agendamento terminou) a lista local é trocada.
  deps.dispatch({ type: 'REPLACE_ALARMS', payload: next });

  // 5. Confirma. Se não chegar, a versão NÃO avança: a próxima rodada reconfirma.
  try {
    await deps.ack(list.version, failed);
  } catch (e) {
    console.warn('[ManagedAlarms] a confirmação não chegou ao servidor:', errName(e));
    return 'offline';
  }

  deps.dispatch({
    type: 'SET_MANAGEMENT',
    payload: { caregiverName: agreement.caregiverName, since: agreement.since, appliedVersion: list.version },
  });
  return 'applied';
}

let inFlight: Promise<ManagedSyncResult> | null = null;
let rerunRequested = false;

/**
 * Uma execução por vez. Quem chega no meio de uma execução reaproveita a
 * promessa em curso e pede UMA nova rodada ao final (a versão pode ter subido
 * enquanto a anterior aplicava). Duas execuções em paralelo agendariam o mesmo
 * alarme duas vezes.
 */
export function syncManagedAlarms(deps: ManagedSyncDeps): Promise<ManagedSyncResult> {
  if (inFlight) {
    rerunRequested = true;
    return inFlight;
  }
  inFlight = (async () => {
    let result = await runOnce(deps);
    if (rerunRequested) {
      rerunRequested = false;
      result = await runOnce(deps);
    }
    return result;
  })().finally(() => {
    inFlight = null;
    rerunRequested = false;
  });
  return inFlight;
}

function isMineResponse(value: unknown): value is MineResponse {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return 'pendingRequest' in o && 'management' in o && 'list' in o;
}

/**
 * Monta as dependências de verdade. Imports dinâmicos de propósito: este módulo
 * não pode puxar React Native para os testes, e alarm-sync importa o tipo Alarm
 * de app-context (import estático fecharia um ciclo).
 */
export function createManagedAlarmsDeps(
  base: Pick<ManagedSyncDeps, 'getLocal' | 'getManagement' | 'dispatch'>
): ManagedSyncDeps {
  return {
    ...base,
    schedule: async (alarm) => (await import('./alarm-sync')).scheduleFullAlarm(alarm),
    cancel: async (alarm) => (await import('./alarm-sync')).cancelFullAlarm(alarm),
    fetchMine: async () => {
      const { trpcQuery } = await import('./monitoring-service');
      const result = await trpcQuery('managedAlarms.mine', null);
      return isMineResponse(result) ? result : null;
    },
    ack: async (version, failedAlarmIds) => {
      const { trpcMutation } = await import('./monitoring-service');
      const result = await trpcMutation('managedAlarms.ack', { version, failedAlarmIds });
      // trpcMutation devolve null em TODA falha e nunca lança.
      if (result === null) throw new Error('a confirmação não chegou ao servidor');
    },
  };
}

// --- Barramento: "busque a lista agora" ---------------------------------------

export type ManagedSyncRequest = { openRequest: boolean };

const listeners = new Set<(request: ManagedSyncRequest) => void>();

/** Quem sincroniza (MonitoringInitializer) e quem mostra o pedido (diálogo) assinam aqui. */
export function onManagedSyncRequested(listener: (request: ManagedSyncRequest) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Pede a busca da lista agora (push recebido, toque na notificação, aceite do
 * pedido). `openRequest: true` também manda o diálogo do pedido reaparecer.
 */
export function requestManagedSync(opts: { openRequest?: boolean } = {}): void {
  const request: ManagedSyncRequest = { openRequest: opts.openRequest === true };
  listeners.forEach((listener) => {
    try {
      listener(request);
    } catch (e) {
      console.warn('[ManagedAlarms] ouvinte falhou:', errName(e));
    }
  });
}
