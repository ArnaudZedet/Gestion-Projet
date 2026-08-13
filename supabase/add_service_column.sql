-- Ajoute le champ "service" (Radio / Scanner / IRM) aux collaborateurs.
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.
-- Sans danger : n'affecte aucune donnée existante (les collaborateurs déjà
-- créés auront simplement ce champ vide jusqu'à ce que vous le renseigniez).

alter table members add column if not exists service text;
