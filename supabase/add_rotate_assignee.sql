-- Permet à une tâche récurrente de faire tourner son responsable (à chaque
-- nouvelle occurrence, le responsable passe automatiquement à la personne
-- suivante dans l'équipe du projet) plutôt que de garder toujours la même
-- personne. À exécuter une seule fois, dans Supabase : SQL Editor → New
-- query → coller → Run.

alter table tasks add column if not exists rotate_assignee boolean not null default false;
