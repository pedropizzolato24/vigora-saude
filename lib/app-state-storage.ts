/**
 * app-state-storage.ts
 *
 * Storage do estado do app POR CONTA. O blob era um único 'vigora_app_state'
 * compartilhado por qualquer conta que logasse no aparelho — trocar de conta
 * vazava dados locais (alarmes, contatos, anamnese) entre contas, e o logout
 * não limpava nada. Agora a chave é 'vigora_app_state:<openId>'.
 *
 * Migração: a primeira conta que carregar o estado após o update ADOTA o blob
 * legado (ele pertencia a quem usava o aparelho) e o remove da chave antiga.
 * Ver docs/design/2026-07-12-monitoring-account-ownership.md (Slice 6).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Auth from "@/lib/_core/auth";

const LEGACY_KEY = "vigora_app_state";

/** Chave do blob de estado da conta (blob legado quando deslogado). */
export function appStateKeyFor(openId: string | null | undefined): string {
  return openId ? `${LEGACY_KEY}:${openId}` : LEGACY_KEY;
}

/**
 * Lê o estado local (JSON cru) da conta. Se a conta ainda não tem blob próprio
 * e existe o blob legado pré-refactor, adota-o (migração) e apaga o legado.
 */
export async function loadAppStateRaw(
  openId: string | null | undefined
): Promise<string | null> {
  const key = appStateKeyFor(openId);
  let raw = await AsyncStorage.getItem(key);
  if (raw == null && key !== LEGACY_KEY) {
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacy != null) {
      await AsyncStorage.setItem(key, legacy);
      await AsyncStorage.removeItem(LEGACY_KEY);
      raw = legacy;
    }
  }
  return raw;
}

/**
 * Lê o estado local da conta ATUALMENTE autenticada (resolve o openId via
 * SecureStore). Para os caminhos de cold start (disparo de alarme com app
 * morto) que precisam de settings/alarmes sem o AppProvider montado.
 */
export async function loadCurrentAppStateRaw(): Promise<string | null> {
  const user = await Auth.getUserInfo().catch(() => null);
  return loadAppStateRaw(user?.openId);
}
