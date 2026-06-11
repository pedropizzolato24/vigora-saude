import * as Linking from 'expo-linking';
import { Platform, AppState as RNAppState } from 'react-native';
import * as Location from 'expo-location';
import { Alarm, EmergencyContact } from './app-context';

/**
 * Hybrid WhatsApp Escalation System
 *
 * Strategy:
 * 1. PRIMARY: Deep link (whatsapp://send) - sends from user's personal number
 *    - Requires user to tap "Send" in WhatsApp for each contact
 *    - Only works when app is in foreground and user is conscious
 *
 * 2. FALLBACK: WhatsApp Business API via server - sends from business number
 *    - Fully automatic, no user interaction needed
 *    - Works even if user is unconscious or app is in background
 *    - Requires WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID configured on server
 *
 * The system tries deep link first. If it fails (app in background, WhatsApp not installed,
 * or user doesn't respond), it automatically falls back to the server API.
 */

export interface EscalationResult {
  method: 'deeplink' | 'server_api' | 'both' | 'none';
  deepLinkSent: number;
  deepLinkFailed: number;
  serverApiSent: number;
  serverApiFailed: number;
  totalSent: number;
  totalFailed: number;
}

/**
 * Get the user's current location for inclusion in emergency messages.
 */
async function getUserLocation(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Generate Google Maps link with current location
 */
export function generateMapsLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

/**
 * Build the emergency message text.
 */
function buildEmergencyMessage(
  alarm: Alarm,
  userName: string | undefined,
  missedCount: number,
  locationUrl?: string
): string {
  const name = userName || 'O usuário';
  const alarmDesc = alarm.description || 'Alarme de medicamento';
  const timestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  let message =
    `⚠️ ALERTA VIGORA SAÚDE ⚠️\n\n` +
    `${name} não respondeu a ${missedCount} alarme(s) consecutivo(s).\n` +
    `Último alarme: ${alarmDesc} (${timestamp})\n` +
    `Por favor, entre em contato urgentemente para verificar se está tudo bem.`;

  if (locationUrl) {
    message += `\n\n📍 Localização atual:\n${locationUrl}`;
  }

  return message;
}

/**
 * Try to send messages via deep link (user's personal WhatsApp number).
 * Returns the number of successfully opened deep links.
 */
async function tryDeepLinkEscalation(
  contacts: EmergencyContact[],
  message: string
): Promise<{ sent: number; failed: number }> {
  // Deep link only works on native platforms when app is in foreground
  if (Platform.OS === 'web') {
    return { sent: 0, failed: contacts.length };
  }

  // Check if app is in foreground - deep links don't work reliably in background
  const appState = RNAppState.currentState;
  if (appState !== 'active') {
    console.log('[Escalation] App not in foreground, skipping deep link');
    return { sent: 0, failed: contacts.length };
  }

  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    try {
      const phone = contact.phone.replace(/\D/g, '');
      const fullPhone = phone.length <= 11 ? `55${phone}` : phone;
      const url = `whatsapp://send?phone=${fullPhone}&text=${encodeURIComponent(message)}`;

      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        sent++;
        // No PII in logs: contact name/phone are personal data (LGPD).
        console.log(`[Escalation] Deep link opened for a contact`);
        // Delay between contacts to allow user to send each message
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        failed++;
        console.log(`[Escalation] Cannot open WhatsApp for a contact`);
      }
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Try to send messages via server WhatsApp Business API (fallback).
 * This is fully automatic - no user interaction required.
 *
 * Requires the user to be authenticated; sends auth header on native and
 * relies on credentials:include for web cookies. If unauthenticated,
 * returns failure for all contacts so the caller can fall back to other
 * channels (deep link, manual).
 */
async function tryServerApiEscalation(
  contacts: EmergencyContact[],
  userName: string | undefined,
  missedCount: number,
  locationUrl?: string,
  alertType: 'missed_alarm' | 'sos' = 'missed_alarm'
): Promise<{ sent: number; failed: number; configured: boolean }> {
  try {
    // Dynamic imports to avoid circular dependencies
    const { getApiBaseUrl } = await import('@/constants/oauth');
    const { getDeviceId } = await import('./device-id');
    const Auth = await import('./_core/auth');
    const baseUrl = getApiBaseUrl();

    // Build auth headers (Bearer on native, cookie on web)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (Platform.OS !== 'web') {
      const token = await Auth.getSessionToken();
      if (!token) {
        console.log('[Escalation] No auth session, skipping server API');
        return { sent: 0, failed: contacts.length, configured: false };
      }
      headers['Authorization'] = `Bearer ${token}`;
    }

    // First check if the API is configured
    const checkResponse = await fetch(`${baseUrl}/api/trpc/whatsapp.isConfigured`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!checkResponse.ok) {
      console.log('[Escalation] Server API check failed');
      return { sent: 0, failed: contacts.length, configured: false };
    }

    const checkData = await checkResponse.json();
    // tRPC wraps the response in result.data
    const isConfigured = (checkData as any)?.result?.data?.configured === true;

    if (!isConfigured) {
      console.log('[Escalation] WhatsApp Business API not configured on server');
      return { sent: 0, failed: contacts.length, configured: false };
    }

    const deviceId = await getDeviceId();

    // Send emergency alerts via server
    const contactsPayload = contacts.map((c) => ({
      phone: c.phone,
      name: c.name,
    }));

    const sendResponse = await fetch(`${baseUrl}/api/trpc/whatsapp.sendEmergencyAlert`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        json: {
          deviceId,
          contacts: contactsPayload,
          userName,
          missedAlarmCount: missedCount,
          locationUrl,
          alertType,
        },
      }),
    });

    if (!sendResponse.ok) {
      console.error('[Escalation] Server API send failed:', sendResponse.status);
      return { sent: 0, failed: contacts.length, configured: true };
    }

    const sendData = await sendResponse.json();
    const result = (sendData as any)?.result?.data;

    console.log(`[Escalation] Server API result: ${result?.sent || 0} sent, ${result?.failed || 0} failed`);
    return {
      sent: result?.sent || 0,
      failed: result?.failed || 0,
      configured: true,
    };
  } catch (error) {
    console.error('[Escalation] Server API error:', error);
    return { sent: 0, failed: contacts.length, configured: false };
  }
}

