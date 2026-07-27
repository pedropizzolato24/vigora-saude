/**
 * push-status.ts
 *
 * Estado "este aparelho conseguiu registrar o push?" compartilhado entre o
 * CaregiverPushInitializer (que descobre) e a home do cuidador (que avisa).
 *
 * Existe porque a falha era TOTALMENTE silenciosa: sem token, o servidor não
 * tem para onde mandar o alerta de alarme perdido e o cuidador não recebe nada
 * — nem sabe disso. Num dead man's switch, "não recebi" precisa ser visível.
 *
 * Sem AsyncStorage de propósito: a checagem roda a cada abertura do app, então
 * persistir só criaria um estado desatualizado para reconciliar.
 */
import { useEffect, useState } from 'react';

let unavailable = false;
const listeners = new Set<(v: boolean) => void>();

/** Chamado pelo initializer após tentar obter/registrar o token. */
export function setPushUnavailable(value: boolean): void {
  unavailable = value;
  listeners.forEach((l) => l(value));
}

/** true quando este aparelho NÃO vai receber alertas em tempo real. */
export function usePushUnavailable(): boolean {
  const [value, setValue] = useState(unavailable);
  useEffect(() => {
    listeners.add(setValue);
    setValue(unavailable);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
