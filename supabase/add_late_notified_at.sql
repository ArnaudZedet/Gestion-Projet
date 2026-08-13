-- Mémorise si un projet en retard a déjà été signalé par email aux managers,
-- pour ne le signaler qu'une seule fois (pas tous les jours tant que ce
-- n'est pas corrigé). Réinitialisé automatiquement par l'app si les dates
-- ou le statut du projet changent.
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

alter table projects add column if not exists late_notified_at timestamptz;
