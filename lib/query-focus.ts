/**
 * query-focus.ts
 *
 * No React Native não existe "foco da janela": sem isto o React Query nunca
 * considera que o usuário voltou à tela, e `refetchOnWindowFocus` não faz nada.
 * Aqui "app voltou ao primeiro plano" vira foco.
 */
import { focusManager } from '@tanstack/react-query';
import { AppState } from 'react-native';

let installed = false;

export function installQueryFocusManager(): void {
  if (installed) return;
  installed = true;
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => sub.remove();
  });
}
