-- ============================================================================
-- Makro kuharica — PWA potisna obvestila
-- ============================================================================
-- Poganjaj v Supabase SQL Editorju po supabase-schema.sql.
-- Shrani samo naročnine, ki jih je uporabnik izrecno vključil v aplikaciji.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  timezone text not null default 'Europe/Ljubljana',
  enabled boolean not null default true,
  last_notified_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_enabled_idx
  on public.push_subscriptions (enabled)
  where enabled = true;

alter table public.push_subscriptions enable row level security;

create policy "bere svoje push narocnine"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "ustvari svojo push narocnino"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "ureja svojo push narocnino"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "izbrise svojo push narocnino"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);
