/**
 * supabase.ts
 *
 * Cliente Supabase para o Vigora Saúde.
 * Usado para sincronização de alarmes, contatos e dead man's switch.
 *
 * Configuração:
 *   EXPO_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-aqui
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Cria o cliente apenas se as credenciais estiverem configuradas.
// Quando não configurado, todas as funções de sync retornam silenciosamente.
const _supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = _supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    })
  : (null as any);

// ─── Tipos do banco ───────────────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          device_id: string;
          name: string | null;
          created_at: string;
          last_seen_at: string;
        };
        Insert: {
          device_id: string;
          name?: string | null;
          last_seen_at?: string;
        };
        Update: {
          name?: string | null;
          last_seen_at?: string;
        };
      };
      alarms: {
        Row: {
          id: string;
          user_id: string;
          local_id: string;
          description: string;
          time: string;
          repeat: string;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          local_id: string;
          description: string;
          time: string;
          repeat: string;
          enabled: boolean;
          updated_at?: string;
        };
        Update: {
          description?: string;
          time?: string;
          repeat?: string;
          enabled?: boolean;
          updated_at?: string;
        };
      };
      alarm_events: {
        Row: {
          id: string;
          user_id: string;
          alarm_id: string;
          scheduled_at: string;
          responded_at: string | null;
          response_type: 'dismissed' | 'snoozed' | 'missed' | null;
          escalated: boolean;
          escalated_at: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          alarm_id: string;
          scheduled_at: string;
          escalated?: boolean;
        };
        Update: {
          responded_at?: string;
          response_type?: 'dismissed' | 'snoozed' | 'missed';
          escalated?: boolean;
          escalated_at?: string;
        };
      };
      emergency_contacts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          phone: string;
          whatsapp: boolean;
        };
        Insert: {
          user_id: string;
          name: string;
          phone: string;
          whatsapp?: boolean;
        };
      };
    };
  };
};

/** Verifica se o Supabase está configurado (env vars presentes) */
export function isSupabaseConfigured(): boolean {
  return _supabaseConfigured;
}
