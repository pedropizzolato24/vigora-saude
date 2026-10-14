/**
 * managed-alarms-caregiver.ts
 *
 * Regras puras da área "Alarmes de [nome]" do cuidador (spec 4.5 e 6.1): qual
 * estado a tela mostra, qual frase descreve a entrega de cada alarme ao celular
 * do idoso, e como um erro de gravação vira mensagem. Sem React para ser testável.
 * Nada aqui interpreta valor de saúde: são só lembretes que uma pessoa criou.
 */
import type { AlarmFormValues } from '@/lib/alarm-form';
import { PENDING_HINT_HOURS, type ManagedAlarm } from '@/shared/managed-alarm';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Lista gerenciada como a rota `managedAlarms.forCaregiver` devolve (datas em epoch-ms). */
export type ManagedListView = {
  version: number;
  alarms: ManagedAlarm[];
  appliedVersion: number;
  failedAlarmIds: string[];
  appliedAt: number | null;
  updatedAt: number;
};

/** Acordo como a rota devolve; `null` quando não há pedido nem acordo aberto. */
export type ManagementView = {
  id: number;
  status: 'pending' | 'active';
  caregiverOpenId: string;
  isMine: boolean;
  managerName: string | null;
  requestedAt: number;
  respondedAt: number | null;
  expiresAt: number | null;
};

export type ScreenMode = 'no-agreement' | 'pending' | 'pending-other' | 'active-mine' | 'active-other';

export function screenMode(management: ManagementView | null): ScreenMode {
  if (!management) return 'no-agreement';
  if (management.status === 'pending') return management.isMine ? 'pending' : 'pending-other';
  return management.isMine ? 'active-mine' : 'active-other';
}

/** "vence em N dias" (arredonda para cima); vazio quando o servidor não informou o prazo. */
export function requestExpiryText(expiresAt: number | null, now: number): string {
  if (expiresAt == null) return '';
  const days = Math.ceil((expiresAt - now) / DAY_MS);
  if (days <= 0) return 'vence hoje';
  return days === 1 ? 'vence em 1 dia' : `vence em ${days} dias`;
}

export type DeliveryStatus = 'confirmed' | 'pending' | 'failed';

/**
 * Estado de UM alarme no celular do idoso. Enquanto a versão mais nova não foi
 * confirmada, tudo está pendente: `failedAlarmIds` descreve a versão ANTERIOR
 * confirmada e pode já não valer para o que o cuidador acabou de gravar.
 */
