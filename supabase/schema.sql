-- ============================================================
-- Vigora Saúde — Schema Supabase
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================
--
-- SECURITY NOTE
-- -----------------------------------------------------------
-- O acesso direto ao Supabase a partir do CLIENTE foi removido
-- (a anon key fica embutida no APK/web bundle — qualquer pessoa
-- pode usá-la). Toda a sincronização agora vai pela API tRPC
-- autenticada (server/routers-monitoring.ts), que usa MySQL via
-- Drizzle.
--
-- O Supabase é mantido APENAS para a Edge Function
-- check-missed-alarms, que roda com SUPABASE_SERVICE_ROLE_KEY
-- (bypass RLS). As políticas abaixo bloqueiam totalmente o anon
-- role, mas mantêm as tabelas para histórico/migração.
--
-- Se você não usa mais a Edge Function, pode dropar o schema
-- com `drop schema public cascade` em um banco vazio.
-- ============================================================

-- Extensão para jobs agendados (pg_cron)
create extension if not exists pg_cron;

-- ─── Tabelas ──────────────────────────────────────────────────────────────────

-- Tabela de usuários (identificados por device_id)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,
  name text,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now()
);

-- Tabela de alarmes sincronizados
create table if not exists public.alarms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  local_id text not null,
  description text not null,
  time text not null,
  repeat text not null default 'daily',
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, local_id)
);

-- Tabela de eventos de alarme (cada vez que um alarme dispara)
create table if not exists public.alarm_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  alarm_id uuid references public.alarms(id) on delete cascade,
  scheduled_at timestamptz not null,
  responded_at timestamptz,
  response_type text check (response_type in ('dismissed','snoozed','missed')),
  escalated boolean default false,
  escalated_at timestamptz,
  created_at timestamptz default now()
);

-- Tabela de contatos de emergência no servidor
create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  name text not null,
  phone text not null,
  whatsapp boolean default true,
  created_at timestamptz default now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Bloqueio TOTAL para anon e authenticated roles. O acesso é feito
-- exclusivamente via service_role (Edge Function + servidor tRPC),
-- que faz bypass natural de RLS no Supabase.

alter table public.users enable row level security;
alter table public.alarms enable row level security;
alter table public.alarm_events enable row level security;
alter table public.emergency_contacts enable row level security;

-- Drop policies abertas existentes (se executado por cima do schema antigo)
drop policy if exists "allow_all_users"    on public.users;
drop policy if exists "allow_all_alarms"   on public.alarms;
drop policy if exists "allow_all_events"   on public.alarm_events;
drop policy if exists "allow_all_contacts" on public.emergency_contacts;

-- Nenhuma policy = nenhum acesso (com RLS habilitado).
-- Revoga acesso de anon/authenticated por segurança extra (defense in depth):
revoke all on public.users              from anon, authenticated;
revoke all on public.alarms             from anon, authenticated;
revoke all on public.alarm_events       from anon, authenticated;
revoke all on public.emergency_contacts from anon, authenticated;

-- service_role retains full access (Supabase grants it implicitly).

-- ─── Índices para performance ─────────────────────────────────────────────────

create index if not exists idx_alarm_events_user_scheduled
  on public.alarm_events(user_id, scheduled_at);

create index if not exists idx_alarm_events_not_responded
  on public.alarm_events(scheduled_at) where responded_at is null;

create index if not exists idx_alarms_user_id
  on public.alarms(user_id);

create index if not exists idx_emergency_contacts_user_id
  on public.emergency_contacts(user_id);

-- ─── Cron Job para escalação ──────────────────────────────────────────────────
-- ATENÇÃO: Execute este bloco SOMENTE APÓS fazer o deploy da Edge Function
-- A Edge Function exige o cabeçalho X-Vigora-Cron-Secret cujo valor deve
-- bater com CHECK_MISSED_ALARMS_SECRET (configurado nas env vars do projeto).

-- select cron.schedule(
--   'check-missed-alarms',
--   '*/2 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://SEU_PROJETO.supabase.co/functions/v1/check-missed-alarms',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer SUA_SERVICE_ROLE_KEY',
--       'X-Vigora-Cron-Secret', 'SEU_SECRET_AQUI'
--     )
--   )
--   $$
-- );
