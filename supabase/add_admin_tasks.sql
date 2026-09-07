-- Planning partagé entre managers ("Tâches en attente") : tâches
-- administratives personnelles à Arnaud/Caroline, séparées du système de
-- tâches d'équipe (jamais visibles dans Tâches/Projets/Planning).
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

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

alter table admin_tasks enable row level security;
drop policy if exists "authenticated all" on admin_tasks;
create policy "authenticated all" on admin_tasks for all to authenticated using (true) with check (true);
