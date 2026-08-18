-- Ajoute un numéro de téléphone sur les contacts externes, affiché avec
-- l'email dans l'organigramme.
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

alter table external_contacts add column if not exists phone text;