export function alarmDeliveryStatus(
  list: Pick<ManagedListView, 'version' | 'appliedVersion' | 'failedAlarmIds'>,
  alarmId: string
): DeliveryStatus {
  if (list.appliedVersion < list.version) return 'pending';
  return list.failedAlarmIds.includes(alarmId) ? 'failed' : 'confirmed';
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "14:05" se foi hoje; "09/10 14:05" se foi em outro dia (horário local do cuidador). */
function formatSince(ts: number, now: number): string {
  const d = new Date(ts);
  const n = new Date(now);
  const hhmm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay ? hhmm : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${hhmm}`;
}

function pendingSentence(name: string, since: number, now: number): string {
  const base = `Ainda não chegou ao celular de ${name} (desde ${formatSince(since, now)}).`;
  return now - since >= PENDING_HINT_HOURS * HOUR_MS ? `${base} Peça para ${name} abrir o Vigora.` : base;
}

/** As três frases da spec 4.5 para um alarme. */
export function deliveryText(
  status: DeliveryStatus,
  ctx: { name: string; alarm: Pick<ManagedAlarm, 'time' | 'description'>; pendingSince: number; now: number }
): string {
  if (status === 'confirmed') return `Tudo certo no celular de ${ctx.name}.`;
  if (status === 'pending') return pendingSentence(ctx.name, ctx.pendingSince, ctx.now);
  const label = ctx.alarm.description.trim() || 'Lembrete';
  return `O celular de ${ctx.name} não conseguiu agendar: ${label} ${ctx.alarm.time}.`;
}

/** Resumo no topo da lista (spec 4.5: "por alarme e no topo"). */
export function listSummary(
  list: ManagedListView,
  name: string,
  now: number
): { tone: 'ok' | 'pending' | 'failed'; text: string } {
  if (list.appliedVersion < list.version) {
    return { tone: 'pending', text: pendingSentence(name, list.updatedAt, now) };
  }
  const failed = list.alarms.filter((a) => list.failedAlarmIds.includes(a.id)).length;
  if (failed > 0) {
    const noun = failed === 1 ? '1 alarme' : `${failed} alarmes`;
    return { tone: 'failed', text: `O celular de ${name} não conseguiu agendar ${noun}. Veja abaixo.` };
  }
  return { tone: 'ok', text: `Tudo certo no celular de ${name}.` };
}

const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function alarmRepeatLabel(alarm: Pick<ManagedAlarm, 'repeat' | 'customDays'>): string {
  switch (alarm.repeat) {
    case 'weekdays':
      return 'Dias úteis';
    case 'weekends':
      return 'Fins de semana';
    case 'custom': {
      const days = [...new Set(alarm.customDays ?? [])].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
      return days.length > 0 ? days.map((d) => DAY_SHORT[d]).join(', ') : 'Sem dias escolhidos';
    }
    default:
      return 'Todos os dias';
  }
}

/**
 * O que vai para createAlarm/updateAlarm: só os campos da lista gerenciada.
 * O formulário já não traz `id`, mas o "Desligar/Ligar" da linha passa o alarme
 * inteiro, e `notificationId`/`nativeAlarmUids` nunca saem do aparelho do idoso.
 * O servidor ainda normaliza (check-in diário, atraso só no check-in).
 */
export function toManagedInput(v: AlarmFormValues): Omit<ManagedAlarm, 'id'> {
  return {
    time: v.time,
    description: v.description,
    enabled: v.enabled,
    repeat: v.repeat,
    ...(v.customDays ? { customDays: v.customDays } : {}),
    sound: v.sound,
    vibration: v.vibration,
    ...(v.kind ? { kind: v.kind } : {}),
    ...(v.escalateAfterMinutes ? { escalateAfterMinutes: v.escalateAfterMinutes } : {}),
  };
}

export const STALE_LIST_MESSAGE = 'A lista mudou. Confira de novo.';
const NETWORK_MESSAGE = 'Não foi possível falar com o servidor. Confira a internet e tente de novo.';
const INVALID_MESSAGE = 'Não foi possível salvar. Confira os dados e tente de novo.';

export type MutationFailure = { kind: 'conflict' | 'server' | 'network'; message: string };

/**
 * Erro de uma rota `managedAlarms.*` -> mensagem para o toast. `staleList` diz
 * que a chamada era uma gravação na lista (create/update/delete): aí CONFLICT
 * significa "a lista mudou" (spec 4.2). As mensagens do servidor já são em
 * português; o JSON de validação do Zod e os erros sem resposta não vão para a tela.
 */
export function describeMutationError(err: unknown, opts: { staleList: boolean }): MutationFailure {
  const e = err as { data?: { code?: unknown }; message?: unknown } | null | undefined;
  const code = typeof e?.data?.code === 'string' ? e.data.code : null;
  if (code === 'CONFLICT' && opts.staleList) return { kind: 'conflict', message: STALE_LIST_MESSAGE };
  const message = typeof e?.message === 'string' ? e.message.trim() : '';
  if (!code || code === 'INTERNAL_SERVER_ERROR' || !message) return { kind: 'network', message: NETWORK_MESSAGE };
  if (message.startsWith('[') || message.startsWith('{')) return { kind: 'server', message: INVALID_MESSAGE };
  return { kind: 'server', message };
}
