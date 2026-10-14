/**
 * alarm-kind.ts
 *
 * O check-in "Está tudo bem?" é um alarme como os de remédio (mesmo agendador,
 * mesma tela de alarme, mesmo caminho de escalação), distinguido por `kind`.
 * Alarme SEM `kind` é remédio: tudo que já está gravado no aparelho e no
 * servidor antes da Fase 3 continua valendo.
 *
 * Aqui ficam as regras puras: filtros por tipo, o atraso de aviso e os textos
 * que mudam de um tipo para o outro. Os textos de REMÉDIO são exatamente os que
 * já existiam (testes travam isso).
 */

export type AlarmKind = 'medication' | 'checkin';

export const CHECKIN_ESCALATE_OPTIONS = [5, 10, 15, 30] as const;
export type EscalateMinutes = (typeof CHECKIN_ESCALATE_OPTIONS)[number];

/** Quando o campo está ausente ou inválido. */
export const DEFAULT_ESCALATE_MINUTES: EscalateMinutes = 5;
/** Padrão de um check-in NOVO criado pelo usuário. */
export const NEW_CHECKIN_ESCALATE_MINUTES: EscalateMinutes = 15;
/** Check-in migrado do sistema antigo: a janela de 30 min que o usuário já tinha. */
export const MIGRATED_CHECKIN_ESCALATE_MINUTES: EscalateMinutes = 30;

/** Id fixo do check-in migrado: um ADD_ALARM com este id substitui o alarme existente em vez de duplicar. Diferente de 'checkin-daily' (id legado do servidor). */
export const MIGRATED_CHECKIN_ALARM_ID = '6f1c2b7e-9a4d-4c3e-8b1f-2d5e7a9c0b31';

type KindLike = { kind?: string | null };

export const isCheckinAlarm = (a: KindLike): boolean => a.kind === 'checkin';
export const medicationAlarms = <T extends KindLike>(alarms: T[]): T[] =>
  alarms.filter((a) => !isCheckinAlarm(a));
export const checkinAlarms = <T extends KindLike>(alarms: T[]): T[] =>
  alarms.filter(isCheckinAlarm);

type EnabledLike = KindLike & { enabled: boolean };

/** Remédios ligados + check-ins ligados: o número do selo da aba "Alarmes". */
export function activeAlarmCount(alarms: EnabledLike[]): number {
  return (
    medicationAlarms(alarms).filter((a) => a.enabled).length +
    checkinAlarms(alarms).filter((a) => a.enabled).length
  );
}

/** Linhas de status dos dois cartões da tela "Alarmes" (hub de remédios e check-in). */
export function alarmHubStatus(
  alarms: (EnabledLike & { time: string })[],
  now: Date = new Date()
): { medicationText: string; checkinText: string } {
  const meds = medicationAlarms(alarms).filter((a) => a.enabled).length;
  const medicationText =
    meds === 0 ? 'Nenhum lembrete ativo' : meds === 1 ? '1 lembrete ativo' : `${meds} lembretes ativos`;

  // Próximo check-in: o de menor distância até agora, dando a volta na meia-noite.
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const distance = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const minutes = h * 60 + m;
    return minutes >= nowMinutes ? minutes - nowMinutes : minutes + 1440 - nowMinutes;
  };
  const next = [...checkinAlarms(alarms).filter((a) => a.enabled)].sort(
    (a, b) => distance(a.time) - distance(b.time)
  )[0];
  return {
    medicationText,
    checkinText: next ? `Próximo: ${next.time}` : 'Nenhum check-in ativo',
  };
}

export function normalizeEscalateMinutes(value: unknown): EscalateMinutes {
  return (CHECKIN_ESCALATE_OPTIONS as readonly unknown[]).includes(value)
    ? (value as EscalateMinutes)
    : DEFAULT_ESCALATE_MINUTES;
}

/** Segundos da contagem da alarm-ring para um check-in (remédio usa `settings.timerDuration`). */
export function escalateSeconds(alarm: { escalateAfterMinutes?: unknown }): number {
  return normalizeEscalateMinutes(alarm.escalateAfterMinutes) * 60;
}

