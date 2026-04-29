/**
 * supabase-sync.ts
 *
 * Serviço de sincronização com o Supabase para o dead man's switch.
 * Sincroniza usuário, alarmes, contatos de emergência e eventos de alarme.
 *
 * Todas as funções são tolerantes a falhas - erros de rede não quebram o app.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { getOrCreateDeviceId } from './device-id';
import type { Alarm, EmergencyContact } from './app-context';

// --- Usuário ------------------------------------------------------------------

/**
 * Registra ou atualiza o usuário no Supabase.
 * Retorna o UUID do usuário no Supabase, ou null em caso de erro.
 */
export async function syncUser(name?: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const deviceId = await getOrCreateDeviceId();
    const { data, error } = await supabase
      .from('users')
      .upsert(
        {
          device_id: deviceId,
          name: name ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'device_id', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (error) throw error;
    return data?.id ?? null;
  } catch (e) {
    console.error('[Supabase] syncUser error:', e);
    return null;
  }
}

// --- Alarmes ------------------------------------------------------------------

/**
 * Sincroniza lista completa de alarmes do usuário com o Supabase.
 * Faz upsert dos alarmes locais e remove os que não existem mais.
 */
export async function syncAlarms(
  userId: string,
  alarms: Alarm[]
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const rows = alarms.map((a) => ({
      user_id: userId,
      local_id: a.id,
      description: a.description,
      time: a.time,
      repeat: a.repeat,
      enabled: a.enabled,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      await supabase
        .from('alarms')
        .upsert(rows, { onConflict: 'user_id,local_id' });
    }

    // Remover alarmes que não existem mais localmente
    if (alarms.length > 0) {
      const localIds = alarms.map((a) => a.id);
      await supabase
        .from('alarms')
        .delete()
        .eq('user_id', userId)
        .not('local_id', 'in', `(${localIds.map((id) => `"${id}"`).join(',')})`);
    } else {
      // Se não há alarmes locais, remover todos do servidor
      await supabase.from('alarms').delete().eq('user_id', userId);
    }
  } catch (e) {
    console.error('[Supabase] syncAlarms error:', e);
  }
}

// --- Eventos de alarme --------------------------------------------------------

/**
 * Cria um evento de alarme quando ele dispara.
 * Retorna o UUID do evento, ou null em caso de erro.
 */
export async function createAlarmEvent(
  userId: string,
  alarmLocalId: string,
  scheduledAt: Date
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data: alarmData } = await supabase
      .from('alarms')
      .select('id')
      .eq('user_id', userId)
      .eq('local_id', alarmLocalId)
      .single();

    if (!alarmData) return null;

    const { data, error } = await supabase
      .from('alarm_events')
      .insert({
        user_id: userId,
        alarm_id: alarmData.id,
        scheduled_at: scheduledAt.toISOString(),
        escalated: false,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data?.id ?? null;
  } catch (e) {
    console.error('[Supabase] createAlarmEvent error:', e);
    return null;
  }
}

/**
 * Registra a resposta do usuário ao alarme (dispensado ou soneca).
 * Chamado em alarm-ring.tsx ao dispensar ou soneca.
 */
export async function respondToAlarmEvent(
  eventId: string,
  responseType: 'dismissed' | 'snoozed'
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await supabase
      .from('alarm_events')
      .update({
        responded_at: new Date().toISOString(),
        response_type: responseType,
      })
      .eq('id', eventId);
  } catch (e) {
    console.error('[Supabase] respondToAlarmEvent error:', e);
  }
}

// --- Contatos de emergência ---------------------------------------------------

/**
 * Sincroniza contatos de emergência com o Supabase.
 * Substitui todos os contatos do usuário (delete + insert).
 */
export async function syncEmergencyContacts(
  userId: string,
  contacts: EmergencyContact[]
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await supabase.from('emergency_contacts').delete().eq('user_id', userId);

    if (contacts.length > 0) {
      await supabase.from('emergency_contacts').insert(
        contacts.map((c) => ({
          user_id: userId,
          name: c.name,
          phone: c.phone,
          whatsapp: c.whatsapp ?? true,
        }))
      );
    }
  } catch (e) {
    console.error('[Supabase] syncEmergencyContacts error:', e);
  }
}

// --- Heartbeat ----------------------------------------------------------------

/**
 * Envia heartbeat para o servidor saber que o app está ativo.
 * Chamado a cada 5 minutos pelo app-context.tsx.
 */
export async function sendHeartbeat(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', userId);
  } catch {
    // Falha silenciosa - não é crítico para o funcionamento do app
  }
}
