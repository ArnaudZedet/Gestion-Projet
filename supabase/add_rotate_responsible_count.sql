-- Nombre de responsables tournants pour un projet en rotation (jusqu'ici la
-- rotation ne gérait toujours qu'une seule personne, même si plusieurs
-- responsables étaient cochés).
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

alter table projects add column if not exists rotate_responsible_count int not null default 1;
