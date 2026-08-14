-- 1. Plusieurs responsables possibles par projet (au lieu d'un seul) :
--    ajoute responsible_ids (liste), reprend automatiquement l'ancien
--    responsible_id s'il existait, sans rien perdre.
-- 2. Circuit de validation : un projet créé par un utilisateur non-admin
--    part en attente de validation (pending_approval) jusqu'à ce qu'un
--    administrateur le valide ; created_by mémorise qui l'a créé.
--
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

alter table projects add column if not exists responsible_ids jsonb not null default '[]'::jsonb;
alter table projects add column if not exists pending_approval boolean not null default false;
alter table projects add column if not exists created_by text;

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'projects' and column_name = 'responsible_id') then
    update projects set responsible_ids = to_jsonb(array[responsible_id])
      where responsible_id is not null and responsible_id <> '' and responsible_ids = '[]'::jsonb;
    alter table projects drop column responsible_id;
  end if;
end $$;
