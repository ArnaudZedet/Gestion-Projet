-- Priorité (urgence) et Importance (impact) au niveau du projet, pour la
-- matrice de priorisation (qui ne porte plus que sur les projets, pas sur
-- les tâches). Réservé aux administrateurs dans l'interface.
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

alter table projects add column if not exists priority text not null default 'normale';
alter table projects add column if not exists importance text not null default 'moyenne';