/** Campos extras do evento pré-registrado no servidor (`monitoring.createEvent`). */
export function serverEventExtras(
  alarm: KindLike & { escalateAfterMinutes?: unknown }
): { kind?: 'checkin'; graceMinutes?: number } {
  return isCheckinAlarm(alarm)
    ? { kind: 'checkin', graceMinutes: normalizeEscalateMinutes(alarm.escalateAfterMinutes) }
    : {};
}

export interface AlarmTexts {
  /** Android: título da notificação do serviço nativo. */
  nativeTitle: string;
  nativeBody: string;
  /** Android: texto do botão "Dispensar" da notificação. */
  dismissText: string;
  /** iOS < 26 / web: notificação do expo-notifications. */
  notificationTitle: string;
  notificationBody: string;
  /** iOS 26+: título do alarme do AlarmKit. */
  alarmKitTitle: string;
  /** iOS 26+: rótulo do botão de parar do AlarmKit (é a confirmação). */
  stopButtonLabel: string;
}

export function alarmTexts(alarm: {
  kind?: string | null;
  description?: string;
  time: string;
}): AlarmTexts {
  if (isCheckinAlarm(alarm)) {
    return {
      nativeTitle: '💚 Vigora - Check-in',
      nativeBody: 'Está tudo bem? Toque aqui para confirmar.',
      dismissText: 'Estou bem',
      notificationTitle: '💚 Check-in: está tudo bem?',
      notificationBody: `Hora do seu check-in: ${alarm.time}. Toque para confirmar que está tudo bem.`,
      alarmKitTitle: 'Check-in: está tudo bem?',
      stopButtonLabel: 'Estou bem',
    };
  }
  const description = alarm.description;
  return {
    nativeTitle: '⏰ Vigora - Alarme de Medicamento',
    nativeBody: description
      ? `${description} - Toque para confirmar que tomou o medicamento`
      : 'Toque aqui para confirmar que tomou o medicamento',
    dismissText: 'Dispensar',
    notificationTitle: `⏰ ${description || 'Alarme'}`,
    notificationBody: description
      ? `Hora do alarme: ${alarm.time} - ${description}`
      : `Hora do alarme: ${alarm.time}`,
    alarmKitTitle: description || 'Hora do remédio',
    stopButtonLabel: 'Desligar',
  };
}

const MEDICATION_RING_COPY = {
  topLabel: 'ALARME',
  fallbackName: 'Alarme',
  countdownLabel: 'Mensagem de emergência em',
  countdownHint: 'Toque em "Desligar" para cancelar o envio',
  escalatedText: 'Mensagem de emergência enviada para seus contatos',
  dismissLabel: 'Desligar Alarme',
  dismissA11y: 'Desligar alarme',
} as const;

const CHECKIN_RING_COPY = {
  topLabel: 'CHECK-IN',
  fallbackName: 'Está tudo bem?',
  countdownLabel: 'Aviso aos seus contatos em',
  countdownHint: 'Toque em "Estou bem" para cancelar o aviso',
  escalatedText: 'Seus contatos foram avisados',
  dismissLabel: 'Estou bem',
  dismissA11y: 'Estou bem, desligar o alarme',
} as const;

/** Textos da tela de alarme (alarm-ring) por tipo. */
export function ringCopy(isCheckin: boolean) {
  return isCheckin ? CHECKIN_RING_COPY : MEDICATION_RING_COPY;
}

/** Fala do check-in (o texto de remédio continua em alarm-ring.tsx). */
export function buildCheckinSpeechText(time: string | undefined, fromAlarmKit: boolean): string {
  const parts = ['Atenção! Hora do seu check-in.'];
  if (time) parts.push(`Horário: ${time.replace(':', ' horas e ')} minutos.`);
  parts.push(
    fromAlarmKit
      ? 'Que bom que você está bem.'
      : 'Toque em Estou bem para confirmar que está tudo bem.'
  );
  return parts.join(' ');
}
