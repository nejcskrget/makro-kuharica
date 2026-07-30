-- ============================================================================
-- Makro kuharica — administratorsko urejanje receptov in jedilnikov
-- Poženi po supabase-schema.sql in supabase-schema-tracking.sql.
-- ============================================================================

create table if not exists public.admin_recipes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  meal_type text not null check (meal_type in ('zajtrk-vecerja', 'kosilo')),
  prep_minutes int not null default 0 check (prep_minutes >= 0),
  portions int not null default 1 check (portions > 0),
  fiber numeric not null default 0 check (fiber >= 0),
  ingredients jsonb not null default '[]'::jsonb,
  macros jsonb not null default '{"kcal":0,"p":0,"f":0,"c":0}'::jsonb,
  steps text not null default '',
  note text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_recipes enable row level security;

drop policy if exists "uporabniki berejo objavljene recepte" on public.admin_recipes;
create policy "uporabniki berejo objavljene recepte"
  on public.admin_recipes for select
  using (status = 'published' or public.is_admin());

drop policy if exists "admin ustvarja recepte" on public.admin_recipes;
create policy "admin ustvarja recepte"
  on public.admin_recipes for insert
  with check (public.is_admin());

drop policy if exists "admin ureja recepte" on public.admin_recipes;
create policy "admin ureja recepte"
  on public.admin_recipes for update
  using (public.is_admin())
  with check (public.is_admin());

-- Neposreden DELETE ni dovoljen. Brisanje poteka samo skozi spodnjo RPC
-- funkcijo, da ne morejo ostati osirotele kode v jedilnikih.
drop policy if exists "admin briše recepte" on public.admin_recipes;

-- Admin lahko strankam ustvari ali popravi tedenski jedilnik.
drop policy if exists "admin ustvarja jedilnike" on public.day_plans;
create policy "admin ustvarja jedilnike"
  on public.day_plans for insert
  with check (public.is_admin());

drop policy if exists "admin ureja jedilnike" on public.day_plans;
create policy "admin ureja jedilnike"
  on public.day_plans for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin briše prazne jedilnike" on public.day_plans;
create policy "admin briše prazne jedilnike"
  on public.day_plans for delete
  using (public.is_admin());

-- Indeksi pospešijo preverjanje in čiščenje uporabe recepta v jedilnikih.
create index if not exists day_plans_zajtrk_koda_idx
  on public.day_plans (zajtrk_koda) where zajtrk_koda is not null;
create index if not exists day_plans_kosilo_koda_idx
  on public.day_plans (kosilo_koda) where kosilo_koda is not null;
create index if not exists day_plans_vecerja_koda_idx
  on public.day_plans (vecerja_koda) where vecerja_koda is not null;

-- Transakcijsko izbriše recept in odstrani njegovo kodo iz vseh jedilnikov.
-- SECURITY DEFINER je varen, ker funkcija najprej preveri is_admin(), uporablja
-- prazen search_path in cilja izključno UUID, ki ga pošlje administrator.
create or replace function public.delete_admin_recipe(target_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_code text;
begin
  if not public.is_admin() then
    raise exception 'Samo administrator lahko izbriše recept.'
      using errcode = '42501';
  end if;

  select code into target_code
  from public.admin_recipes
  where id = target_id
  for update;

  if target_code is null then
    raise exception 'Recept ne obstaja.'
      using errcode = 'P0002';
  end if;

  update public.day_plans
  set
    zajtrk_koda = case when zajtrk_koda = target_code then null else zajtrk_koda end,
    kosilo_koda = case when kosilo_koda = target_code then null else kosilo_koda end,
    vecerja_koda = case when vecerja_koda = target_code then null else vecerja_koda end,
    updated_at = now()
  where zajtrk_koda = target_code
     or kosilo_koda = target_code
     or vecerja_koda = target_code;

  delete from public.admin_recipes where id = target_id;
  return target_code;
end;
$$;

revoke all on function public.delete_admin_recipe(uuid) from public;
revoke all on function public.delete_admin_recipe(uuid) from anon;
grant execute on function public.delete_admin_recipe(uuid) to authenticated;
