-- Rappel automatique au(x) responsable(s) d'un projet, un jour ouvré avant
-- son démarrage (dans le mail groupé de 13h de ce jour-là).
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

alter table projects add column if not exists start_reminder_sent boolean not null default false;
