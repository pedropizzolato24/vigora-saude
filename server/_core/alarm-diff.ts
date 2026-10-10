/**
 * alarm-diff.ts
 *
 * Compara a lista de alarmes que a conta tinha no servidor com a que acabou de
 * chegar no backup (`userData.put`) e diz o que o usuário tirou do ar. Função
 * pura: sem banco e sem push — quem grava e avisa é `server/alarm-changes.ts`.
 *
 * Por quê: desativar ou apagar um alarme faz o monitoring-job apagar o evento
 * pendente em silêncio (`isAlarmStillArmed`) — o comportamento certo para não
 * gerar alerta falso, mas que deixava o cuidador sem rastro nenhum.
 *
 * A lista vem de um blob opaco do cliente (`z.array(z.unknown())`), então nada
 * aqui pode assumir formato: item ilegível é ignorado, nunca lança.
 */

export type AlarmChangeType = "created" | "deleted" | "disabled" | "rescheduled";

export interface AlarmChange {
  alarmId: string;
  alarmDescription: string;
  changeType: AlarmChangeType;
  oldTime: string | null;
  newTime: string | null;
  /**
   * Quem fez a mudança. O diff do backup (`diffAlarms`) nunca preenche: ali
   * quem mudou foi o próprio idoso (nulo). Só `recordCaregiverAlarmChanges`
   * grava o cuidador. `created` também só nasce lá: o backup não anuncia criação.
   */
  changedByOpenId?: string | null;
}

interface AlarmLike {
  id: string;
  time?: unknown;
  description?: unknown;
  enabled?: unknown;
  repeat?: unknown;
  customDays?: unknown;
}

function isAlarmLike(value: unknown): value is AlarmLike {
  if (!value || typeof value !== "object") return false;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0;
}

/** Lista -> mapa por id. Item ilegível é ignorado; id repetido vale o primeiro. */
function indexById(list: unknown): Map<string, AlarmLike> | null {
  if (!Array.isArray(list)) return null;
  const byId = new Map<string, AlarmLike>();
  for (const item of list) {
    if (isAlarmLike(item) && !byId.has(item.id)) byId.set(item.id, item);
  }
  return byId;
}

/** `enabled` ausente = formato antigo, conta como ligado (mesma regra do monitoring-job). */
const isEnabled = (a: AlarmLike): boolean => a.enabled !== false;

function timeOf(a: AlarmLike): string | null {
  return typeof a.time === "string" && /^\d{1,2}:\d{2}$/.test(a.time) ? a.time : null;
}

function nameOf(a: AlarmLike): string {
  return typeof a.description === "string" ? a.description.trim().slice(0, 255) : "";
}

function daysKey(a: AlarmLike): string {
  if (!Array.isArray(a.customDays)) return "";
  return a.customDays
    .filter((d): d is number => typeof d === "number")
    .sort((x, y) => x - y)
    .join(",");
}

/** Só `custom` usa `customDays`; nos demais ele pode estar velho e não conta. */
function scheduleKey(a: AlarmLike): string {
  const repeat = typeof a.repeat === "string" ? a.repeat : "";
  return `${repeat}|${repeat === "custom" ? daysKey(a) : ""}`;
}

export function diffAlarms(previous: unknown, next: unknown): AlarmChange[] {
  const before = indexById(previous);
  const after = indexById(next);
  // Sem lista anterior válida (conta nova, formato antigo) ou lista nova
  // ilegível não há base de comparação: melhor calar do que acusar.
  if (!before || !after) return [];

  const changes: AlarmChange[] = [];
  for (const [id, old] of before) {
    const now = after.get(id);
    if (!now) {
      changes.push({
        alarmId: id,
        alarmDescription: nameOf(old),
        changeType: "deleted",
        oldTime: timeOf(old),
        newTime: null,
      });
      continue;
    }
    if (isEnabled(old) && !isEnabled(now)) {
      changes.push({
        alarmId: id,
        alarmDescription: nameOf(now) || nameOf(old),
        changeType: "disabled",
        oldTime: timeOf(old),
        newTime: timeOf(now),
      });
      continue;
    }
    // Desligado antes e depois: não tocava e não toca — mudar o horário dele
    // não muda nada para o cuidador.
    if (!isEnabled(now)) continue;
    if (timeOf(old) !== timeOf(now) || scheduleKey(old) !== scheduleKey(now)) {
      changes.push({
        alarmId: id,
        alarmDescription: nameOf(now) || nameOf(old),
        changeType: "rescheduled",
        oldTime: timeOf(old),
        newTime: timeOf(now),
      });
    }
  }
  return changes;
}

