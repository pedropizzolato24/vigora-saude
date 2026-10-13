/**
 * managed-alarms-apply.ts
 *
 * Função pura: dada a lista local e a lista gerenciada do servidor, diz o que
 * cancelar, o que agendar e qual lista passa a valer. Quem executa (cancelar,
 * agendar, trocar o estado, confirmar) é managed-alarms-sync.ts, na ordem certa.
 */
import type { Alarm } from './app-context';
import type { ManagedAlarm } from '@/shared/managed-alarm';

export interface ManagedApplyPlan {
  /** Alarmes LOCAIS (com os uids do sistema) a cancelar: removidos e alterados. */
  toCancel: Alarm[];
  /** Alarmes a agendar (sem uids): novos e alterados que estão ligados. */
  toSchedule: Alarm[];
  /** A lista que vira o estado local. Inalterados mantêm os uids que já tinham. */
  next: Alarm[];
}

/** Dias só contam em 'custom', e em qualquer ordem. */
function customDaysKey(a: { repeat: string; customDays?: number[] }): string {
  if (a.repeat !== 'custom') return '';
  return [...(a.customDays ?? [])].sort((x, y) => x - y).join(',');
}

/**
 * Igual em tudo o que o servidor controla. Ignora `notificationId` e
 * `nativeAlarmUids` (são do aparelho). Qualquer diferença reagenda: texto,
 * som e vibração fazem parte do agendamento nativo.
 */
export function sameManagedFields(local: Alarm, server: ManagedAlarm): boolean {
  const kind = server.kind ?? 'medication';
  if ((local.kind ?? 'medication') !== kind) return false;
  if (kind === 'checkin' && (local.escalateAfterMinutes ?? null) !== (server.escalateAfterMinutes ?? null)) {
    return false;
  }
  return (
    local.time === server.time &&
    local.description === server.description &&
    local.enabled === server.enabled &&
    local.repeat === server.repeat &&
    customDaysKey(local) === customDaysKey(server) &&
    local.sound === server.sound &&
    local.vibration === server.vibration
  );
}

export function planManagedApply(local: Alarm[], server: ManagedAlarm[]): ManagedApplyPlan {
  const serverIds = new Set(server.map((s) => s.id));
  const localById = new Map(local.map((a) => [a.id, a] as const));

  const toCancel = local.filter((a) => !serverIds.has(a.id));
  const toSchedule: Alarm[] = [];
  const next: Alarm[] = [];

  for (const s of server) {
    const current = localById.get(s.id);
    if (current && sameManagedFields(current, s)) {
      next.push(current);
      continue;
    }
    // Alterado: cancela o antigo pelos uids que ele tem (um alarme semanal
    // pode ter virado diário, e os _wd<n> antigos só saem por aqui).
    if (current) toCancel.push(current);
    const fresh: Alarm = { ...s };
    if (fresh.enabled) toSchedule.push(fresh);
    next.push(fresh);
  }

  return { toCancel, toSchedule, next };
}
