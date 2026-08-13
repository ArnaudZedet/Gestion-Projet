-- Ajoute un responsable de projet (distinct des responsables de tâches),
-- avec rotation optionnelle à chaque renouvellement du projet.
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

alter table projects add column if not exists responsible_id text;
alter table projects add column if not exists rotate_responsible boolean not null default false;
alter table projects add column if not exists responsible_rotation_pool jsonb not null default '[]'::jsonb;
