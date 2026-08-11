-- À exécuter UNE FOIS, juste après avoir créé les nouvelles tables avec
-- schema.sql, et seulement si l'ancienne table "app_data" existe encore
-- (c'était l'ancien mode de stockage). Récupère vos données actuelles dans
-- les nouvelles tables. Sans effet si vous repartez de zéro.

insert into members (id, name, role, email, access_level, external)
select
  elem->>'id',
  elem->>'name',
  nullif(elem->>'role', ''),
  nullif(elem->>'email', ''),
  coalesce(nullif(elem->>'accessLevel', ''), 'utilisateur'),
  coalesce((elem->>'external')::boolean, false)
from app_data, jsonb_array_elements(value) as elem
where key = 'members'
on conflict (id) do nothing;

insert into projects (id, name, description, color, team_ids)
select
  elem->>'id',
  elem->>'name',
  nullif(elem->>'description', ''),
  nullif(elem->>'color', ''),
  coalesce(elem->'teamIds', '[]'::jsonb)
from app_data, jsonb_array_elements(value) as elem
where key = 'projects'
on conflict (id) do nothing;

insert into tasks (id, title, description, project_id, assign_mode, assignee_id, pool, raci, priority, importance, scope, status, start_date, deadline, repeat_unit, repeat_every, is_governance, governance_type, created_at)
select
  elem->>'id',
  elem->>'title',
  nullif(elem->>'description', ''),
  nullif(elem->>'projectId', ''),
  coalesce(nullif(elem->>'assignMode', ''), 'individuel'),
  nullif(elem->>'assigneeId', ''),
  coalesce(elem->'pool', '[]'::jsonb),
  coalesce(elem->'raci', '{}'::jsonb),
  elem->>'priority',
  elem->>'importance',
  elem->>'scope',
  elem->>'status',
  nullif(elem->>'startDate', '')::date,
  nullif(elem->>'deadline', '')::date,
  coalesce(nullif(elem->>'repeatUnit', ''), 'aucune'),
  coalesce((elem->>'repeatEvery')::int, 1),
  coalesce((elem->>'isGovernance')::boolean, false),
  nullif(elem->>'governanceType', ''),
  nullif(elem->>'createdAt', '')::date
from app_data, jsonb_array_elements(value) as elem
where key = 'tasks'
on conflict (id) do nothing;

insert into appointments (id, title, date, time, location, participants, external_participants, notes)
select
  elem->>'id',
  elem->>'title',
  nullif(elem->>'date', '')::date,
  nullif(elem->>'time', ''),
  nullif(elem->>'location', ''),
  coalesce(elem->'participants', '[]'::jsonb),
  coalesce(elem->'externalParticipants', '[]'::jsonb),
  nullif(elem->>'notes', '')
from app_data, jsonb_array_elements(value) as elem
where key = 'appointments'
on conflict (id) do nothing;

insert into external_contacts (id, name, organization, role, email)
select
  elem->>'id',
  elem->>'name',
  nullif(elem->>'organization', ''),
  nullif(elem->>'role', ''),
  nullif(elem->>'email', '')
from app_data, jsonb_array_elements(value) as elem
where key = 'externalContacts'
on conflict (id) do nothing;

insert into task_requests (id, kind, title, description, priority, importance, deadline, time, location, project_id, origin, requester_member_id, requester_contact_id, status, comment, created_at)
select
  elem->>'id',
  coalesce(nullif(elem->>'kind', ''), 'tache'),
  elem->>'title',
  nullif(elem->>'description', ''),
  nullif(elem->>'priority', ''),
  nullif(elem->>'importance', ''),
  nullif(elem->>'deadline', '')::date,
  nullif(elem->>'time', ''),
  nullif(elem->>'location', ''),
  nullif(elem->>'projectId', ''),
  coalesce(nullif(elem->>'origin', ''), 'interne'),
  nullif(elem->>'requesterMemberId', ''),
  nullif(elem->>'requesterContactId', ''),
  coalesce(nullif(elem->>'status', ''), 'en_attente'),
  nullif(elem->>'comment', ''),
  nullif(elem->>'createdAt', '')::date
from app_data, jsonb_array_elements(value) as elem
where key = 'taskRequests'
on conflict (id) do nothing;

-- Sécurité : on renomme l'ancienne table au lieu de la supprimer, pour
-- pouvoir vérifier que tout est bien passé avant de s'en débarrasser
-- définitivement (vous pourrez faire "drop table app_data_old;" plus tard).
alter table if exists app_data rename to app_data_old;
