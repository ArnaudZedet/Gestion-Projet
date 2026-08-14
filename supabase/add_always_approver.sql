-- Permet de marquer un collaborateur comme "toujours approbateur, jamais
-- responsable" : exclu du tirage aléatoire de responsable (projet ou
-- tâche), et pris automatiquement au rôle RACI "A" (au lieu de "I") quand
-- on l'ajoute à une tâche en mode Équipe.
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

alter table members add column if not exists always_approver boolean not null default false;
