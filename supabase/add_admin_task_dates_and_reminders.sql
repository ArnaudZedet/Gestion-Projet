-- Complète "Tâches Managers" : période (date de fin, pour étaler une tâche
-- sur plusieurs jours) et rappels automatiques (jour même / en retard).
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.
-- (Fonctionne que la table admin_tasks ait déjà été créée ou non.)

create table if not exists admin_tasks (
  id text primary key,
  title text not null,
  importance text not null default 'normale',
  assignee_id text,
  date date,
  status text not null default 'a_planifier',
  created_by text,
  updated_at timestamptz not null default now()
);

alter table admin_tasks add column if not exists end_date date;
alter table admin_tasks add column if not exists late_notified_at timestamptz;
alter table admin_tasks add column if not exists due_reminder_sent boolean not null default false;

alter table admin_tasks enable row level security;
drop policy if exists "authenticated all" on admin_tasks;
create policy "authenticated all" on admin_tasks for all to authenticated using (true) with check (true);
