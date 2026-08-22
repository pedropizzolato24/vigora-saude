/**
 * ios-alarm-kit-bridge.ts
 *
 * Única fronteira com o expo-alarm-kit. Mesmo papel — e mesmos dois motivos —
 * do native-alarm-bridge.ts do Android:
 *
 * 1. A lib só existe no Apple, daí o require preguiçoso dentro de try/catch.
 *    ATENÇÃO: registrar NÃO quer dizer que o AlarmKit exista. Até o build do
 *    portão a classe Swift era `@available(iOS 26.0, *)` e não registrava
 *    abaixo do 26 — mas era isso que quebrava a compilação com o app em alvo
 *    15.1, então o `@available` saiu da classe e foi para os corpos. Hoje o
 *    módulo registra em qualquer iPhone; quem decide é `isAlarmKitAvailable()`,
 *    que olha `Platform.Version`.
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
    // Depois do fix de build isto não é mais esperado em iOS antigo — o módulo
    // registra em qualquer versão. Se cair aqui, algo saiu do lugar no build;
    // logamos o motivo real em vez de engolir.
    console.warn('[AlarmKit] módulo não registrou:', e);
  }
}
