/**
 * account-switch.ts
 *
 * Sequência de troca de conta (login, logout, troca direta). Vive aqui, puro e
 * sem dependência de RN/Expo, porque a ORDEM dos passos é a parte crítica e
 * precisa ser testável.
 *
 * O cancelamento dos alarmes da conta que SAI precisa terminar antes de carregar
 * o estado da conta que ENTRA. Antes disso o cancelamento era disparado sem
 * `await`: como ele é lento (AlarmManager nativo + cancelAllScheduledNotifications)
 * e o carregamento é rápido (um AsyncStorage.getItem), o cancelamento resolvia
 * DEPOIS do reagendamento e apagava os alarmes recém-agendados da conta nova.
 * A UI seguia mostrando o alarme ativo, mas não havia agendamento no sistema —
 * alarme que não toca, o pior tipo de falha neste app.
 */

export interface AccountSwitchSteps {
  /** Limpa o estado em memória. Roda primeiro, para a UI não exibir dados da conta que saiu. */
  resetState: () => void;
  /** Cancela alarmes/notificações da conta que sai. */
  cancelAlarms: () => Promise<void>;
  /** Carrega o estado da conta que entra. */
  loadState: () => Promise<void>;
  /** False quando outra troca começou no meio — aborta para não carregar conta obsoleta. */
  isStillCurrent: () => boolean;
}

export async function switchAccount(steps: AccountSwitchSteps): Promise<void> {
  steps.resetState();

  try {
    await steps.cancelAlarms();
  } catch (error) {
    // Falhar em cancelar é ruim (alarme da conta anterior pode sobreviver), mas
    // não pode impedir a conta que entra de ter os alarmes dela agendados.
    // Motivo real no log — nunca engolir em silêncio.
    console.warn('[AccountSwitch] cancelamento de alarmes falhou:', error);
  }

  if (!steps.isStillCurrent()) return;

  await steps.loadState();
}
