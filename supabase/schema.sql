-- ============================================================
-- Vigora Saúde — Schema Supabase
-- Execute este arquivo no SQL Editor do Supabase
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

alter table public.users enable row level security;
alter table public.alarms enable row level security;
alter table public.alarm_events enable row level security;
alter table public.emergency_contacts enable row level security;

-- Políticas permissivas para anon key (sem auth próprio por ora)
-- Em produção, restringir por device_id verificado via JWT customizado
create policy "allow_all_users" on public.users for all using (true);
create policy "allow_all_alarms" on public.alarms for all using (true);
create policy "allow_all_events" on public.alarm_events for all using (true);
create policy "allow_all_contacts" on public.emergency_contacts for all using (true);

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
-- Substitua SEU_PROJETO e SUA_ANON_KEY pelos valores reais do seu projeto

-- select cron.schedule(
--   'check-missed-alarms',
--   '*/2 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://SEU_PROJETO.supabase.co/functions/v1/check-missed-alarms',
--     headers := '{"Authorization": "Bearer SUA_ANON_KEY"}'::jsonb
--   )
--   $$
-- );
