-- Ajoute le service d'un projet (Radio / Scanner / IRM / Autre), utilisé
-- pour regrouper les projets par service dans la liste des tâches.
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

alter table projects add column if not exists service text;
