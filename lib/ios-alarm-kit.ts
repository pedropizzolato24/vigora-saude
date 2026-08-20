/**
 * AlarmKit (iOS 26+) como alarme real. Ver
 * docs/superpowers/specs/2026-08-19-alarmkit-ios-design.md
 *
 * Duas recusas silenciosas do lado Swift viram exceção aqui, porque um alarme
 * de remédio que não foi agendado não pode passar por agendado:
 *   - id fora do formato UUID → `guard let uuid = UUID(uuidString:)` → false
 *   - agendamento recusado → Promise<boolean> false
 */
import { alarmKit } from './_core/ios-alarm-kit-bridge';
import { firingJsDays } from './alarm-fire-times';
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

/** Dismiss que abriu o app, se houver. Consome (só vale uma vez). */
export function takeDismissal(): { alarmId: string; payload: string | null } | null {
  if (!alarmKit) return null;
  return alarmKit.getLaunchPayload();
}
