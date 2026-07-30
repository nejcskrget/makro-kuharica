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