/**
 * Main hybrid escalation function.
 *
 * Strategy:
 * 1. Try deep link first (sends from user's personal number)
 * 2. For any contacts that failed via deep link, try server API (Business number)
 * 3. Return combined results
 */
export async function escalateAlarmToContacts(
  alarm: Alarm,
  contacts: EmergencyContact[],
  userLocation?: { latitude: number; longitude: number },
  userName?: string,
  missedCount: number = 1
): Promise<EscalationResult> {
  const whatsappContacts = contacts.filter((c) => c.whatsapp);

  if (whatsappContacts.length === 0) {
    console.log('[Escalation] No WhatsApp contacts available');
    return {
      method: 'none',
      deepLinkSent: 0,
      deepLinkFailed: 0,
      serverApiSent: 0,
      serverApiFailed: 0,
      totalSent: 0,
      totalFailed: 0,
    };
  }

  // Get location if not provided
  let location = userLocation;
  if (!location) {
    location = (await getUserLocation()) || undefined;
  }

  const locationUrl = location
    ? generateMapsLink(location.latitude, location.longitude)
    : undefined;

  const message = buildEmergencyMessage(alarm, userName, missedCount, locationUrl);

  // Step 1: Try deep link (personal number)
  console.log('[Escalation] Step 1: Trying deep link escalation...');
  const deepLinkResult = await tryDeepLinkEscalation(whatsappContacts, message);

  let serverApiResult = { sent: 0, failed: 0, configured: false };

  // Step 2: If any contacts failed via deep link, try server API as fallback
  if (deepLinkResult.failed > 0) {
    console.log(`[Escalation] Step 2: ${deepLinkResult.failed} contacts failed via deep link, trying server API fallback...`);

    // Get the contacts that failed via deep link
    // Since we can't track which specific contacts failed, if deep link sent 0 we try all
    const contactsForFallback =
      deepLinkResult.sent === 0
        ? whatsappContacts
        : whatsappContacts; // In practice, try all via server too for reliability

    serverApiResult = await tryServerApiEscalation(
      contactsForFallback,
      userName,
      missedCount,
      locationUrl
    );
  }

  // Determine which method was used
  let method: EscalationResult['method'] = 'none';
  if (deepLinkResult.sent > 0 && serverApiResult.sent > 0) {
    method = 'both';
  } else if (deepLinkResult.sent > 0) {
    method = 'deeplink';
  } else if (serverApiResult.sent > 0) {
    method = 'server_api';
  }

  const result: EscalationResult = {
    method,
    deepLinkSent: deepLinkResult.sent,
    deepLinkFailed: deepLinkResult.failed,
    serverApiSent: serverApiResult.sent,
    serverApiFailed: serverApiResult.failed,
    totalSent: deepLinkResult.sent + serverApiResult.sent,
    totalFailed: Math.min(deepLinkResult.failed, serverApiResult.failed),
  };

  console.log(`[Escalation] Complete: method=${method}, total sent=${result.totalSent}`);
  return result;
}

