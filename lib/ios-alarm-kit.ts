/**
 * AlarmKit (iOS 26+) como alarme real. Ver
 * docs/superpowers/specs/2026-08-19-alarmkit-ios-design.md
 *
 * Duas recusas silenciosas do lado Swift viram exceção aqui, porque um alarme
 * de remédio que não foi agendado não pode passar por agendado:
 *   - id fora do formato UUID → `guard let uuid = UUID(uuidString:)` → false
 *   - agendamento recusado → Promise<boolean> false
 */
import { AppState, AppStateStatus } from 'react-native';
import { alarmKit } from './_core/ios-alarm-kit-bridge';
import { firingJsDays, lastAlarmFireMs } from './alarm-fire-times';
import { enqueueConfirmation } from './pending-confirmations';
import type { Alarm } from './app-context';

export const APP_GROUP = 'group.com.vigora.saude.alarms';

/** RFC 4122 — o mesmo formato que Crypto.randomUUID() (generateId) produz. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAlarmKitAvailable(): boolean {
  return alarmKit !== null;
}

/**
 * Dias no formato do AlarmKit (1=Dom..7=Sáb), a partir da fonte única da
 * convenção (firingJsDays, 0=Dom..6=Sáb). Não reimplemente a lista aqui: ela
 * já divergiu uma vez em três cópias e todo alarme semanal tocava um dia
 * depois (ver 6aa5b0f).
 */
export function alarmKitWeekdays(alarm: Alarm): number[] {
  const dias = firingJsDays(alarm);
  if (dias === 'every') return [1, 2, 3, 4, 5, 6, 7];
  return dias.map((d) => d + 1);
}

export async function requestAlarmKitAuthorization() {
  if (!alarmKit) return 'denied' as const;
  return alarmKit.requestAuthorization();
}

export async function scheduleAlarmKitAlarm(alarm: Alarm): Promise<void> {
  if (!alarmKit) throw new Error('AlarmKit indisponível neste aparelho');

  if (!UUID_RE.test(alarm.id)) {
    throw new Error(
      `Alarme ${alarm.id}: id não é UUID e o AlarmKit recusaria em silêncio`,
    );
  }

  const [hour, minute] = alarm.time.split(':').map(Number);
  const weekdays = alarmKitWeekdays(alarm);
  if (weekdays.length === 0) {
    throw new Error(`Alarme ${alarm.id}: nenhum dia da semana para agendar`);
  }

  const options = {
    id: alarm.id,
    hour,
    minute,
    weekdays,
    title: alarm.description || 'Hora do remédio',
    launchAppOnDismiss: true,
    dismissPayload: alarm.id,
    stopButtonLabel: 'Desligar',
    tintColor: '#0033CC',
    // soundName com extensão: 'alarm' sem extensão não tocou na medição da
    // Fase 0. Ausente = som padrão do sistema, que também toca em loop.
    ...(alarm.sound !== false ? { soundName: 'alarm.mp3' } : {}),
  };

  const ok = await alarmKit.scheduleRepeatingAlarm(options);
  if (!ok) {
    throw new Error(`Alarme ${alarm.id}: o AlarmKit recusou o agendamento`);
  }
}

export async function cancelAlarmKitAlarm(alarmId: string): Promise<void> {
  if (!alarmKit) return;
  await alarmKit.cancelAlarm(alarmId);
}

/**
 * Ids dos alarmes agendados de verdade no AlarmKit — a fonte usada por
 * syncAlarmsOnStartup para saber o que já está agendado quando o AlarmKit é o
 * caminho ativo. Perguntar às notificações (como o fallback faz) não serve
 * aqui: um alarme do AlarmKit nunca aparece nelas, então todo alarme
 * pareceria faltando em toda abertura do app.
 */
export function listAlarmKitAlarmIds(): string[] {
  if (!alarmKit) return [];
  return alarmKit.getAllAlarms();
}

/** Dismiss que abriu o app, se houver. Consome (só vale uma vez). */
export function takeDismissal(): { alarmId: string; payload: string | null } | null {
  if (!alarmKit) return null;
  return alarmKit.getLaunchPayload();
}

/**
 * Alarme lido do estado PERSISTIDO. No boot por dismiss o app acabou de subir e
 * o contexto em memória ainda não hidratou — mesmo motivo pelo qual
 * `shouldVibrate` (lib/_core/alarm-vibration.ts) lê daqui. `loadRaw` é injetado
 * (o caller passa `loadCurrentAppStateRaw`) para o teste conseguir exercitar.
 */
