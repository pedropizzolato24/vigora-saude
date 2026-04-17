import * as Linking from 'expo-linking';
import { Alarm, EmergencyContact } from './app-context';

/**
 * Escalate alarm by notifying emergency contacts via WhatsApp
 * This is called when an alarm is not dismissed within a timeout period
 */
export async function escalateAlarmToContacts(
  alarm: Alarm,
  contacts: EmergencyContact[],
  userLocation?: { latitude: number; longitude: number }
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  // Filter contacts that have WhatsApp enabled
  const whatsappContacts = contacts.filter(c => c.whatsapp);

  if (whatsappContacts.length === 0) {
    console.log('[Alarm Escalation] No WhatsApp contacts available');
    return { sent: 0, failed: 0 };
  }

  // Build message
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const locationText = userLocation
    ? `\n📍 Localização: https://maps.google.com/?q=${userLocation.latitude},${userLocation.longitude}`
    : '';

  const message = `🚨 ALERTA DE EMERGÊNCIA 🚨\n\nAlarme não respondido: ${alarm.description || 'Alarme sem descrição'}\nHora: ${timestamp}${locationText}\n\nPor favor, verifique a situação.`;

  // Send to each contact
  for (const contact of whatsappContacts) {
    try {
      // Format phone number for WhatsApp (remove special chars, add country code if needed)
      const phoneNumber = contact.phone.replace(/\D/g, '');
      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

      // Try to open WhatsApp
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
        sent++;
        console.log(`[Alarm Escalation] Message sent to ${contact.name}`);
      } else {
        failed++;
        console.error(`[Alarm Escalation] Cannot open WhatsApp for ${contact.name}`);
      }
    } catch (error) {
      failed++;
      console.error(`[Alarm Escalation] Error sending to ${contact.name}:`, error);
    }
  }

  return { sent, failed };
}

/**
 * Generate Google Maps link with current location
 */
export function generateMapsLink(latitude: number, longitude: number): string {
  return `https://maps.google.com/?q=${latitude},${longitude}`;
}

/**
 * Generate WhatsApp message with location
 */
export function generateWhatsAppMessage(
  alarmDescription: string,
  latitude?: number,
  longitude?: number
): string {
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const locationText = latitude && longitude
    ? `\n📍 Localização: ${generateMapsLink(latitude, longitude)}`
    : '';

  return `🚨 ALERTA DE EMERGÊNCIA 🚨\n\nAlarme: ${alarmDescription}\nHora: ${timestamp}${locationText}\n\nPor favor, verifique a situação.`;
}
