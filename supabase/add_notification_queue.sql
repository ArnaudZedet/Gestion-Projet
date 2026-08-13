-- File d'attente des notifications par email : chaque notification est
-- déposée ici au lieu d'être envoyée immédiatement, puis regroupée en un
-- seul email par destinataire une fois par jour (voir api/cron-daily.js).
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

create table if not exists notification_queue (
  id text primary key,
  recipient_email text not null,
  subject text not null,
  html text not null,
  created_at timestamptz not null default now()
);

alter table notification_queue enable row level security;
drop policy if exists "authenticated all" on notification_queue;
create policy "authenticated all" on notification_queue for all to authenticated using (true) with check (true);
