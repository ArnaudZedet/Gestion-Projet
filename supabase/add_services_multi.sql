-- Permet à un collaborateur d'appartenir à PLUSIEURS services à la fois
-- (Radio + Scanner, par exemple), au lieu d'un seul service possible.
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.
--
-- Sans danger : si vous aviez déjà exécuté add_service_column.sql, vos
-- services déjà renseignés sont automatiquement repris dans le nouveau
-- format (liste). Si vous ne l'aviez jamais exécuté, ce script fonctionne
-- aussi tout seul.

alter table members add column if not exists services jsonb not null default '[]'::jsonb;

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'members' and column_name = 'service') then
    update members set services = to_jsonb(array[service])
      where service is not null and service <> '' and services = '[]'::jsonb;
    alter table members drop column service;
  end if;
end $$;
