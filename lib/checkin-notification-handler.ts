/**
 * checkin-notification-handler.ts
 *
 * Handlers únicos e deduplicados para as respostas de notificação do check-in
 * diário. Tanto _layout.tsx (cold start, via getLastNotificationResponseAsync)
 * quanto CheckinInitializer (listeners de foreground e de tap) podem processar
 * a MESMA notificação. Sem dedup isso causava:
 *   - timeout: escalonamento duplo (WhatsApp + push duplicados) e tela aberta 2x
 *   - prompt: navegação dupla e dupla marcação de resposta
 *
 * O dedup (claimPrompt / claimTimeout) vive em checkin-dedup.ts — Set permanente
 * para o timeout (identifier único por dia) e janela de tempo para o prompt
 * (trigger DAILY, identifier estável entre dias).
 */
import type { EmergencyContact } from './app-context';
import { markCheckinResponded, createNextCheckinEvent } from './checkin-service';
import { escalateAlarmToContacts } from './alarm-escalation';
import { confirmAlarmResponded, confirmAlarmMissed } from './monitoring-service';
import { claimPrompt, claimTimeout } from './checkin-dedup';

function checkinAlarm(checkinTime: string, missed: boolean) {
  return {
    id: 'checkin-daily',
    time: checkinTime,
    description: missed ? 'Check-in diário sem resposta' : 'Check-in diário',
    enabled: true,
    repeat: 'daily' as const,
    customDays: [] as number[],
    sound: false,
    vibration: false,
  };
}

/**
 * Usuário confirmou o check-in (tocou no prompt ou no popup in-app).
 * Para o cold start passe o identifier da notificação (dedup); para o popup
 * in-app passe undefined (não há handler concorrente).
 *
 * confirmAlarmResponded é encadeado antes de createNextCheckinEvent para
 * REDUZIR a janela em que dois eventos pendentes coexistem (ao responder após o
 * prazo). Não é garantia: o efeito do CheckinInitializer também cria eventos e o
 * servidor casa por status sem ORDER BY. A correção definitiva é server-side.
 *
 * Retorna true se processou; false se já foi tratado (outro handler venceu).
 * O chamador deve navegar para /checkin-response apenas quando retornar true.
 */
export async function handleCheckinPromptResponse(
  checkinTime: string,
  windowMinutes: number,
  identifier: string | undefined
): Promise<boolean> {
  if (!claimPrompt(identifier)) return false;
  await markCheckinResponded(checkinTime, windowMinutes).catch(() => {});
  confirmAlarmResponded(checkinAlarm(checkinTime, false), new Date())
    .catch(() => {})
    .then(() => createNextCheckinEvent(checkinTime, windowMinutes).catch(() => {}));
  return true;
}

/**
 * Check-in não respondido (timeout): escalona aos contatos, marca como perdido
 * no servidor e reagenda o check-in de amanhã. Idempotente por identifier.
 *
 * escalateAlarmToContacts e confirmAlarmMissed andam JUNTOS de propósito:
 * confirmAlarmMissed seta warningSent=true, impedindo o monitoring-job (Step 3)
 * de escalonar de novo pelo servidor. confirmAlarmMissed é encadeado antes de
 * createNextCheckinEvent pelo mesmo motivo do prompt — reduzir (não garantir) a
 * janela de dois eventos pendentes.
 *
 * Retorna true se processou; false se já foi tratado (outro handler venceu).
 */
export async function handleCheckinTimeout(
  checkinTime: string,
  windowMinutes: number,
  contacts: EmergencyContact[],
  identifier: string | undefined
): Promise<boolean> {
  if (!claimTimeout(identifier)) return false;
  const alarm = checkinAlarm(checkinTime, true);
  escalateAlarmToContacts(alarm, contacts).catch(() => {});
  await markCheckinResponded(checkinTime, windowMinutes).catch(() => {});
  confirmAlarmMissed(alarm, new Date())
    .catch(() => {})
    .then(() => createNextCheckinEvent(checkinTime, windowMinutes).catch(() => {}));
  return true;
}
