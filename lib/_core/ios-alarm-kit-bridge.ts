/**
 * ios-alarm-kit-bridge.ts
 *
 * Única fronteira com o expo-alarm-kit. Mesmo papel — e mesmos dois motivos —
 * do native-alarm-bridge.ts do Android:
 *
 * 1. A lib só é carregável no iOS 26+; abaixo disso o módulo nativo não
 *    registra, daí o require preguiçoso dentro de try/catch.
 * 2. O `require` não é interceptável em teste (vi.mock só age sobre imports
 *    ESM). Com ele isolado aqui, o teste mocka ESTE módulo e exercita o
 *    agendamento de ponta a ponta.
 */
import { Platform } from 'react-native';

export interface AlarmKitBridge {
  configure(appGroupIdentifier: string): boolean;
  requestAuthorization(): Promise<'authorized' | 'denied' | 'notDetermined'>;
  scheduleRepeatingAlarm(options: {
    id: string;
    hour: number;
    minute: number;
    weekdays: number[];
    title: string;
    soundName?: string;
    launchAppOnDismiss?: boolean;
    dismissPayload?: string;
    stopButtonLabel?: string;
    tintColor?: string;
  }): Promise<boolean>;
  cancelAlarm(id: string): Promise<boolean>;
  getAllAlarms(): string[];
  getLaunchPayload(): { alarmId: string; payload: string | null } | null;
}

export let alarmKit: AlarmKitBridge | null = null;

if (Platform.OS === 'ios') {
  try {
    alarmKit = require('expo-alarm-kit') as AlarmKitBridge;
  } catch (e) {
    // Esperado em iOS < 26: o módulo nativo não registra. Logamos o motivo
    // real em vez de engolir — se sumir num aparelho 26+, queremos ver.
    console.warn('[AlarmKit] indisponível:', e);
  }
}
