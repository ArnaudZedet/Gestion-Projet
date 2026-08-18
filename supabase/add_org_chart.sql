-- Nouvel onglet "Organigramme" : des boîtes hiérarchiques (org_nodes,
-- Siège SIMAGO → Opérationnel → Cabinet → services) et les personnes qui y
-- sont placées (org_assignments), chacune avec un rôle affiché propre à
-- cette place dans l'organigramme — modifier ce rôle ne touche jamais la
-- fiche collaborateur ni le contact externe.
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

create table if not exists org_nodes (
  id text primary key,
  parent_id text references org_nodes(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists org_assignments (
  id text primary key,
  node_id text not null references org_nodes(id) on delete cascade,
  person_type text not null, -- 'member' ou 'external'
  person_id text not null,
  role_label text,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['org_nodes', 'org_assignments']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "authenticated all" on %I;', t);
    execute format('create policy "authenticated all" on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