async function alarmePersistido(
  alarmId: string,
  loadRaw: () => Promise<string | null>,
): Promise<Alarm | null> {
  try {
    const raw = await loadRaw();
    if (!raw) return null;
    const alarms = JSON.parse(raw)?.alarms;
    if (!Array.isArray(alarms)) return null;
    return alarms.find((a: Alarm) => a?.id === alarmId) ?? null;
  } catch (error) {
    console.warn('[AlarmKit] estado persistido ilegível ao confirmar o dismiss:', error);
    return null;
  }
}

/**
 * Confirma ao servidor o alarme que o idoso desligou na tela do AlarmKit.
 *
 * Enfileira em vez de mandar direto: o app pode ter aberto sem rede (o alarme
 * da madrugada é o caso típico), e a fila já reenvia no bootstrap autenticado
 * do MonitoringInitializer. Devolve o alarmId confirmado, ou null.
 *
 * O horário mandado é o do DISPARO, não o de agora. O servidor
 * (pickPendingEvent, server/_core/pick-pending-event.ts) não exige igualdade
 * exata: escolhe, entre os pendentes daquele alarme, o scheduledAt MAIS
 * PRÓXIMO da referência enviada, dentro de uma janela de 12h
 * (MAX_MATCH_WINDOW_MS em server/db-monitoring.ts). No caso comum — dismiss
 * chega segundos depois do disparo — `now` cru já casaria. O problema é o
 * caso que motivou watchAlarmKitDismissals: o app pode ficar SUSPENSO com o
 * payload gravado e só drenar quando volta ao primeiro plano, horas depois.
 * Aí `now` pode estar mais perto do pendente de AMANHÃ do que do disparo
 * real — a mesma armadilha que o cabeçalho de pick-pending-event.ts descreve
 * para o check-in atrasado, só que aqui o atraso é do app suspenso, não de
 * rede. `lastAlarmFireMs` não sofre disso: é o mesmo horário canônico que a
 * alarm-ring usa.
 *
 * Sem o alarme (foi apagado) ou sem disparo calculável, sobra melhor esforço:
 * `now` arredondado PARA BAIXO até o minuto cheio. É só uma aproximação
 * melhor que `now` cru quando o alarme não pôde ser resolvido pelo estado
 * persistido — o servidor não exige o minuto exato. Onde a suspensão for
 * longa o bastante para furar a janela de 12h, a confirmação se perde do
 * mesmo jeito — isto é melhor esforço, não garantia.
 *
 * Só age sobre evidência: sem payload de dismiss, não confirma nada. Inferir
 * "respondeu" pela ausência esconderia um remédio de fato perdido.
 */
export async function confirmAlarmKitDismissal(
  loadRaw: () => Promise<string | null>,
  now: Date = new Date(),
): Promise<string | null> {
  const dismissal = takeDismissal();
  if (!dismissal?.alarmId) return null;

  const alarm = await alarmePersistido(dismissal.alarmId, loadRaw);
  const disparoMs = alarm ? lastAlarmFireMs(alarm, now) : null;

  // Minuto cheio no fuso do aparelho (setSeconds, não aritmética de epoch): é
  // em HH:MM:00 local que o alarme dispara.
  const minutoCheio = new Date(now);
  minutoCheio.setSeconds(0, 0);

  await enqueueConfirmation({
    alarmId: dismissal.alarmId,
    scheduledAtIso: new Date(disparoMs ?? minutoCheio.getTime()).toISOString(),
    status: 'responded',
  });
  return dismissal.alarmId;
}

/**
 * Drena o dismiss também quando o app volta ao primeiro plano, e não só no
 * mount.
 *
 * O intent do "Desligar" roda dentro do processo do app e grava o payload num
 * static. Se o app estava apenas SUSPENSO em memória — o idoso mexeu nele à
 * noite e o alarme toca às 22h —, o intent grava o payload e traz o app para
 * frente, mas nenhum efeito de mount roda de novo: sem este ouvinte o payload
 * fica lá e a confirmação nunca sai, exatamente o caso que faz a família ser
 * avisada de um alarme atendido.
 *
 * Re-drenar é inofensivo: `getLaunchPayload` limpa o static na leitura, então
 * sem dismiss novo isto não enfileira nada. Devolve a função de cancelamento
 * (o caller chama no cleanup do efeito).
 */
export function watchAlarmKitDismissals(
  loadRaw: () => Promise<string | null>,
  onConfirmed: (alarmId: string) => void,
): () => void {
  if (!alarmKit) return () => {};

  const assinatura = AppState.addEventListener('change', (estado: AppStateStatus) => {
    if (estado !== 'active') return;
    confirmAlarmKitDismissal(loadRaw)
      .then((alarmId) => {
        if (alarmId) onConfirmed(alarmId);
      })
      .catch((error) =>
        console.warn('[AlarmKit] falha ao drenar o dismiss no retorno ao app:', error),
      );
  });
  return () => assinatura.remove();
}
