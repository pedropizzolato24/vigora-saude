/**
 * Tipos e limites da lista de alarmes gerenciada (Fase 4).
 *
 * Módulo PURO (sem React Native, Expo, Node ou banco): é importado pelo servidor
 * e pelo app, para as duas pontas concordarem no formato do alarme e nos limites.
 */

/** Alarme como vive na lista gerenciada: o `Alarm` do app, sem os ids do sistema. */
export type ManagedAlarm = {
  id: string;
  /** "HH:MM", 24 h. */
  time: string;
  description: string;
  enabled: boolean;
  repeat: 'daily' | 'weekdays' | 'weekends' | 'custom';
  /** 0 = domingo .. 6 = sábado; só vale com repeat 'custom'. */
  customDays?: number[];
  sound: boolean;
  vibration: boolean;
  /** Ausente = remédio. */
  kind?: 'medication' | 'checkin';
  /** Só check-in: minutos até o servidor cobrar a resposta. */
  escalateAfterMinutes?: 5 | 10 | 15 | 30;
};

/** Remédios e check-ins somados (o mesmo limite do app: `MAX_ALARMS`). */
export const MANAGED_ALARMS_MAX = 24;
export const MANAGED_DESCRIPTION_MAX = 80;
/** Pedido que o idoso não respondeu vence depois disto. */
export const MANAGEMENT_REQUEST_TTL_DAYS = 7;
/** Sem confirmação do celular depois disto, o servidor manda a notificação visível de reserva. */
export const VISIBLE_NOTICE_DELAY_MINUTES = 10;
/** O cuidador vê "Peça para [nome] abrir o Vigora" depois disto sem confirmação. */
export const PENDING_HINT_HOURS = 12;
/** Sem nenhum sinal do aparelho por este tempo, o servidor pausa os disparos da conta. */
export const NO_SIGNAL_PAUSE_HOURS = 48;
/** Dois eventos do mesmo alarme a menos disto são o mesmo disparo. */
export const SAME_FIRING_WINDOW_MINUTES = 120;
