/**
 * managed-alarms-copy.ts
 *
 * Textos do modo gerenciado do lado do idoso (spec 3.2, 3.4 e 6.2) e as regras
 * puras de quando mostrar o diálogo do pedido e o que enviar ao aceitar. Sem
 * React Native: tudo aqui é testável no vitest.
 */
import type { Alarm } from './app-context';

export const FALLBACK_CAREGIVER_NAME = 'Seu cuidador';

/** Nome para começo de frase. Sem nome (o servidor manda 'Seu cuidador'), usa o fallback. */
export function caregiverLabel(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed || FALLBACK_CAREGIVER_NAME;
}

/** Nome para meio de frase: "Deixar Ana cuidar" / "Deixar seu cuidador cuidar". */
export function caregiverMid(name: string | null | undefined): string {
  const label = caregiverLabel(name);
  return label === FALLBACK_CAREGIVER_NAME ? 'seu cuidador' : label;
}

export function requestDialogCopy(name: string | null | undefined) {
  const label = caregiverLabel(name);
  return {
    title: `${label} quer cuidar dos seus alarmes`,
    message: `${label} vai poder criar, mudar e apagar os seus remédios e check-ins. Você vai continuar vendo e respondendo, mas não vai conseguir apagar nem desligar. Você pode parar quando quiser em Configurações.`,
    acceptLabel: `Deixar ${caregiverMid(name)} cuidar`,
    declineLabel: 'Agora não',
  };
}

export function stopDialogCopy(name: string | null | undefined) {
  return {
    title: 'Parar?',
    message: `${caregiverLabel(name)} será avisado. Você volta a cuidar dos seus alarmes.`,
    cancelLabel: 'Cancelar',
    confirmLabel: 'Parar',
  };
}

export function managementCardCopy(name: string | null | undefined) {
  const label = caregiverLabel(name);
  return {
    title: `${label} cuida dos seus alarmes`,
    subtitle: `${label} pode criar e mudar os seus remédios e check-ins. Você continua vendo e respondendo.`,
    stopLabel: 'Parar',
  };
}

export function acceptedToastText(name: string | null | undefined): string {
  return `${caregiverLabel(name)} agora cuida dos seus alarmes.`;
}

export const STOPPED_TOAST_TEXT = 'Pronto. Você voltou a cuidar dos seus alarmes.';

/** O que o aceite envia ao servidor: a lista atual, sem os ids do sistema. */
export type AcceptedAlarm = Omit<Alarm, 'notificationId' | 'nativeAlarmUids'>;

export function alarmsForAccept(alarms: Alarm[]): AcceptedAlarm[] {
  return alarms.map(({ notificationId: _notificationId, nativeAlarmUids: _nativeAlarmUids, ...rest }) => rest);
}

/**
 * Qual pedido o diálogo deve mostrar agora (ou null). O id fica em `shownIds`
 * depois de aparecer uma vez NESTA abertura do app: fechar o diálogo sem
 * escolher não o recusa, só o adia para a próxima abertura (a lista é zerada
 * quando o app vai para segundo plano).
 */
export function pickRequestToShow(args: {
  pending: { id: number } | null;
  shownIds: ReadonlySet<number>;
  blocked: boolean;
}): number | null {
  if (args.blocked || !args.pending) return null;
  return args.shownIds.has(args.pending.id) ? null : args.pending.id;
}
