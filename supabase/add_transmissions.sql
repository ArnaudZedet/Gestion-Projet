-- Cahier de transmission par service, séparé Manipulateurs / Secrétaires
-- (6 canaux : Secrétaires Radio/Scanner/IRM, Manipulateurs Radio/Scanner/IRM).
-- Chaque nouveau message notifie par email les membres de ce canal.
-- À exécuter une seule fois, dans Supabase : SQL Editor → New query → coller → Run.

create table if not exists transmissions (
  id text primary key,
  service text not null,
  function_group text not null, -- 'Secrétaire' ou 'Manipulateur'
  author_id text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table transmissions enable row level security;
drop policy if exists "authenticated all" on transmissions;
create policy "authenticated all" on transmissions for all to authenticated using (true) with check (true);