const MAX_NAME = 40;

function shortName(c: AlarmChange): string {
  const raw = c.alarmDescription.trim() || c.oldTime || c.newTime || "sem nome";
  return raw.length > MAX_NAME ? `${raw.slice(0, MAX_NAME - 1)}…` : raw;
}

/**
 * Texto do push ao cuidador. Leva o nome do lembrete (decisão D8 do Pedro): o
 * nome é texto livre e passa por Expo/Google/Apple — a Política de Privacidade
 * cita esses provedores (Tarefa 8).
 */
export function buildAlarmChangePush(
  personName: string,
  changes: AlarmChange[],
  actorName?: string
): { title: string; body: string } | null {
  if (changes.length === 0) return null;

  if (changes.length === 1) {
    const c = changes[0];
    const name = shortName(c);
    const timeChanged = !!c.oldTime && !!c.newTime && c.oldTime !== c.newTime;
    let body: string;
    if (actorName) {
      // Mudança feita por um cuidador: o texto diz quem fez e de quem é o lembrete.
      if (c.changeType === "created") {
        body = `${actorName} criou o lembrete "${name}"${c.newTime ? ` (${c.newTime})` : ""} para ${personName}.`;
      } else if (c.changeType === "deleted") {
        body = `${actorName} apagou o lembrete "${name}" de ${personName}.`;
      } else if (c.changeType === "disabled") {
        body = `${actorName} desativou o lembrete "${name}" de ${personName}.`;
      } else if (timeChanged) {
        body = `${actorName} mudou o horário de "${name}" de ${personName} para ${c.newTime}.`;
      } else {
        body = `${actorName} mudou os dias do lembrete "${name}" de ${personName}.`;
      }
    } else if (c.changeType === "created") {
      body = `${personName} criou o lembrete "${name}".`;
    } else if (c.changeType === "deleted") {
      body = `${personName} excluiu o lembrete "${name}".`;
    } else if (c.changeType === "disabled") {
      body = `${personName} desativou o lembrete "${name}".`;
    } else if (timeChanged) {
      body = `${personName} mudou o horário de "${name}" para ${c.newTime}.`;
    } else {
      body = `${personName} mudou os dias do lembrete "${name}".`;
    }
    return { title: "Lembrete alterado — Vigora", body };
  }

  const shown = changes
    .slice(0, 2)
    .map((c) => `"${shortName(c)}"`)
    .join(", ");
  const rest = changes.length - 2;
  const tail = `${shown}${rest > 0 ? ` e mais ${rest}` : ""}`;
  return {
    title: "Lembretes alterados — Vigora",
    body: actorName
      ? `${actorName} alterou ${changes.length} lembretes de ${personName}: ${tail}.`
      : `${personName} alterou ${changes.length} lembretes: ${tail}.`,
  };
}

/** Nome da pessoa monitorada para os textos dos pushes: anamnese > conta > genérico. */
export function pickPersonName(
  anamnesis: unknown,
  accountName: string | null | undefined
): string {
  const fullName =
    anamnesis && typeof anamnesis === "object"
      ? (anamnesis as { fullName?: unknown }).fullName
      : undefined;
  if (typeof fullName === "string" && fullName.trim()) return fullName.trim();
  if (accountName && accountName.trim()) return accountName.trim();
  return "A pessoa que você acompanha";
}
