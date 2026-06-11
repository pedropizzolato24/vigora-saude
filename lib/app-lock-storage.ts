/**
 * lib/app-lock-storage.ts
 *
 * Persistência do bloqueio de app em expo-secure-store (nunca AsyncStorage —
 * regra de segurança do projeto). O PIN nunca é gravado: armazenamos apenas
 * SHA-256(`${salt}:${pin}`) com salt aleatório por ativação.
 *
 * Web não tem SecureStore — o bloqueio é um recurso exclusivo do app nativo
 * e todas as funções viram no-op/false na web.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  INITIAL_ATTEMPT_STATE,
  parseAttemptState,
  type AttemptState,
} from '@/lib/app-lock-core';

const ENABLED_KEY = 'vigora_applock_enabled';
const SALT_KEY = 'vigora_applock_salt';
const PIN_HASH_KEY = 'vigora_applock_pin_hash';
const BIOMETRIC_KEY = 'vigora_applock_biometric';
const ATTEMPTS_KEY = 'vigora_applock_attempts';

const ALL_KEYS = [ENABLED_KEY, SALT_KEY, PIN_HASH_KEY, BIOMETRIC_KEY, ATTEMPTS_KEY];

const isNative = Platform.OS !== 'web';

// Notifica o AppLockProvider quando o bloqueio é limpo fora do contexto
// (ex.: clearAppLockStorage chamado pelo logout em hooks/use-auth.ts), para
// o estado em memória não ficar dessincronizado do SecureStore.
type ClearedListener = () => void;
const clearedListeners = new Set<ClearedListener>();

export function onAppLockCleared(listener: ClearedListener): () => void {
  clearedListeners.add(listener);
  return () => {
    clearedListeners.delete(listener);
  };
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function isLockEnabled(): Promise<boolean> {
  if (!isNative) return false;
  try {
    return (await SecureStore.getItemAsync(ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function isBiometricPreferred(): Promise<boolean> {
  if (!isNative) return false;
  try {
    return (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setBiometricPreferred(value: boolean): Promise<void> {
  if (!isNative) return;
  await SecureStore.setItemAsync(BIOMETRIC_KEY, value ? '1' : '0');
}

/** Ativa o bloqueio gravando salt + hash do PIN. */
export async function saveLock(pin: string, biometric: boolean): Promise<void> {
  if (!isNative) return;
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const salt = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(SALT_KEY, salt);
  await SecureStore.setItemAsync(PIN_HASH_KEY, hash);
  await SecureStore.setItemAsync(BIOMETRIC_KEY, biometric ? '1' : '0');
  await SecureStore.setItemAsync(ATTEMPTS_KEY, JSON.stringify(INITIAL_ATTEMPT_STATE));
  // ENABLED por último: se algo falhar no meio, o bloqueio não fica "ativo"
  // sem hash gravado (o que trancaria o usuário para fora).
  await SecureStore.setItemAsync(ENABLED_KEY, '1');
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (!isNative) return false;
  try {
    const [salt, stored] = await Promise.all([
      SecureStore.getItemAsync(SALT_KEY),
      SecureStore.getItemAsync(PIN_HASH_KEY),
    ]);
    if (!salt || !stored) return false;
    return (await hashPin(pin, salt)) === stored;
  } catch {
    return false;
  }
}

export async function loadAttemptState(): Promise<AttemptState> {
  if (!isNative) return INITIAL_ATTEMPT_STATE;
  try {
    return parseAttemptState(await SecureStore.getItemAsync(ATTEMPTS_KEY));
  } catch {
    return INITIAL_ATTEMPT_STATE;
  }
}

export async function saveAttemptState(state: AttemptState): Promise<void> {
  if (!isNative) return;
  try {
    await SecureStore.setItemAsync(ATTEMPTS_KEY, JSON.stringify(state));
  } catch {
    // best-effort: o estado em memória continua valendo nesta sessão
  }
}

/**
 * Remove tudo do bloqueio. Chamado ao desativar nas Configurações e no
 * logout (hooks/use-auth.ts) — o bloqueio pertence à conta logada e não
 * deve sobreviver para o próximo usuário do aparelho.
 */
export async function clearAppLockStorage(): Promise<void> {
  if (!isNative) return;
  await Promise.all(ALL_KEYS.map((key) => SecureStore.deleteItemAsync(key).catch(() => {})));
  // Pior caso possível: o delete falhar e o usuário (que fez logout porque
  // esqueceu o PIN) reabrir o app travado sem recuperação. Se a flag ainda
  // existir, sobrescreve com '0' — isLockEnabled() só aceita '1'.
  const stillEnabled = await SecureStore.getItemAsync(ENABLED_KEY).catch(() => null);
  if (stillEnabled != null) {
    await SecureStore.setItemAsync(ENABLED_KEY, '0').catch(() => {});
  }
  clearedListeners.forEach((listener) => listener());
}
