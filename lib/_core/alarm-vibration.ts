/**
 * alarm-vibration.ts
 *
 * Decide se o alarme deve vibrar. Sem UI (por isso em _core) para ser testável.
 *
 * Feedback 27/07: desligar a vibração no app não tinha efeito — a tela do
 * alarme chamava Vibration.vibrate() incondicionalmente. São DUAS chaves: a
 * global (Configurações) e a do próprio alarme (formulário); ambas precisam
 * permitir.
 */

/** Estado em memória, quando já hidratado. */
export interface VibrationInputs {
  /** settings.vibrationEnabled — undefined quando o state ainda não hidratou. */
  globalEnabled?: boolean;
  /** alarm.vibration — undefined quando o alarme ainda não foi resolvido. */
  alarmEnabled?: boolean;
}

/**
 * Resolve as chaves faltantes lendo o app state persistido. No disparo a frio
 * (app morto) o state em memória ainda não existe, e sem esse fallback os
 * defaults `true` venceriam justamente no caso que mais importa.
 *
 * `loadRaw` é injetado para manter este módulo livre de dependências de
 * plataforma; o caller passa `loadCurrentAppStateRaw`.
 */
export async function shouldVibrate(
  inputs: VibrationInputs,
  alarmId: string,
  loadRaw: () => Promise<string | null>
): Promise<boolean> {
  let { globalEnabled, alarmEnabled } = inputs;

  if (globalEnabled === undefined || alarmEnabled === undefined) {
    try {
      const raw = await loadRaw();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (globalEnabled === undefined) {
          globalEnabled = parsed?.settings?.vibrationEnabled;
        }
        if (alarmEnabled === undefined) {
          alarmEnabled = parsed?.alarms?.find(
            (a: { id?: string; vibration?: boolean }) => a?.id === alarmId
          )?.vibration;
        }
      }
    } catch {
      // storage ilegível: cai nos defaults abaixo
    }
  }

  // Default `true` nos dois: um alarme que não vibra por falta de informação é
  // pior do que um que vibra sem necessidade.
  return (globalEnabled ?? true) && (alarmEnabled ?? true);
}
