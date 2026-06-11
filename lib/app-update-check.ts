/**
 * lib/app-update-check.ts
 *
 * Verifica nas lojas (App Store / Play Store) se existe versão mais nova do
 * app instalado. Toda falha (offline, loja fora do ar, app ainda não
 * publicado, layout da página mudou) retorna null em silêncio — o aviso de
 * atualização é uma recomendação, nunca pode atrapalhar o uso do app.
 *
 * iOS: iTunes Lookup API (pública, sem chave).
 * Android: a Play Store não tem API pública — extraímos a versão do HTML da
 * página do app (ver lib/app-update-core.ts).
 */
import * as Application from 'expo-application';
import { Linking, Platform } from 'react-native';
import {
  extractPlayStoreVersion,
  isNewerVersion,
  parseItunesLookup,
} from '@/lib/app-update-core';

export interface UpdateInfo {
  latestVersion: string;
  storeUrl: string;
}

const FETCH_TIMEOUT_MS = 5000;
const FALLBACK_APP_ID = 'com.vigora.saude';

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Versão mais nova disponível na loja, ou null se está em dia / não deu para saber. */
export async function checkForStoreUpdate(): Promise<UpdateInfo | null> {
  if (Platform.OS === 'web') return null;

  const currentVersion = Application.nativeApplicationVersion;
  const appId = Application.applicationId ?? FALLBACK_APP_ID;
  if (!currentVersion) return null;

  try {
    if (Platform.OS === 'ios') {
      const res = await fetchWithTimeout(
        `https://itunes.apple.com/lookup?bundleId=${appId}&country=br`,
      );
      if (!res.ok) return null;
      const info = parseItunesLookup(await res.json());
      if (!info || !isNewerVersion(info.version, currentVersion)) return null;
      // Sem trackViewUrl não há para onde mandar o usuário — melhor não avisar.
      if (!info.storeUrl) return null;
      return { latestVersion: info.version, storeUrl: info.storeUrl };
    }

    const playUrl = `https://play.google.com/store/apps/details?id=${appId}&hl=pt_BR&gl=BR`;
    const res = await fetchWithTimeout(playUrl);
    if (!res.ok) return null;
    const latest = extractPlayStoreVersion(await res.text());
    if (!latest || !isNewerVersion(latest, currentVersion)) return null;
    return { latestVersion: latest, storeUrl: playUrl };
  } catch {
    return null;
  }
}

/** Abre a página do app na loja (Android tenta o app da Play Store primeiro). */
export async function openStorePage(storeUrl: string): Promise<void> {
  const appId = Application.applicationId ?? FALLBACK_APP_ID;
  if (Platform.OS === 'android') {
    try {
      await Linking.openURL(`market://details?id=${appId}`);
      return;
    } catch {
      // sem app da Play Store — cai para o navegador
    }
  }
  Linking.openURL(storeUrl).catch(() => {});
}
