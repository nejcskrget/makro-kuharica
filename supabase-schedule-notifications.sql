-- ============================================================================
-- Urnik za send-weight-reminders
-- ============================================================================
-- 1. Zamenjaj obe vrednosti PLACEHOLDER.
-- 2. Pozeni celotno datoteko v Supabase SQL Editorju samo enkrat.
-- 3. Edge Function se poklice vsako minuto; sama poslje obvestila samo med
--    06:30 in 06:34 po casovnem pasu posamezne narocnine in najvec enkrat/dan.
-- ============================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'https://oqoqzuectrxnstfolfqz.supabase.co',
  'push_project_url',
  'URL Supabase projekta za urnik PWA obvestil'
);

select vault.create_secret(
  '462f2f8ffde55c754a7ee692ec976c856f24f2020175e341464c94bb5fdee8fb',
  'push_cron_secret',
  'Skrivnost za klic send-weight-reminders'
);

select cron.schedule(
  'send-weight-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'push_project_url'
    ) || '/functions/v1/send-weight-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'push_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
