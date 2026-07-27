/**
 * lib/register-draft.ts
 *
 * Rascunho local do formulário de cadastro (app/register.tsx). Existe por dois
 * motivos:
 *
 * 1. Roteamento de startup (components/onboarding-gate.tsx): quem entrou mas
 *    não concluiu o cadastro só volta para /register se houver algo escrito no
 *    formulário. Com tudo vazio — o caso de "Continuar sem conta" — o app abre
 *    no /login, em vez de prender o usuário no formulário.
 * 2. Não perder o que já foi digitado quando o app é fechado no meio.
 *
 * Só dados do próprio formulário, apagados assim que o cadastro é concluído.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'vigora_register_draft';

export interface RegisterDraft {
  name: string;
  phone: string;
  birthDate: string;
  bloodType: string | null;
  userType: 'caregiver' | 'monitored' | null;
  healthConsent: boolean;
}

function isBlank(draft: RegisterDraft): boolean {
  return (
    !draft.name.trim() &&
    !draft.phone.trim() &&
    !draft.birthDate.trim() &&
    !draft.bloodType &&
    !draft.userType &&
    !draft.healthConsent
  );
}

/** Grava o rascunho. Formulário totalmente vazio apaga em vez de gravar. */
export async function saveRegisterDraft(draft: RegisterDraft): Promise<void> {
  try {
    if (isBlank(draft)) {
      await AsyncStorage.removeItem(KEY);
      return;
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // best-effort: perder o rascunho não pode quebrar o cadastro
  }
}

export async function loadRegisterDraft(): Promise<RegisterDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RegisterDraft) : null;
  } catch {
    return null;
  }
}

export async function clearRegisterDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}

/** true quando há algum campo preenchido de um cadastro em andamento. */
export async function hasRegisterDraft(): Promise<boolean> {
  return (await loadRegisterDraft()) !== null;
}
