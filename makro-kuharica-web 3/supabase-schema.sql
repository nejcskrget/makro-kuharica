-- ============================================================================
-- Makro kuharica — Supabase shema za "ena naprava na uporabniški račun"
-- ============================================================================
-- Poganjaj v Supabase nadzorni plošči: SQL Editor → New query → prilepi vse
-- spodaj → Run. Enkraten korak, ob nastavitvi projekta.
-- ============================================================================

create table if not exists public.device_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id text not null,
  device_label text,
  updated_at timestamptz not null default now()
);

alter table public.device_sessions enable row level security;

-- vsak uporabnik lahko bere/piše SAMO svojo lastno vrstico (nikoli tuje)
create policy "lahko bere svojo sejo"
  on public.device_sessions for select
  using (auth.uid() = user_id);

create policy "lahko ustvari svojo sejo"
  on public.device_sessions for insert
  with check (auth.uid() = user_id);

create policy "lahko posodobi svojo sejo"
  on public.device_sessions for update
  using (auth.uid() = user_id);

-- ============================================================================
-- Kako dodaš novo (plačano) stranko:
-- Supabase nadzorna plošča → Authentication → Users → "Add user"
-- Vpiši njen e-poštni naslov in začasno geslo (lahko ji ga sporočiš, naj ga
-- kasneje sama spremeni prek "Pozabljeno geslo" — ali pošlji povabilo prek
-- "Send invite email", če imaš nastavljen e-poštni ponudnik).
-- ============================================================================
