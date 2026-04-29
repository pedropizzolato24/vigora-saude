/**
 * check-missed-alarms - Supabase Edge Function
 *
 * Verifica alarmes sem resposta após 5 minutos e envia alertas
 * via WhatsApp Business API para os contatos de emergência.
 *
 * Deploy: supabase functions deploy check-missed-alarms
 * Cron: a cada 2 minutos (configurado em schema.sql)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const WHATSAPP_API_TOKEN = Deno.env.get('WHATSAPP_API_TOKEN');
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
const ESCALATION_DELAY_MINUTES = 5; // Espera 5 minutos após o alarme

Deno.serve(async () => {
  const cutoffTime = new Date(
    Date.now() - ESCALATION_DELAY_MINUTES * 60 * 1000
  ).toISOString();

  // Busca eventos de alarme sem resposta e não escalados ainda
  const { data: missedEvents, error } = await supabaseAdmin
    .from('alarm_events')
    .select(`
      id,
      user_id,
      scheduled_at,
      alarm_id,
      alarms(description),
      users(name),
      emergency_contacts(name, phone, whatsapp)
    `)
    .is('responded_at', null)
    .eq('escalated', false)
    .lt('scheduled_at', cutoffTime);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let escalated = 0;

  for (const event of (missedEvents ?? [])) {
    const userName = (event.users as any)?.name ?? 'O usuário';
    const alarmDesc = (event.alarms as any)?.description ?? 'alarme de medicamento';
    const contacts = (event.emergency_contacts as any[]) ?? [];
    const whatsappContacts = contacts.filter((c) => c.whatsapp);

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
      checked: missedEvents?.length ?? 0,
      escalated,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
});
