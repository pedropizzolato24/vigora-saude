/**
 * check-missed-alarms - Supabase Edge Function
 *
 * Verifica alarmes sem resposta após 5 minutos e envia alertas
 * via WhatsApp Business API para os contatos de emergência.
 *
 * Deploy: supabase functions deploy check-missed-alarms
 * Cron: a cada 2 minutos (configurado em schema.sql)
 *
 * SECURITY: Requer o header `X-Vigora-Cron-Secret` com valor igual à
 * env var CHECK_MISSED_ALARMS_SECRET. Sem isso, qualquer pessoa poderia
 * acionar a função (consumindo quota WhatsApp e marcando eventos como
 * escalated para inibir alertas reais).
 *
 * CORRECTNESS: Fetches emergency_contacts in a separate query keyed by
 * user_id, then stitches them with alarm_events in JS. The original
 * `.select("..., emergency_contacts(...)")` embed had no FK from
 * alarm_events to emergency_contacts and could match the wrong user's
 * contacts depending on PostgREST's auto-resolution.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authorizeRequest } from './auth.ts';
import {
  loadMissedEventsWithContacts,
  filterWhatsAppContacts,
  type Contact,
  type MissedEvent,
  type MissedEventStore,
} from './query.ts';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const WHATSAPP_API_TOKEN = Deno.env.get('WHATSAPP_API_TOKEN');
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
const ESCALATION_DELAY_MINUTES = 5; // Espera 5 minutos após o alarme

/** Wrap supabase-js in the minimal MissedEventStore interface. */
const store: MissedEventStore = {
  async findMissedEvents(beforeIso: string): Promise<MissedEvent[]> {
    const { data, error } = await supabaseAdmin
      .from('alarm_events')
      .select(`
        id,
        user_id,
        scheduled_at,
        alarm_id,
        alarms(description),
        users(name)
      `)
      .is('responded_at', null)
      .eq('escalated', false)
      .lt('scheduled_at', beforeIso);
    if (error) throw error;
    return (data ?? []) as unknown as MissedEvent[];
  },
  async findContactsByUserIds(userIds: string[]): Promise<Contact[]> {
    if (userIds.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from('emergency_contacts')
      .select('user_id, name, phone, whatsapp')
      .in('user_id', userIds);
    if (error) throw error;
    return (data ?? []) as unknown as Contact[];
  },
};

Deno.serve(async (req: Request) => {
  // Reject unauthorized callers before doing any work
  const denied = authorizeRequest(req);
  if (denied) return denied;

  const cutoffTime = new Date(
    Date.now() - ESCALATION_DELAY_MINUTES * 60 * 1000
  ).toISOString();

  let events;
  try {
    events = await loadMissedEventsWithContacts(store, cutoffTime);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let escalated = 0;

  for (const event of events) {
    const userName = event.users?.name ?? 'O usuário';
    const alarmDesc = event.alarms?.description ?? 'alarme de medicamento';
    const whatsappContacts = filterWhatsAppContacts(event.contacts);

    if (whatsappContacts.length === 0) {
      // Marcar como escalado mesmo sem contatos para não processar novamente
      await supabaseAdmin
        .from('alarm_events')
        .update({
          escalated: true,
          escalated_at: new Date().toISOString(),
          response_type: 'missed',
        })
        .eq('id', event.id);
      continue;
    }

    const alarmTime = new Date(event.scheduled_at).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

    const message =
      `⚠️ ALERTA VIGORA SAÚDE ⚠️\n\n` +
      `${userName} não respondeu ao alarme "${alarmDesc}".\n` +
      `Horário do alarme: ${alarmTime}\n\n` +
      `Por favor, entre em contato urgentemente.\n\n` +
      `- Enviado automaticamente pelo Vigora Saúde`;

    for (const contact of whatsappContacts) {
      if (WHATSAPP_API_TOKEN && WHATSAPP_PHONE_ID) {
        const phone = contact.phone.replace(/\D/g, '');
        const fullPhone = phone.length <= 11 ? `55${phone}` : phone;

        try {
          await fetch(
            `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: fullPhone,
                type: 'text',
                text: { body: message },
              }),
            }
          );
        } catch (sendError) {
          console.error(`[WhatsApp] Failed to send to ${fullPhone}:`, sendError);
        }
      }
    }

    // Marcar como escalado
    await supabaseAdmin
      .from('alarm_events')
      .update({
        escalated: true,
        escalated_at: new Date().toISOString(),
        response_type: 'missed',
      })
      .eq('id', event.id);

    escalated++;
  }

  return new Response(
    JSON.stringify({
      checked: events.length,
      escalated,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
});