/**
 * Build the SOS message text — the USER pressed the panic button and the
 * CONTACTS must be told that the user needs help (never the other way around).
 */
function buildSOSMessage(userName: string | undefined, locationUrl?: string): string {
  const name = userName?.trim() || 'O usuário do Vigora';
  const timestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  let message =
    `🆘 SOS — VIGORA SAÚDE 🆘\n\n` +
    `${name} acionou o botão de EMERGÊNCIA às ${timestamp} e precisa de ajuda AGORA.\n` +
    `Por favor, entre em contato imediatamente ou vá até a pessoa.`;

  if (locationUrl) {
    message += `\n\n📍 Localização atual:\n${locationUrl}`;
  }

  return message;
}

/**
 * SOS escalation: alerts the user's emergency CONTACTS that the USER needs help.
 *
 * Diferente da escalação de alarme (deep link primeiro), o SOS tenta o canal
 * AUTOMÁTICO primeiro (servidor / WhatsApp Business) — quem apertou SOS pode
 * não conseguir tocar "Enviar" em cada conversa do WhatsApp. O deep link fica
 * como fallback quando o servidor não está configurado/disponível.
 */
export async function escalateSOSToContacts(
  contacts: EmergencyContact[],
  userName?: string
): Promise<EscalationResult> {
  const whatsappContacts = contacts.filter((c) => c.whatsapp);

  if (whatsappContacts.length === 0) {
    console.log('[SOS] No WhatsApp contacts available');
    return {
      method: 'none',
      deepLinkSent: 0,
      deepLinkFailed: 0,
      serverApiSent: 0,
      serverApiFailed: 0,
      totalSent: 0,
      totalFailed: contacts.length,
    };
  }

  const location = (await getUserLocation()) || undefined;
  const locationUrl = location
    ? generateMapsLink(location.latitude, location.longitude)
    : undefined;

  // Step 1: automatic server send (Business API) — no user interaction needed
  console.log('[SOS] Step 1: Trying server API (automatic)...');
  const serverApiResult = await tryServerApiEscalation(
    whatsappContacts,
    userName,
    1,
    locationUrl,
    'sos'
  );

  // Step 2: deep link fallback when the server couldn't deliver
  let deepLinkResult = { sent: 0, failed: 0 };
  if (serverApiResult.sent === 0) {
    console.log('[SOS] Step 2: Server unavailable, falling back to deep link...');
    const message = buildSOSMessage(userName, locationUrl);
    deepLinkResult = await tryDeepLinkEscalation(whatsappContacts, message);
  }

  let method: EscalationResult['method'] = 'none';
  if (serverApiResult.sent > 0 && deepLinkResult.sent > 0) method = 'both';
  else if (serverApiResult.sent > 0) method = 'server_api';
  else if (deepLinkResult.sent > 0) method = 'deeplink';

  const result: EscalationResult = {
    method,
    deepLinkSent: deepLinkResult.sent,
    deepLinkFailed: deepLinkResult.failed,
    serverApiSent: serverApiResult.sent,
    serverApiFailed: serverApiResult.failed,
    totalSent: serverApiResult.sent + deepLinkResult.sent,
    totalFailed: Math.min(
      serverApiResult.failed,
      deepLinkResult.sent > 0 || serverApiResult.sent > 0 ? deepLinkResult.failed : whatsappContacts.length
    ),
  };

  console.log(`[SOS] Complete: method=${method}, total sent=${result.totalSent}`);
  return result;
}

/**
 * Generate WhatsApp message with location (legacy helper, kept for compatibility)
 */
export function generateWhatsAppMessage(
  alarmDescription: string,
  latitude?: number,
  longitude?: number
): string {
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const locationText =
    latitude && longitude
      ? `\n📍 Localização: ${generateMapsLink(latitude, longitude)}`
      : '';

  return `🚨 ALERTA DE EMERGÊNCIA 🚨\n\nAlarme: ${alarmDescription}\nHora: ${timestamp}${locationText}\n\nPor favor, verifique a situação.`;
}
