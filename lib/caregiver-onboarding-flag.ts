import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Flag de "onboarding do cuidador concluído" — POR CONTA (openId), não global.
 *
 * A flag global era apagada no logout para uma conta diferente no mesmo aparelho
 * ver o onboarding. Efeito colateral: a MESMA conta re-onboardava a cada login
 * (feedback beta 2, item 1). Com escopo por openId, a mesma conta pula o
 * onboarding e uma conta diferente (openId diferente) o vê — sem apagar nada no
 * logout. Mesma abordagem do tema por conta.
 */
const PREFIX = 'vigora_caregiver_onboarding_completed';

const key = (openId: string) => `${PREFIX}_${openId}`;

export async function hasCompletedCaregiverOnboarding(openId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(openId))) === 'true';
  } catch {
    return false;
  }
}

export async function markCaregiverOnboardingCompleted(openId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key(openId), 'true');
  } catch {}
}
