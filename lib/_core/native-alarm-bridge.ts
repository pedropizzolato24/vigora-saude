/**
 * native-alarm-bridge.ts
 *
 * Única fronteira com o expo-alarm-module. Existe por dois motivos:
 *
 * 1. A lib só é carregável no Android — no iOS/web o módulo nativo não está
 *    linkado, daí o require preguiçoso dentro de try/catch (comportamento que
 *    veio inalterado de native-alarm-manager).
 * 2. O `require` não é interceptável em teste: o vi.mock só age sobre imports
 *    ESM, e no Node o require resolve `lib/commonjs/index.js` da lib, um build
 *    que nem parseia (no aparelho o Metro usa o campo `react-native`, TSX, por
 *    isso funciona lá). Com o require isolado aqui, o teste mocka ESTE módulo e
 *    consegue exercitar o agendamento nativo de ponta a ponta.
 */
import { NativeModules, Platform } from 'react-native';

type AlarmeNativo = Record<string, unknown>;

export let scheduleAlarmNative: ((alarm: AlarmeNativo) => Promise<void>) | null = null;
export let removeAlarmNative: ((uid: string) => Promise<void>) | null = null;
export let removeAllAlarmsNative: (() => Promise<void>) | null = null;
export let stopAlarmNative: (() => Promise<void>) | null = null;
// pauseSound/resumeSound/setAlarmVolume são adicionados pelo nosso patch e não
// existem na API pública do pacote — daí o acesso direto ao NativeModules.
export let alarmNativeModule: {
  pauseSound?: () => Promise<void>;
  resumeSound?: () => Promise<void>;
  setAlarmVolume?: (volume: number) => Promise<void>;
  previewSound?: () => Promise<void>;
} | null = null;

if (Platform.OS === 'android') {
  try {
    const mod = require('expo-alarm-module');
    scheduleAlarmNative = mod.scheduleAlarm;
    removeAlarmNative = mod.removeAlarm;
    removeAllAlarmsNative = mod.removeAllAlarms;
    stopAlarmNative = mod.stopAlarm;
    alarmNativeModule = NativeModules.ExpoAlarmModule ?? null;
  } catch (e) {
    console.warn('[NativeAlarm] expo-alarm-module not available:', e);
  }
}
