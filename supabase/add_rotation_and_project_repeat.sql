-- Deux ajouts :
-- 1. rotation_pool sur les tâches : mémorise qui n'a pas encore été tiré
--    dans le cycle en cours, pour un tirage aléatoire équitable (chacun
--    passe une fois avant qu'un nom puisse ressortir).
-- 2. repeat_unit / repeat_every sur les projets : permet à un projet entier
--    (avec ses tâches) de se recréer automatiquement à sa clôture.
--
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

alter table tasks add column if not exists rotation_pool jsonb not null default '[]'::jsonb;
alter table projects add column if not exists repeat_unit text not null default 'aucune';
alter table projects add column if not exists repeat_every int not null default 1;
