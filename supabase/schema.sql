-- Schéma v2 : une vraie table par type d'objet, au lieu d'un unique bloc JSON.
-- Chaque enregistrement se sauvegarde désormais individuellement : deux
-- personnes qui travaillent en même temps sur deux tâches différentes ne
-- s'écrasent plus l'une l'autre.
--
-- À exécuter dans Supabase : SQL Editor → New query → coller → Run.
-- Si vous avez déjà des données dans l'ancienne table "app_data", exécutez
-- ENSUITE le script migrate_from_app_data.sql pour les récupérer.

create table if not exists members (
  id text primary key,
  name text not null,
  role text,
  services jsonb not null default '[]'::jsonb,
  email text,
  access_level text not null default 'utilisateur',
  external boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id text primary key,
  name text not null,
  description text,
  color text,
  team_ids jsonb not null default '[]'::jsonb,
  external_ids jsonb not null default '[]'::jsonb,
  start_date date,
  end_date date,
  status text not null default 'en_cours',
  repeat_unit text not null default 'aucune',
  repeat_every int not null default 1,
  late_notified_at timestamptz,
  responsible_id text,
  rotate_responsible boolean not null default false,
  responsible_rotation_pool jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id text primary key,
  title text not null,
  description text,
  project_id text,
  assign_mode text not null default 'individuel',
  assignee_id text,
  pool jsonb not null default '[]'::jsonb,
  raci jsonb not null default '{}'::jsonb,
  priority text default 'normale',
  importance text default 'moyenne',
  scope text default 'courte',
  status text default 'a_faire',
  start_date date,
  deadline date,
  time text,
  repeat_unit text default 'aucune',
  repeat_every int default 1,
  avoid_days jsonb not null default '[]'::jsonb,
  rotate_assignee boolean not null default false,
  is_governance boolean default false,
  governance_type text,
  created_at date,
  updated_at timestamptz not null default now()
);

create table if not exists appointments (
  id text primary key,
  title text not null,
  date date,
  time text,
  location text,
  participants jsonb not null default '[]'::jsonb,
  external_participants jsonb not null default '[]'::jsonb,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists external_contacts (
  id text primary key,
  name text not null,
  organization text,
  role text,
  email text,
  updated_at timestamptz not null default now()
);

create table if not exists task_requests (
  id text primary key,
  kind text default 'tache',
  title text not null,
  description text,
  priority text,
  importance text,
  deadline date,
  time text,
  location text,
  project_id text,
  origin text default 'interne',
  requester_member_id text,
  requester_contact_id text,
  status text default 'en_attente',
  comment text,
  created_at date,
  updated_at timestamptz not null default now()
);

-- File d'attente des notifications par email : chaque notification (affectation
-- à un projet, tâche assignée, rotation de responsable...) est déposée ici au
-- lieu d'être envoyée immédiatement, puis regroupée en un seul email par
-- destinataire une fois par jour (voir api/cron-daily.js).
create table if not exists notification_queue (
  id text primary key,
  recipient_email text not null,
  subject text not null,
  html text not null,
  created_at timestamptz not null default now()
);

-- Sécurité : toute personne connectée (invitée par le manager) peut lire et
-- écrire. Les règles fines (qui peut créer/valider quoi) restent gérées
-- côté application, comme documenté dans le README.
do $$
declare
  t text;
begin
  foreach t in array array['members','projects','tasks','appointments','external_contacts','task_requests','notification_queue']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "authenticated all" on %I;', t);
    execute format('create policy "authenticated all" on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
