-- ============================================================================
-- Makro kuharica — Profili strank + dnevno spremljanje + nadzorna plošča
-- ============================================================================
-- Poganjaj v Supabase: SQL Editor → New query → prilepi vse spodaj → Run.
-- To je DODATEK k obstoječi shemi (supabase-schema.sql) — poženi tega ŠELE PO
-- tistem, tega ne nadomešča.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) PROFILI — osnovni podatki o stranki (izpolni ob prvi prijavi)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ime text,
  priimek text,
  starost int,
  visina_cm numeric,
  teza_kg numeric,
  cilj_kalorij int,
  is_admin boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Vsak lahko bere/ureja SVOJ profil
create policy "bere svoj profil" on public.profiles for select using (auth.uid() = user_id);
create policy "ustvari svoj profil" on public.profiles for insert with check (auth.uid() = user_id);
create policy "ureja svoj profil" on public.profiles for update using (auth.uid() = user_id);

-- Pomožna funkcija: ali je trenutni uporabnik admin? (SECURITY DEFINER se izogne
-- neskoncni rekurziji v RLS pravilih, ki bi nastala, ce bi policy neposredno
-- poizvedovala po isti tabeli profiles).
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false);
$$;

-- Admin lahko bere VSE profile (za nadzorno ploščo)
create policy "admin bere vse profile" on public.profiles for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 2) DNEVNI VNOSI — koraki, jutranja teža, ure spanca, večerno počutje/energija
-- ----------------------------------------------------------------------------
create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  koraki int,
  teza_jutro numeric,
  ure_spanca numeric,
  pocutje int check (pocutje between 1 and 5),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

alter table public.daily_logs enable row level security;

create policy "bere svoje vnose" on public.daily_logs for select using (auth.uid() = user_id);
create policy "ustvari svoj vnos" on public.daily_logs for insert with check (auth.uid() = user_id);
create policy "ureja svoj vnos" on public.daily_logs for update using (auth.uid() = user_id);
create policy "admin bere vse vnose" on public.daily_logs for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3) DNEVNI JEDILNIKI (v oblaku) — da admin vidi, kaj je stranka izbrala
-- ----------------------------------------------------------------------------
create table if not exists public.day_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  zajtrk_koda text,
  kosilo_koda text,
  vecerja_koda text,
  malice jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

alter table public.day_plans enable row level security;

create policy "bere svoj jedilnik" on public.day_plans for select using (auth.uid() = user_id);
create policy "ustvari svoj jedilnik" on public.day_plans for insert with check (auth.uid() = user_id);
create policy "ureja svoj jedilnik" on public.day_plans for update using (auth.uid() = user_id);
create policy "admin bere vse jedilnike" on public.day_plans for select using (public.is_admin());

-- ============================================================================
-- 4) NASTAVI SEBE (LASTNIKA) KOT ADMINA
-- ============================================================================
-- Po tem, ko se PRVIC prijaviš v aplikacijo s svojim računom (da nastane
-- vrstica v "profiles"), poženi spodnjo vrstico — zamenjaj e-pošto s svojo:
--
-- update public.profiles set is_admin = true
--   where user_id = (select id from auth.users where email = 'tvoja@posta.si');
-- ============================================================================
