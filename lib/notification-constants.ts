/**
 * notification-constants.ts
 *
 * Constantes de ID de canais de notificação.
 * Arquivo sem imports nativos — pode ser importado tanto por código de produção
 * quanto por testes vitest (que não suportam módulos nativos).
 */
export const ALARM_CHANNEL_ID = 'vigora-alarms';
export const DEFAULT_CHANNEL_ID = 'default';
export const CHECKIN_CHANNEL_ID = 'vigora-checkin';

// No Android 8+ som e vibração são propriedades do CANAL, não da notificação —
// `content.sound`/`content.vibrate` são ignorados. E o som de um canal é
// imutável depois de criado. Por isso um canal por combinação, escolhido no
// agendamento.
export const ALARM_CHANNEL_ID_SEM_VIBRACAO = 'vigora-alarms-sem-vibracao';
export const ALARM_CHANNEL_ID_SEM_SOM = 'vigora-alarms-sem-som';
export const ALARM_CHANNEL_ID_SILENCIOSO = 'vigora-alarms-silencioso';

/**
 * Canal do alarme conforme as chaves do próprio alarme.
 *
 * `!== false` (e não `=== true`) porque alarmes gravados antes destas chaves
 * existirem têm o campo ausente: para eles o certo é tocar, não emudecer sem
 * ninguém ter pedido. Mesma convenção do lado nativo.
 */
export function alarmChannelId(sound?: boolean, vibration?: boolean): string {
  const comSom = sound !== false;
  const comVibracao = vibration !== false;
  if (comSom && comVibracao) return ALARM_CHANNEL_ID;
  if (comSom) return ALARM_CHANNEL_ID_SEM_VIBRACAO;
  if (comVibracao) return ALARM_CHANNEL_ID_SEM_SOM;
  return ALARM_CHANNEL_ID_SILENCIOSO;
}
