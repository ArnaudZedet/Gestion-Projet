import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient';
import {
  LayoutDashboard, ListChecks, Users, CalendarDays, Bell,
  Plus, X, Pencil, Trash2, AlertTriangle, CheckCircle2, Clock3,
  Search, Loader2, Inbox, GanttChartSquare, MapPin, Lock, Target, Repeat,
  ClipboardList, Send, XCircle, Building2, Mail, Phone, Check,
  Flag, PlayCircle, ShieldAlert, GraduationCap, Milestone as MilestoneIcon, Megaphone, ClipboardCheck,
  ChevronLeft, ChevronRight, ChevronDown, FolderPlus, List as ListIcon, Download, Copy, Upload, MessageSquare, Network, MessageCircle
} from 'lucide-react';

/* ---------------------------------------------------------------------- */
/*  Constantes                                                            */
/* ---------------------------------------------------------------------- */

const PRIORITIES = [
  { id: 'urgente', label: 'Urgente', color: '#B42318', bg: '#FEE4E2', bar: '#DC2626' },
  { id: 'haute',   label: 'Haute',   color: '#B54708', bg: '#FEF0C7', bar: '#F59E0B' },
  { id: 'normale', label: 'Normale', color: '#1849A9', bg: '#DBE7FE', bar: '#3B82F6' },
  { id: 'basse',   label: 'Basse',   color: '#475467', bg: '#F1F2F4', bar: '#94A3B8' },
];

const STATUSES = [
  { id: 'a_faire',  label: 'Programmé', color: '#475467', bg: '#F1F2F4' },
  { id: 'en_cours', label: 'En cours', color: '#1849A9', bg: '#DBE7FE' },
  { id: 'termine',  label: 'Terminé',  color: '#127A45', bg: '#D8F4E4' },
];

// Deux niveaux : Administrateur (tous droits) et Utilisateur (peut créer des
// tâches/projets/RDV, gérer le RACI et le planning ; la modification d'une
// tâche ou d'un projet existant reste réservée à son responsable, à
// l'approbateur RACI, ou à un administrateur — voir permissionsFor).
const ACCESS_LEVELS = [
  { id: 'manager',     label: 'Administrateur', desc: 'Accès total : équipe, contacts, tous les projets, toutes les tâches' },
  { id: 'utilisateur', label: 'Utilisateur',    desc: "Peut créer des tâches, projets et RDV ; modifier une tâche/un projet existant reste réservé au responsable, à l'approbateur ou à un administrateur" },
];

const RACI_LEVELS = [
  { id: 'R', label: 'Responsable', color: '#1849A9', bg: '#DBE7FE' },
  { id: 'A', label: 'Approbateur', color: '#6D28D9', bg: '#EDE4FF' },
  { id: 'C', label: 'Consulté',    color: '#0D9488', bg: '#D7F5F0' },
  { id: 'I', label: 'Informé',     color: '#475467', bg: '#F1F2F4' },
];

const IMPORTANCE = [
  { id: 'critique', label: 'Critique', color: '#B42318', bg: '#FEE4E2' },
  { id: 'elevee',   label: 'Élevée',   color: '#B54708', bg: '#FEF0C7' },
  { id: 'moyenne',  label: 'Moyenne',  color: '#1849A9', bg: '#DBE7FE' },
  { id: 'faible',   label: 'Faible',   color: '#475467', bg: '#F1F2F4' },
];
const SCOPES = [
  { id: 'eclair',  label: 'Rendez-vous (≤ 2h)',      short: 'RDV' },
  { id: 'courte',  label: 'Courte (quelques jours)', short: 'Courte' },
  { id: 'moyenne', label: 'Moyenne (quelques semaines)', short: 'Moyenne' },
  { id: 'longue',  label: 'Longue (plusieurs mois)', short: 'Longue' },
];
const isUrgent = (t) => t.priority === 'urgente' || t.priority === 'haute';
const isImportant = (t) => t.importance === 'critique' || t.importance === 'elevee';

const PROJECT_COLORS = ['#2563EB', '#0D9488', '#B54708', '#7C3AED', '#B42318', '#0369A1', '#4D7C0F'];
const FUNCTIONS = ['Manipulateur', 'Secrétaire', 'Aide manipulateur', 'Médecin', 'Échographiste', 'Manager'];
const SERVICES = ['Radio', 'Scanner', 'IRM'];
// Service d'un projet (distinct des services d'un collaborateur, qui peut en
// avoir plusieurs) — un projet a un seul service parmi ceux-ci, "Autre" inclus.
const PROJECT_SERVICES = ['Radio', 'Scanner', 'IRM', 'Autre'];
// Couleur dominante par service, utilisée pour regrouper visuellement les
// projets par service (distincte de la couleur propre à chaque projet).
const SERVICE_COLORS = { Scanner: '#2563EB', Radio: '#7C3AED', IRM: '#059669', Autre: '#EA580C' };
// Pôles croisés service + fonction (ex. "Manipulateur IRM") — seules les
// combinaisons qui concernent au moins une personne sont retenues, pour ne
// pas noyer l'écran de boutons vides.
function combinedPoolGroups(members) {
  const combos = [];
  SERVICES.forEach(s => {
    const ids = members.filter(m => (m.services || []).includes(s) && m.role === 'Secrétaire').map(m => m.id);
    if (ids.length > 0) combos.push({ label: `Secrétaires ${s}`, ids });
  });
  SERVICES.forEach(s => {
    // Aide manipulateur compté avec Manipulateur.
    const ids = members.filter(m => (m.services || []).includes(s) && (m.role === 'Manipulateur' || m.role === 'Aide manipulateur')).map(m => m.id);
    if (ids.length > 0) combos.push({ label: `Manipulateurs ${s}`, ids });
  });
  return combos;
}

// Analyse simple d'un fichier CSV (gère , et ; comme séparateur, et les guillemets)
function parseCSV(text) {
  const clean = text.replace(/^\uFEFF/, ''); // certains exports Excel ajoutent un caractère invisible en tout début de fichier
  const rawLines = clean.split(/\r\n|\n|\r/);
  const sample = rawLines.find(l => /[A-Za-zÀ-ÿ]/.test(l)) || rawLines[0] || '';
  const delimiter = (sample.match(/;/g) || []).length >= (sample.match(/,/g) || []).length ? ';' : ',';
  const splitLine = (line) => {
    const cells = []; let cur = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuotes = !inQuotes; continue; }
      if (c === delimiter && !inQuotes) { cells.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    cells.push(cur.trim());
    return cells;
  };
  // On ignore les lignes entièrement vides (ex : lignes de séparateurs seuls ";;") avant de choisir l'en-tête
  const parsed = rawLines.map(splitLine).filter(cells => cells.some(c => c !== ''));
  if (parsed.length === 0) return { header: [], rows: [] };
  const header = parsed[0];
  const rows = parsed.slice(1);
  return { header, rows };
}
const stripAccents = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// Certains exports Mac/Excel ne sont pas en UTF-8 (accents mal lus) ; on essaie plusieurs encodages
// et on garde celui qui produit le moins de caractères invalides.
function decodeBestEffort(buffer) {
  const attempts = ['utf-8', 'macintosh', 'windows-1252'].map(label => {
    try {
      const text = new TextDecoder(label, { fatal: false }).decode(buffer);
      return { text, bad: (text.match(/\uFFFD/g) || []).length };
    } catch (e) { return null; }
  }).filter(Boolean);
  attempts.sort((a, b) => a.bad - b.bad);
  return attempts.length ? attempts[0].text : '';
}
// Construit des collaborateurs "Utilisateur" (sans email) à partir d'un CSV nom/prénom/profession.
// Si aucune colonne reconnue, on suppose : colonne 1 = nom, colonne 2 = profession.
function membersFromCSV(text) {
  const { header, rows } = parseCSV(text);
  const h = header.map(stripAccents);
  const idxFirst = h.findIndex(x => x.includes('prenom'));
  const idxLast = h.findIndex(x => (x === 'nom' || x.includes('nom de famille')) && !x.includes('prenom'));
  const idxFull = h.findIndex(x => x.includes('nom complet') || x === 'name' || x.includes('nom et prenom'));
  const idxProf = h.findIndex(x => x.includes('profession') || x.includes('fonction') || x.includes('metier') || x.includes('poste'));
  const hasNameColumn = idxFirst >= 0 || idxLast >= 0 || idxFull >= 0;

  return rows.map(row => {
    let name, role;
    if (hasNameColumn) {
      name = idxFull >= 0 ? row[idxFull] : `${idxFirst >= 0 ? row[idxFirst] : ''} ${idxLast >= 0 ? row[idxLast] : ''}`.trim();
      role = idxProf >= 0 ? row[idxProf] : '';
    } else {
      name = row[0] || '';
      role = row[1] || '';
    }
    return { id: uid(), name, role, email: '', accessLevel: 'utilisateur', external: false };
  }).filter(m => m.name);
}

const REQUEST_ORIGINS = [
  { id: 'interne', label: 'De ma part' },
  { id: 'externe', label: "Pour un contact externe" },
];
const REQUEST_STATUSES = [
  { id: 'en_attente', label: 'En attente', color: '#B54708', bg: '#FEF0C7' },
  { id: 'approuvee',  label: 'Approuvée',  color: '#127A45', bg: '#D8F4E4' },
  { id: 'refusee',    label: 'Refusée',    color: '#B42318', bg: '#FEE4E2' },
];
const REQUEST_KINDS = [
  { id: 'tache',       label: 'Tâche' },
  { id: 'rendez_vous', label: 'Rendez-vous' },
];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// toISOString() convertit toujours en UTC : pour un fuseau en avance sur UTC
// (France), minuit local devient la veille en UTC, décalant la date d'un
// jour en arrière (ex. le 14 enregistré devenait le 13). On reformate donc
// à partir des composants locaux de la Date plutôt que de la convertir en UTC.
const toISODate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayISO = () => toISODate(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toISODate(d); };
const addMonths = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setMonth(d.getMonth() + n); return toISODate(d); };
const addYears = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setFullYear(d.getFullYear() + n); return toISODate(d); };
// Lundi de la semaine contenant cette date (pour répartir la charge des
// tâches cycliques par semaine plutôt que juste tourner aveuglément).
const startOfWeekISO = (iso) => { const dow = new Date(iso + 'T00:00:00').getDay(); return addDays(iso, dow === 0 ? -6 : 1 - dow); };

const daysBetween = (isoDate) => {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00');
  const t = new Date(todayISO() + 'T00:00:00');
  return Math.round((d - t) / 86400000);
};
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); };
const fmtDateLong = (iso) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }); };
// Regroupe les chiffres deux par deux avec un point ("0612345678" →
// "06.12.34.56.78") pour une lecture plus facile, quelle que soit la façon
// dont le numéro a été saisi (espaces, tirets...).
const fmtPhone = (p) => { if (!p) return ''; const digits = String(p).replace(/\D/g, ''); return digits.match(/.{1,2}/g)?.join('.') || p; };

const REPEAT_UNITS = [
  { id: 'aucune',  label: 'Ne se répète pas' },
  { id: 'jour',    label: 'Jour(s)' },
  { id: 'semaine', label: 'Semaine(s)' },
  { id: 'mois',    label: 'Mois' },
  { id: 'an',      label: 'Année(s)' },
];
const shiftByRepeat = (iso, unit, every) => {
  if (!iso) return iso;
  const n = Math.max(1, every || 1);
  if (unit === 'jour') return addDays(iso, n);
  if (unit === 'semaine') return addDays(iso, n * 7);
  if (unit === 'mois') return addMonths(iso, n);
  if (unit === 'an') return addYears(iso, n);
  return iso;
};
const repeatLabel = (unit, every) => {
  const n = Math.max(1, every || 1);
  if (unit === 'jour') return n === 1 ? 'Tous les jours' : `Tous les ${n} jours`;
  if (unit === 'semaine') return n === 1 ? 'Toutes les semaines' : `Toutes les ${n} semaines`;
  if (unit === 'mois') return n === 1 ? 'Tous les mois' : `Tous les ${n} mois`;
  if (unit === 'an') return n === 1 ? 'Tous les ans' : `Tous les ${n} ans`;
  return '';
};
// Jours de la semaine (convention JS Date.getDay() : 0 = dimanche ... 6 = samedi)
const WEEKDAYS = [
  { id: 1, label: 'Lundi' }, { id: 2, label: 'Mardi' }, { id: 3, label: 'Mercredi' },
  { id: 4, label: 'Jeudi' }, { id: 5, label: 'Vendredi' }, { id: 6, label: 'Samedi' }, { id: 0, label: 'Dimanche' },
];
const isAvoidedDay = (iso, avoidDays) => {
  if (!avoidDays || avoidDays.length === 0) return false;
  return avoidDays.includes(new Date(iso + 'T00:00:00').getDay());
};
// Projette les prochaines occurrences d'une tâche répétitive (affichage uniquement,
// aucune tâche réelle n'est créée — la vraie occurrence suivante n'apparaît qu'à la validation).
// Les jours cochés dans "avoidDays" sont simplement omis de la projection.
function projectOccurrences(task, monthsAhead = 12, maxCount = 60) {
  if (!task.deadline) return [];
  if (!task.repeatUnit || task.repeatUnit === 'aucune') return [task.deadline];
  const horizon = addMonths(todayISO(), monthsAhead);
  const dates = [];
  if (!isAvoidedDay(task.deadline, task.avoidDays)) dates.push(task.deadline);
  let cur = task.deadline;
  let count = 0;
  while (count < maxCount) {
    cur = shiftByRepeat(cur, task.repeatUnit, task.repeatEvery);
    if (cur > horizon) break;
    if (!isAvoidedDay(cur, task.avoidDays)) dates.push(cur);
    count++;
  }
  return dates;
}

// Étapes types de conduite de projet — deviennent de vraies tâches (isGovernance) mêlées aux tâches du projet
const GOVERNANCE_TYPES = [
  { id: 'preparation', label: 'Préparation du changement', Icon: Megaphone,      hint: 'Cadrage, parties prenantes, plan de communication' },
  { id: 'kickoff',      label: 'Réunion de lancement',      Icon: Flag,           hint: 'Lancement officiel du projet' },
  { id: 'demarrage',    label: 'Démarrage opérationnel',    Icon: PlayCircle,     hint: '' },
  { id: 'suivi',        label: 'Point de suivi régulier',   Icon: Repeat,         hint: 'Comité de suivi / pilotage' },
  { id: 'revue',        label: 'Revue à mi-parcours',       Icon: MilestoneIcon,  hint: '' },
  { id: 'risques',      label: 'Revue des risques',         Icon: ShieldAlert,    hint: '' },
  { id: 'formation',    label: 'Formation / accompagnement',Icon: GraduationCap,  hint: 'Montée en compétence des équipes' },
  { id: 'cloture',      label: 'Clôture & bilan (RETEX)',   Icon: ClipboardCheck, hint: 'Indicateurs de succès, retour d\'expérience' },
  { id: 'autre',        label: 'Étape personnalisée',       Icon: Flag,           hint: '' },
];
const governanceType = (id) => GOVERNANCE_TYPES.find(t => t.id === id) || GOVERNANCE_TYPES[GOVERNANCE_TYPES.length - 1];

function buildGovernanceTasks(start, end, projectId, creatorId) {
  const span = Math.max(1, dayDiff(start, end));
  const mid = addDays(start, Math.round(span / 2));
  const base = (governanceTypeId, label, date, extra = {}) => ({
    id: uid(), title: label, description: '', projectId, assignMode: 'individuel',
    assigneeId: creatorId || '', pool: [], raci: {}, priority: 'normale', importance: 'moyenne', scope: 'courte',
    status: 'a_faire', startDate: date, deadline: date, createdAt: todayISO(),
    repeatUnit: 'aucune', repeatEvery: 1, isGovernance: true, governanceType: governanceTypeId, ...extra,
  });
  return [
    base('preparation', 'Préparation du changement', start, { importance: 'elevee', description: 'Cadrage, parties prenantes, plan de communication' }),
    base('kickoff', 'Réunion de lancement', addDays(start, Math.min(7, Math.max(1, Math.round(span * 0.05)))), { priority: 'haute' }),
    base('demarrage', 'Démarrage opérationnel', addDays(start, Math.min(14, Math.max(2, Math.round(span * 0.08))))),
    base('suivi', 'Point de suivi', addDays(start, 14), { repeatUnit: 'semaine', repeatEvery: 1, description: 'Comité de suivi' }),
    base('revue', 'Revue à mi-parcours', mid),
    base('risques', 'Revue des risques', addDays(start, Math.round(span * 0.3))),
    base('cloture', 'Clôture & bilan (RETEX)', end, { importance: 'elevee', description: "Indicateurs de succès, retour d'expérience" }),
  ];
}


/* ---------------------------------------------------------------------- */
/*  Stockage — une vraie table par type d'objet (CRUD ligne à ligne)      */
/* ---------------------------------------------------------------------- */

const d = (v) => (v ? v : null); // '' -> null pour les colonnes date

const ROW_MAPPERS = {
  members: {
    table: 'members',
    toRow: (m) => ({ id: m.id, name: m.name, role: m.role || null, services: m.services || [], email: m.email || null, access_level: m.accessLevel, external: !!m.external, always_approver: !!m.alwaysApprover }),
    fromRow: (r) => ({ id: r.id, name: r.name, role: r.role || '', services: r.services || [], email: r.email || '', accessLevel: r.access_level, external: !!r.external, alwaysApprover: !!r.always_approver }),
  },
  projects: {
    table: 'projects',
    toRow: (p) => ({ id: p.id, name: p.name, description: p.description || null, color: p.color || null, service: p.service || null, team_ids: p.teamIds || [], external_ids: p.externalIds || [], start_date: d(p.startDate), end_date: d(p.endDate), status: p.status || 'en_cours', priority: p.priority || 'normale', importance: p.importance || 'moyenne', repeat_unit: p.repeatUnit || 'aucune', repeat_every: p.repeatEvery || 1, late_notified_at: p.lateNotifiedAt || null, start_reminder_sent: !!p.startReminderSent, end_reminder_sent: !!p.endReminderSent, responsible_ids: p.responsibleIds || [], rotate_responsible: !!p.rotateResponsible, rotate_responsible_count: p.rotateResponsibleCount || 1, responsible_rotation_pool: p.responsibleRotationPool || [], pending_approval: !!p.pendingApproval, created_by: p.createdBy || null }),
    fromRow: (r) => ({ id: r.id, name: r.name, description: r.description || '', color: r.color || '', service: r.service || '', teamIds: r.team_ids || [], externalIds: r.external_ids || [], startDate: r.start_date || '', endDate: r.end_date || '', status: r.status || 'en_cours', priority: r.priority || 'normale', importance: r.importance || 'moyenne', repeatUnit: r.repeat_unit || 'aucune', repeatEvery: r.repeat_every || 1, lateNotifiedAt: r.late_notified_at || null, startReminderSent: !!r.start_reminder_sent, endReminderSent: !!r.end_reminder_sent, responsibleIds: (r.responsible_ids && r.responsible_ids.length ? r.responsible_ids : (r.responsible_id ? [r.responsible_id] : [])), rotateResponsible: !!r.rotate_responsible, rotateResponsibleCount: r.rotate_responsible_count || 1, responsibleRotationPool: r.responsible_rotation_pool || [], pendingApproval: !!r.pending_approval, createdBy: r.created_by || '' }),
  },
  tasks: {
    table: 'tasks',
    toRow: (t) => ({
      id: t.id, title: t.title, description: t.description || null, project_id: t.projectId || null,
      assign_mode: t.assignMode, assignee_id: t.assigneeId || null, pool: t.pool || [], raci: t.raci || {},
      priority: t.priority, importance: t.importance, scope: t.scope, status: t.status,
      start_date: d(t.startDate), deadline: d(t.deadline), time: t.time || null,
      repeat_unit: t.repeatUnit, repeat_every: t.repeatEvery, avoid_days: t.avoidDays || [],
      rotate_assignee: !!t.rotateAssignee, rotation_pool: t.rotationPool || [],
      is_governance: !!t.isGovernance, governance_type: t.governanceType || null, created_at: d(t.createdAt),
    }),
    fromRow: (r) => ({
      id: r.id, title: r.title, description: r.description || '', projectId: r.project_id || '',
      assignMode: r.assign_mode, assigneeId: r.assignee_id || '', pool: r.pool || [], raci: r.raci || {},
      priority: r.priority, importance: r.importance, scope: r.scope, status: r.status,
      startDate: r.start_date || '', deadline: r.deadline || '', time: r.time || '',
      repeatUnit: r.repeat_unit, repeatEvery: r.repeat_every, avoidDays: r.avoid_days || [],
      rotateAssignee: !!r.rotate_assignee, rotationPool: r.rotation_pool || [],
      isGovernance: !!r.is_governance, governanceType: r.governance_type || undefined, createdAt: r.created_at || '',
    }),
  },
  appointments: {
    table: 'appointments',
    toRow: (a) => ({ id: a.id, title: a.title, date: d(a.date), time: a.time || null, location: a.location || null, participants: a.participants || [], external_participants: a.externalParticipants || [], notes: a.notes || null }),
    fromRow: (r) => ({ id: r.id, title: r.title, date: r.date || '', time: r.time || '', location: r.location || '', participants: r.participants || [], externalParticipants: r.external_participants || [], notes: r.notes || '' }),
  },
  externalContacts: {
    table: 'external_contacts',
    toRow: (c) => ({ id: c.id, name: c.name, organization: c.organization || null, role: c.role || null, email: c.email || null, phone: c.phone || null }),
    fromRow: (r) => ({ id: r.id, name: r.name, organization: r.organization || '', role: r.role || '', email: r.email || '', phone: r.phone || '' }),
  },
  orgNodes: {
    table: 'org_nodes',
    toRow: (n) => ({ id: n.id, parent_id: n.parentId || null, label: n.label, sort_order: n.sortOrder || 0 }),
    fromRow: (r) => ({ id: r.id, parentId: r.parent_id || '', label: r.label, sortOrder: r.sort_order || 0 }),
  },
  orgAssignments: {
    table: 'org_assignments',
    toRow: (a) => ({ id: a.id, node_id: a.nodeId, person_type: a.personType, person_id: a.personId, role_label: a.roleLabel || null, sort_order: a.sortOrder || 0 }),
    fromRow: (r) => ({ id: r.id, nodeId: r.node_id, personType: r.person_type, personId: r.person_id, roleLabel: r.role_label || '', sortOrder: r.sort_order || 0 }),
  },
  transmissions: {
    table: 'transmissions',
    toRow: (t) => ({ id: t.id, service: t.service, function_group: t.functionGroup, author_id: t.authorId, message: t.message }),
    fromRow: (r) => ({ id: r.id, service: r.service, functionGroup: r.function_group, authorId: r.author_id, message: r.message, createdAt: r.created_at }),
  },
  taskRequests: {
    table: 'task_requests',
    toRow: (r) => ({
      id: r.id, kind: r.kind, title: r.title, description: r.description || null,
      priority: r.priority || null, importance: r.importance || null, deadline: d(r.deadline),
      time: r.time || null, location: r.location || null, project_id: r.projectId || null,
      origin: r.origin, requester_member_id: r.requesterMemberId || null, requester_contact_id: r.requesterContactId || null,
      status: r.status, comment: r.comment || null, created_at: d(r.createdAt),
    }),
    fromRow: (row) => ({
      id: row.id, kind: row.kind, title: row.title, description: row.description || '',
      priority: row.priority || '', importance: row.importance || '', deadline: row.deadline || '',
      time: row.time || '', location: row.location || '', projectId: row.project_id || '',
      origin: row.origin, requesterMemberId: row.requester_member_id || '', requesterContactId: row.requester_contact_id || '',
      status: row.status, comment: row.comment || '', createdAt: row.created_at || '',
    }),
  },
};

async function fetchAll(key) {
  const { table, fromRow } = ROW_MAPPERS[key];
  const { data, error } = await supabase.from(table).select('*');
  if (error) { console.error('Erreur de chargement', key, error); return { error: true, items: [] }; }
  return { error: false, items: (data || []).map(fromRow) };
}
async function loadAll() {
  const out = {};
  for (const key of Object.keys(ROW_MAPPERS)) out[key] = await fetchAll(key);
  return out;
}
async function insertRows(key, items) {
  if (!items || items.length === 0) return true;
  const { table, toRow } = ROW_MAPPERS[key];
  const { error } = await supabase.from(table).insert(items.map(toRow));
  if (error) { console.error('Erreur de création', key, error); return false; }
  return true;
}
async function upsertRow(key, item) {
  const { table, toRow } = ROW_MAPPERS[key];
  const { error } = await supabase.from(table).upsert(toRow(item));
  if (error) { console.error('Erreur de sauvegarde', key, error); return false; }
  return true;
}
async function upsertRows(key, items) {
  if (!items || items.length === 0) return true;
  const { table, toRow } = ROW_MAPPERS[key];
  const { error } = await supabase.from(table).upsert(items.map(toRow));
  if (error) { console.error('Erreur de sauvegarde', key, error); return false; }
  return true;
}
async function deleteRow(key, id) {
  const { table } = ROW_MAPPERS[key];
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) { console.error('Erreur de suppression', key, error); return false; }
  return true;
}
// Notification discrète en bas d'écran (toast), à la place des popups
// natives du navigateur (alert/confirm) qui figent toute la page. Un simple
// événement DOM plutôt qu'un contexte React : ça reste appelable depuis des
// fonctions autonomes comme warnIfFailed, sans avoir à faire transiter un
// callback partout.
function showToast(message, type = 'error') {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type } }));
}

// Prévient l'utilisateur si un enregistrement Supabase échoue, au lieu de le laisser
// silencieusement disparaître au prochain rechargement (c'est ce qui causait des
// tâches "qui réapparaissent" après suppression/modification).
function warnIfFailed(ok, action) {
  if (!ok) showToast(`${action} n'a pas pu être enregistré(e) en base (problème de connexion). Vérifiez votre connexion internet et réessayez — sinon la modification sera perdue au prochain rechargement.`);
}

// Les emails de notification interpolent du texte saisi par n'importe quel
// collaborateur (titre de tâche, nom de projet, message de transmission…)
// dans du HTML envoyé à d'autres personnes — sans échappement, "<img
// src=x onerror=...>" ou un lien caché s'exécuterait/s'afficherait tel quel
// dans la boîte mail du destinataire. On échappe systématiquement avant
// interpolation dans un template d'email.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}


/* ---------------------------------------------------------------------- */
/*  Permissions & aides de portée (référent → "ses" projets)              */
/* ---------------------------------------------------------------------- */

function permissionsFor(accessLevel) {
  const isManager = accessLevel === 'manager';
  return {
    // isReferent gardé à true pour tout le monde : l'ancien rôle "référent"
    // a été fusionné dans "utilisateur" (mêmes droits de création/vue), seule
    // la distinction manager/non-manager compte encore pour la portée
    // globale. La modification d'une tâche/projet EXISTANT(E), elle, est
    // maintenant tranchée au cas par cas (voir canEditTask/canEditProject
    // dans TaskModal/ProjectModal), pas par ce rôle.
    accessLevel, isManager, isReferent: true,
    canManageTeam: isManager,
    canManageContacts: isManager,
    canSeeOverview: isManager,
    canSeeAllTasks: isManager,
    canCreateTask: true,
    canCreateProject: true,
    canManageAppointments: true,
    canEditRaci: true,
    canReviewRequests: isManager,
  };
}

// Qui peut modifier une tâche existante : son responsable (assigné en mode
// individuel, ou rôle RACI "R"/"A" en mode équipe), le responsable du projet
// qui la contient, ou un administrateur. Les autres (informés, consultés,
// candidats d'un pool pas encore pris, non impliqués) sont en lecture seule.
function canEditTask(t, memberId, project, isManager) {
  if (isManager) return true;
  if (!t) return true; // nouvelle tâche : création ouverte à tous
  if (t.assigneeId === memberId) return true;
  if (t.raci && (t.raci[memberId] === 'R' || t.raci[memberId] === 'A')) return true;
  if (project && (project.responsibleIds || []).includes(memberId)) return true;
  return false;
}
// Qui peut modifier un projet existant : un de ses responsables (il peut y
// en avoir plusieurs), ou un administrateur.
function canEditProject(p, memberId, isManager) {
  if (isManager) return true;
  if (!p) return true; // nouveau projet : création ouverte à tous
  return (p.responsibleIds || []).includes(memberId);
}

function isTaskOfMine(t, memberId) {
  if (!memberId) return false;
  if (t.assigneeId === memberId) return true;
  if (t.pool && t.pool.includes(memberId)) return true;
  if (t.raci && t.raci[memberId]) return true;
  return false;
}
function responsibleIdsOf(t) {
  const raciR = Object.entries(t.raci || {}).filter(([, r]) => r === 'R').map(([id]) => id);
  if (raciR.length > 0) return raciR;
  if (t.assigneeId) return [t.assigneeId];
  return [];
}
// Un projet n'est "à moi" que si j'en suis membre déclaré de l'équipe —
// être simplement tagué sur une tâche isolée (RACI, pool...) ne suffit
// plus à rendre tout le projet, ni ses autres tâches, visibles.
function myProjectIds(memberId, projects) {
  const ids = new Set();
  projects.forEach(p => { if ((p.teamIds || []).includes(memberId)) ids.add(p.id); });
  return ids;
}
const isProjectLate = (p) => !!(p.endDate && p.status !== 'termine' && daysBetween(p.endDate) < 0);

/* ---------------------------------------------------------------------- */
/*  Petits composants UI                                                  */
/* ---------------------------------------------------------------------- */

function PriorityTag({ id }) {
  const p = PRIORITIES.find(x => x.id === id) || PRIORITIES[2];
  return <span style={{ color: p.color, background: p.bg }} className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">{p.label}</span>;
}
function StatusTag({ id }) {
  const s = STATUSES.find(x => x.id === id) || STATUSES[0];
  return <span style={{ color: s.color, background: s.bg }} className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">{s.label}</span>;
}
function ImportanceTag({ id }) {
  const v = IMPORTANCE.find(x => x.id === id) || IMPORTANCE[2];
  return <span style={{ color: v.color, background: v.bg }} className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">{v.label}</span>;
}
function ScopeTag({ id }) {
  const v = SCOPES.find(x => x.id === id) || SCOPES[1];
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-slate-100 text-slate-500 border border-slate-200">{v.short}</span>;
}
function RoleTag({ id }) {
  // Repli sur "utilisateur" : couvre aussi les fiches enregistrées avant la
  // fusion du rôle "référent" dans "utilisateur" (id encore présent en base).
  const r = ACCESS_LEVELS.find(x => x.id === id) || ACCESS_LEVELS[1];
  const styles = { manager: { c: '#B42318', b: '#FEE4E2' }, utilisateur: { c: '#475467', b: '#F1F2F4' } };
  const s = styles[id] || styles.utilisateur;
  return <span style={{ color: s.c, background: s.b }} className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">{r.label}</span>;
}
function GovIcon({ id, size = 12, className = '' }) {
  const t = governanceType(id);
  return <t.Icon size={size} className={className} />;
}

function Avatar({ name, size = 32 }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return (
    <div title={name} style={{ width: size, height: size, background: `hsl(${hue} 55% 40%)`, fontSize: size * 0.38 }}
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0">
      {initials}
    </div>
  );
}

function DeadlineBadge({ startDate, deadline, status }) {
  if (!deadline) return <span className="text-xs text-slate-400">Sans échéance</span>;
  const d = daysBetween(deadline);
  const done = status === 'termine';
  let cls = 'text-slate-500', label = fmtDate(deadline);
  if (!done && d < 0) { cls = 'text-red-600 font-semibold'; label = `${fmtDate(deadline)} · retard ${Math.abs(d)}j`; }
  else if (!done && d === 0) { cls = 'text-amber-600 font-semibold'; label = "Aujourd'hui"; }
  else if (!done && d <= 3) { cls = 'text-amber-600'; label = `${fmtDate(deadline)} · J-${d}`; }
  return (
    <span className="text-xs">
      {startDate && <span className="text-slate-400">{fmtDate(startDate)} → </span>}
      <span className={cls}>{label}</span>
    </span>
  );
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3"><Icon size={20} className="text-slate-400" /></div>
      <div className="text-sm font-medium text-slate-600">{title}</div>
      {subtitle && <div className="text-xs text-slate-400 mt-1 max-w-xs">{subtitle}</div>}
    </div>
  );
}
function ReadOnlyNotice() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-2.5 py-1.5 rounded-lg mb-3.5">
      <Lock size={12} /> Lecture seule — modification réservée aux personnes autorisées
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Emails / calendrier (.ics)                                            */
/* ---------------------------------------------------------------------- */

function buildMailto({ to, subject, body }) {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  return `mailto:${to.join(',')}?${params.toString().replace(/\+/g, '%20')}`;
}
function downloadTextFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const icsEsc = (s) => (s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const icsStamp = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

function buildICS(appt, invitees) {
  const time = appt.time || '09:00';
  const start = new Date(`${appt.date}T${time}:00`);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const attendees = invitees.filter(p => p.email).map(p => `ATTENDEE;CN=${icsEsc(p.name)}:mailto:${p.email}`);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mes projets//FR', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${appt.id || uid()}@mes-projets-app`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEsc(appt.title)}`,
    `LOCATION:${icsEsc(appt.location)}`,
    `DESCRIPTION:${icsEsc(appt.notes)}`,
    ...attendees,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

// Export groupé du planning (plusieurs événements dans un seul fichier .ics)
function buildICSMulti(events) {
  const blocks = events.map(e => {
    const start = new Date(`${e.date}T${e.time || '09:00'}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return [
      'BEGIN:VEVENT',
      `UID:${uid()}@mes-projets-app`,
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${icsStamp(start)}`,
      `DTEND:${icsStamp(end)}`,
      `SUMMARY:${icsEsc(e.title)}`,
      `LOCATION:${icsEsc(e.location)}`,
      `DESCRIPTION:${icsEsc(e.notes)}`,
      'END:VEVENT',
    ].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mes projets//FR', 'CALSCALE:GREGORIAN', ...blocks, 'END:VCALENDAR'].join('\r\n');
}

/* ---------------------------------------------------------------------- */
/*  Modales génériques                                                    */
/* ---------------------------------------------------------------------- */

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-semibold text-slate-800" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return <div className="mb-3.5"><label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>{children}</div>;
}
const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400";

/* ---------------------------------------------------------------------- */
/*  Fiche tâche — 3 modes d'affectation : individuel / pool / équipe RACI */
/* ---------------------------------------------------------------------- */

function RaciPicker({ memberId, value, disabled, onChange }) {
  const lvl = RACI_LEVELS.find(r => r.id === value);
  return (
    <select disabled={disabled} value={value || ''} onChange={e => onChange(memberId, e.target.value)}
      style={lvl ? { color: lvl.color, background: lvl.bg } : {}}
      className="text-xs rounded-lg px-2 py-1 border border-slate-200 bg-white disabled:bg-slate-100">
      <option value="">—</option>
      {RACI_LEVELS.map(r => <option key={r.id} value={r.id}>{r.id} · {r.label}</option>)}
    </select>
  );
}

// Rangée de boutons de sélection groupée ("Tout Radio", "Tout Manipulateur"...)
// pour un ensemble de pôles (service ou fonction), avec une étiquette de
// catégorie pour bien les distinguer.
function PoolButtonRow({ label, groups, isSelected, onToggle, disabled }) {
  if (!groups.length) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide shrink-0">{label}</span>
      {groups.map(g => {
        const empty = g.ids.length === 0;
        const allIn = !empty && g.ids.every(id => isSelected(id));
        return (
          <button key={g.label} type="button" disabled={disabled || empty} onClick={() => onToggle(g.ids)}
            className={`text-xs px-2 py-1 rounded-full border font-medium ${empty ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400' : allIn ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
            {g.label} ({g.ids.length})
          </button>
        );
      })}
    </div>
  );
}

// Bouton de suppression avec confirmation intégrée à l'interface (deux clics :
// le bouton se change en "Confirmer / Annuler"), à la place d'un window.confirm
// natif qui fige la page et ne peut pas être stylé.
function ConfirmButton({ onConfirm, label = 'Supprimer', confirmLabel, icon: Icon = Trash2, disabled }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className="flex items-center gap-2 text-xs flex-wrap">
        {confirmLabel && <span className="text-slate-500">{confirmLabel}</span>}
        <button type="button" onClick={onConfirm} className="text-white bg-red-600 hover:bg-red-700 font-medium px-2.5 py-1.5 rounded-lg">Oui, supprimer</button>
        <button type="button" onClick={() => setConfirming(false)} className="text-slate-500 hover:text-slate-700 font-medium px-2.5 py-1.5 rounded-lg hover:bg-slate-50">Annuler</button>
      </div>
    );
  }
  return (
    <button type="button" disabled={disabled} onClick={() => setConfirming(true)} className="text-red-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-red-50 text-sm font-medium px-3 py-2 rounded-lg flex items-center gap-1.5">
      <Icon size={14} /> {label}
    </button>
  );
}

function TaskModal({ task, initialProjectId, members, projects, perm, currentMemberId, onSave, onDelete, onClaim, onDuplicate, onClose }) {
  // À la création, si le projet a déjà un responsable, la nouvelle tâche lui
  // est assignée par défaut (individuel comme équipe/RACI) — reste modifiable.
  const [form, setForm] = useState(() => {
    if (task) return task;
    const projectId = initialProjectId || projects[0]?.id || '';
    const responsibleId = projects.find(p => p.id === projectId)?.responsibleIds?.[0] || '';
    return {
      title: '', description: '', projectId,
      assignMode: 'individuel', assigneeId: responsibleId, pool: [], raci: responsibleId ? { [responsibleId]: 'R' } : {},
      priority: 'normale', importance: 'moyenne', scope: 'courte', status: 'a_faire', startDate: '', deadline: '', time: '',
      repeatUnit: 'aucune', repeatEvery: 1, avoidDays: [],
    };
  });

  const isOpenPoolTask = task && form.assignMode === 'pool' && task.pool && task.pool.length > 0 && !task.assigneeId;
  const canClaim = isOpenPoolTask && task.pool.includes(currentMemberId);
  const currentProject = projects.find(p => p.id === form.projectId);
  const locked = task && !canEditTask(task, currentMemberId, currentProject, perm.isManager);

  const projectTeamIds = currentProject?.teamIds || [];
  const availableMembers = projectTeamIds.length > 0 ? members.filter(m => projectTeamIds.includes(m.id)) : members.filter(m => m.role !== 'Manager');
  const projectHasOwnRepeat = !!(currentProject?.repeatUnit && currentProject.repeatUnit !== 'aucune');

  const handleProjectChange = (newProjectId) => {
    const newProject = projects.find(p => p.id === newProjectId);
    const team = newProject?.teamIds || [];
    const stillValid = (id) => team.length === 0 || team.includes(id);
    const clamp = (date) => {
      if (!date) return date;
      if (newProject?.startDate && date < newProject.startDate) return newProject.startDate;
      if (newProject?.endDate && date > newProject.endDate) return newProject.endDate;
      return date;
    };
    setForm(f => {
      const nextAssigneeId = stillValid(f.assigneeId) ? f.assigneeId : '';
      const nextRaci = Object.fromEntries(Object.entries(f.raci).filter(([id]) => stillValid(id)));
      // Pour une tâche en cours de création (pas encore de responsable/RACI
      // choisi), on applique par défaut le responsable du nouveau projet.
      const responsibleId = !task ? (newProject?.responsibleIds?.[0] || '') : '';
      const applyDefault = !task && !nextAssigneeId && Object.keys(nextRaci).length === 0 && responsibleId;
      return {
        ...f, projectId: newProjectId,
        assigneeId: applyDefault ? responsibleId : nextAssigneeId,
        pool: f.pool.filter(stillValid),
        raci: applyDefault ? { [responsibleId]: 'R' } : nextRaci,
        startDate: clamp(f.startDate),
        deadline: clamp(f.deadline),
      };
    });
  };

  // Une personne "toujours approbatrice" démarre au rôle "A" plutôt que "I"
  // quand on l'ajoute — cohérent avec le fait qu'elle ne sera jamais tirée
  // au sort comme responsable (voir nextRotatedAssignee).
  const defaultRaciRole = (id) => (members.find(m => m.id === id)?.alwaysApprover ? 'A' : 'I');
  const toggleParticipant = (id) => setForm(f => {
    if (f.assignMode === 'pool') {
      return { ...f, pool: f.pool.includes(id) ? f.pool.filter(x => x !== id) : [...f.pool, id] };
    }
    const raci = { ...f.raci };
    if (raci[id]) delete raci[id]; else raci[id] = defaultRaciRole(id);
    return { ...f, raci };
  });
  const selectAllParticipants = () => setForm(f => {
    if (f.assignMode === 'pool') return { ...f, pool: availableMembers.map(m => m.id) };
    const raci = { ...f.raci };
    availableMembers.forEach(m => { if (!raci[m.id]) raci[m.id] = defaultRaciRole(m.id); });
    return { ...f, raci };
  });
  const clearAllParticipants = () => setForm(f => f.assignMode === 'pool' ? { ...f, pool: [] } : { ...f, raci: {} });
  const comboPoolGroups = combinedPoolGroups(availableMembers);
  const togglePoolParticipant = (ids) => setForm(f => {
    if (f.assignMode === 'pool') {
      const allIn = ids.every(id => f.pool.includes(id));
      return { ...f, pool: allIn ? f.pool.filter(id => !ids.includes(id)) : Array.from(new Set([...f.pool, ...ids])) };
    }
    const raci = { ...f.raci };
    const allIn = ids.every(id => raci[id]);
    if (allIn) ids.forEach(id => delete raci[id]); else ids.forEach(id => { if (!raci[id]) raci[id] = defaultRaciRole(id); });
    return { ...f, raci };
  });
  const setRaciRole = (id, role) => setForm(f => {
    const raci = { ...f.raci };
    if (role) raci[id] = role; else delete raci[id];
    return { ...f, raci };
  });

  return (
    <Modal title={task ? (locked ? 'Détail de la tâche' : 'Modifier la tâche') : 'Nouvelle tâche'} onClose={onClose} wide>
      {locked && !canClaim && <ReadOnlyNotice />}
      {task && task.isGovernance && (
        <div className="flex items-center gap-1.5 text-xs text-purple-700 bg-purple-50 px-2.5 py-1.5 rounded-lg mb-3.5">
          <GovIcon id={task.governanceType} /> Étape de conduite de projet — {governanceType(task.governanceType).label}
        </div>
      )}
      {isOpenPoolTask && (
        <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg mb-3.5">
          <Users size={12} /> Tâche ouverte : à prendre par la première personne disponible
        </div>
      )}
      <Field label="Intitulé">
        <input disabled={locked} className={inputCls} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex : Rédiger les courriers d'invitation" />
      </Field>
      <Field label="Description">
        <textarea disabled={locked} className={inputCls} rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Projet">
          <select disabled={locked} className={inputCls} value={form.projectId} onChange={e => handleProjectChange(e.target.value)}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectTeamIds.length > 0 && <div className="text-xs text-slate-400 mt-1">Affectation limitée à l'équipe de ce projet ({projectTeamIds.length} personne{projectTeamIds.length !== 1 ? 's' : ''}).</div>}
        </Field>
        <Field label="Affectation">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            <button type="button" disabled={locked} onClick={() => setForm({ ...form, assignMode: 'individuel' })} className={`flex-1 py-2 ${form.assignMode === 'individuel' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>Une personne</button>
            <button type="button" disabled={locked} onClick={() => setForm({ ...form, assignMode: 'pool' })} className={`flex-1 py-2 ${form.assignMode === 'pool' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>Plusieurs (1ère prise)</button>
            <button type="button" disabled={locked} onClick={() => setForm({ ...form, assignMode: 'equipe' })} className={`flex-1 py-2 ${form.assignMode === 'equipe' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>Équipe (RACI)</button>
          </div>
        </Field>
      </div>

      {form.assignMode === 'individuel' && (
        <Field label="Assignée à">
          <select disabled={locked} className={inputCls} value={form.assigneeId} onChange={e => {
            const newId = e.target.value;
            setForm(f => {
              // responsibleIdsOf() lit le RACI "R" avant assigneeId : si on ne
              // le resynchronise pas ici, un "R" posé à la création (ou par un
              // ancien choix) continue de désigner l'ancienne personne comme
              // responsable après ce changement.
              const raci = { ...f.raci };
              Object.keys(raci).forEach(id => { if (raci[id] === 'R' && id !== newId) delete raci[id]; });
              if (newId) raci[newId] = 'R';
              return { ...f, assigneeId: newId, raci };
            });
          }}>
            <option value="">— non assignée —</option>
            {availableMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
      )}

      {form.assignMode === 'pool' && (
        <Field label="Candidats (le premier qui la prend l'obtient)">
          <div className="flex items-center justify-end gap-2 mb-1.5">
            <button type="button" disabled={locked} onClick={selectAllParticipants} className="text-xs text-blue-600 hover:underline">Tout cocher</button>
            <span className="text-slate-300">·</span>
            <button type="button" disabled={locked} onClick={clearAllParticipants} className="text-xs text-slate-400 hover:underline">Tout décocher</button>
          </div>
          <div className="space-y-1.5 mb-2">
            <PoolButtonRow label="Pôles" groups={comboPoolGroups} isSelected={id => form.pool.includes(id)} onToggle={togglePoolParticipant} disabled={locked} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableMembers.map(m => {
              const active = form.pool.includes(m.id);
              return (
                <button key={m.id} type="button" disabled={locked} onClick={() => toggleParticipant(m.id)}
                  className={`text-xs px-2.5 py-1.5 rounded-full border flex items-center gap-1.5 ${active ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                  <Avatar name={m.name} size={16} /> {m.name}
                </button>
              );
            })}
          </div>
          {form.assigneeId && <div className="text-xs text-slate-400 mt-1.5">Déjà prise par {members.find(m => m.id === form.assigneeId)?.name}.</div>}
        </Field>
      )}

      {form.assignMode === 'equipe' && (
        <Field label="Participants et rôle de chacun (R/A/C/I)">
          <div className="flex items-center justify-end gap-2 mb-1.5">
            <button type="button" disabled={locked} onClick={selectAllParticipants} className="text-xs text-blue-600 hover:underline">Tout cocher</button>
            <span className="text-slate-300">·</span>
            <button type="button" disabled={locked} onClick={clearAllParticipants} className="text-xs text-slate-400 hover:underline">Tout décocher</button>
          </div>
          <div className="space-y-1.5 mb-2">
            <PoolButtonRow label="Pôles" groups={comboPoolGroups} isSelected={id => !!form.raci[id]} onToggle={togglePoolParticipant} disabled={locked} />
          </div>
          <div className="space-y-1.5">
            {availableMembers.map(m => {
              const active = !!form.raci[m.id];
              return (
                <div key={m.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <button type="button" disabled={locked} onClick={() => toggleParticipant(m.id)} className="flex items-center gap-2 flex-1 text-left">
                    <Avatar name={m.name} size={20} />
                    <span className="text-xs text-slate-600">{m.name}</span>
                  </button>
                  {active && <RaciPicker memberId={m.id} value={form.raci[m.id]} disabled={locked} onChange={setRaciRole} />}
                </div>
              );
            })}
          </div>
          <div className="text-xs text-slate-400 mt-1.5">Le rôle "R" (Responsable) fait apparaître la personne comme en charge de la tâche.</div>
        </Field>
      )}

      <Field label="Durée">
        <select disabled={locked} className={inputCls} value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}>
          {SCOPES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </Field>
      <Field label="Statut">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {STATUSES.map(s => (
            <button key={s.id} type="button" disabled={locked} onClick={() => setForm({ ...form, status: s.id })}
              className="flex-1 py-2 disabled:opacity-60"
              style={form.status === s.id ? { background: s.color, color: '#fff' } : { background: '#fff', color: '#64748B' }}>
              {s.label}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Date de début (pour Durée des projets)">
          <input disabled={locked} type="date" min={currentProject?.startDate || todayISO()} max={currentProject?.endDate || undefined} className={inputCls} value={form.startDate || ''} onChange={e => setForm({ ...form, startDate: e.target.value })} />
        </Field>
        <Field label="Échéance">
          <input disabled={locked} type="date" min={form.startDate || currentProject?.startDate || todayISO()} max={currentProject?.endDate || undefined} className={inputCls} value={form.deadline || ''} onChange={e => setForm({ ...form, deadline: e.target.value })} />
        </Field>
        <Field label="Heure (si tâche d'un jour)">
          <input disabled={locked} type="time" className={inputCls} value={form.time || ''} onChange={e => setForm({ ...form, time: e.target.value })} />
        </Field>
      </div>
      {currentProject?.startDate && currentProject?.endDate && (
        <div className="text-xs text-slate-400 -mt-2.5 mb-3.5">
          Calendrier du projet « {currentProject.name} » : {fmtDate(currentProject.startDate)} → {fmtDate(currentProject.endDate)} — les dates de la tâche doivent rester dans cet intervalle.
        </div>
      )}
      <Field label="Répétition">
        {projectHasOwnRepeat ? (
          <div className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
            <Repeat size={11} className="shrink-0" /> Ce projet a déjà sa propre répétition ({repeatLabel(currentProject.repeatUnit, currentProject.repeatEvery)}) — inutile (et source de doublons) de répéter aussi cette tâche individuellement, elle sera recréée avec le reste du projet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <select disabled={locked} className={inputCls} value={form.repeatUnit || 'aucune'} onChange={e => setForm({ ...form, repeatUnit: e.target.value })}>
              {REPEAT_UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
            {form.repeatUnit && form.repeatUnit !== 'aucune' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 shrink-0">Tous les</span>
                <input disabled={locked} type="number" min="1" className={inputCls} value={form.repeatEvery || 1} onChange={e => setForm({ ...form, repeatEvery: Math.max(1, parseInt(e.target.value) || 1) })} />
              </div>
            )}
          </div>
        )}
        {!projectHasOwnRepeat && form.repeatUnit && form.repeatUnit !== 'aucune' && (
          <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-1"><Repeat size={11} /> {repeatLabel(form.repeatUnit, form.repeatEvery)} — nouvelle occurrence créée automatiquement une fois "Terminé".</div>
        )}
        {!projectHasOwnRepeat && form.repeatUnit && form.repeatUnit !== 'aucune' && (form.assignMode === 'individuel' || form.assignMode === 'equipe') && projectTeamIds.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-slate-600 mt-2.5">
            <input disabled={locked} type="checkbox" checked={!!form.rotateAssignee} onChange={e => setForm({ ...form, rotateAssignee: e.target.checked })} />
            {form.assignMode === 'equipe'
              ? "Le rôle \"R\" (Responsable) change à chaque récurrence (tirage aléatoire dans l'équipe du projet, sans repasser deux fois avant que tout le monde soit passé)"
              : "Le responsable change à chaque récurrence (tirage aléatoire dans l'équipe du projet, sans repasser deux fois avant que tout le monde soit passé)"}
          </label>
        )}
        {!projectHasOwnRepeat && form.repeatUnit && form.repeatUnit !== 'aucune' && (
          <div className="mt-2.5">
            <div className="text-xs text-slate-500 mb-1.5">Jours à éviter (non travaillés / repos)</div>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map(w => {
                const active = (form.avoidDays || []).includes(w.id);
                return (
                  <button key={w.id} type="button" disabled={locked} onClick={() => setForm(f => ({ ...f, avoidDays: (f.avoidDays || []).includes(w.id) ? f.avoidDays.filter(x => x !== w.id) : [...(f.avoidDays || []), w.id] }))}
                    className={`text-xs px-2.5 py-1 rounded-full border ${active ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                    {w.label.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Field>

      <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
        <div className="flex items-center gap-2">
          {task && !locked && (
            <ConfirmButton onConfirm={() => onDelete(task.id)} confirmLabel="Supprimer cette tâche ?" />
          )}
          {task && perm.canCreateTask && !locked && (
            <button onClick={() => onDuplicate(task)} className="text-slate-500 hover:bg-slate-50 text-sm font-medium px-3 py-2 rounded-lg flex items-center gap-1.5">
              <Copy size={14} /> Dupliquer
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canClaim && (
            <button onClick={() => onClaim(task.id)} className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-1.5">
              <Users size={14} /> Prendre cette tâche
            </button>
          )}
          {!locked && (
            <button
              disabled={!form.title.trim()}
              onClick={() => onSave({
                ...form, id: form.id || uid(), createdAt: form.createdAt || todayISO(),
                assigneeId: form.assignMode === 'individuel' ? form.assigneeId : (form.assignMode === 'pool' ? (form.assigneeId || '') : ''),
                pool: form.assignMode === 'pool' ? form.pool : [],
                raci: form.raci,
              })}
              className="bg-blue-600 disabled:opacity-40 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {task ? 'Enregistrer' : 'Créer la tâche'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/*  Fiche collaborateur                                                   */
/* ---------------------------------------------------------------------- */

function MemberModal({ member, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(member || { name: '', role: '', services: [], accessLevel: 'utilisateur', email: '', alwaysApprover: false });
  const [roleChoice, setRoleChoice] = useState(FUNCTIONS.includes(member?.role) ? member.role : (member?.role ? 'Autre' : ''));
  const toggleService = (s) => setForm(f => ({ ...f, services: (f.services || []).includes(s) ? f.services.filter(x => x !== s) : [...(f.services || []), s] }));
  return (
    <Modal title={member ? 'Modifier le collaborateur' : 'Nouveau collaborateur'} onClose={onClose}>
      <Field label="Nom"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Prénom Nom" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fonction">
          <select className={inputCls} value={roleChoice} onChange={e => {
            const v = e.target.value;
            setRoleChoice(v);
            setForm({ ...form, role: v === 'Autre' ? '' : v });
          }}>
            <option value="">— sélectionner —</option>
            {FUNCTIONS.map(f => <option key={f} value={f}>{f}</option>)}
            <option value="Autre">Autre…</option>
          </select>
          {roleChoice === 'Autre' && (
            <input className={`${inputCls} mt-2`} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Préciser la fonction" />
          )}
        </Field>
        <Field label="Service(s)">
          <div className="flex flex-wrap gap-1.5">
            {SERVICES.map(s => {
              const active = (form.services || []).includes(s);
              return (
                <button key={s} type="button" onClick={() => toggleService(s)}
                  className={`text-xs px-2.5 py-1.5 rounded-full border font-medium ${active ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                  {s}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
      <Field label="Email (compte de connexion)"><input type="email" className={inputCls} value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="prenom.nom@cabinet.fr" /></Field>
      {roleChoice === 'Manager' && (
        <div className="text-xs text-slate-400 -mt-2.5 mb-3.5">La fonction "Manager" exclut automatiquement cette personne des équipes de projet et du tirage au sort des responsables.</div>
      )}
      <Field label="Rôle applicatif (droits d'accès)">
        <select className={inputCls} value={form.accessLevel} onChange={e => setForm({ ...form, accessLevel: e.target.value })}>
          {ACCESS_LEVELS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <div className="text-xs text-slate-400 mt-1">{ACCESS_LEVELS.find(a => a.id === form.accessLevel)?.desc}</div>
      </Field>
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
        {member ? (
          <ConfirmButton onConfirm={() => onDelete(member.id)} label="Retirer" confirmLabel="Retirer ce collaborateur ?" />
        ) : <span />}
        <button disabled={!form.name.trim()} onClick={() => onSave({ ...form, id: form.id || uid() })} className="bg-blue-600 disabled:opacity-40 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
          {member ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/*  Fiche projet — création avec équipe + conduite de projet automatique  */
/* ---------------------------------------------------------------------- */

function ProjectModal({ project, members, externalContacts, tasks, projects, currentMemberId, perm, onSave, onDelete, onDuplicate, onClose }) {
  const isNew = !project;
  const locked = !canEditProject(project, currentMemberId, perm.isManager);
  const [form, setForm] = useState(project || { name: '', description: '', service: '', color: PROJECT_COLORS[0], teamIds: currentMemberId ? [currentMemberId] : [], externalIds: [], startDate: '', endDate: '', status: 'en_cours', priority: 'normale', importance: 'moyenne', repeatUnit: 'aucune', repeatEvery: 1, responsibleIds: [], rotateResponsible: false, rotateResponsibleCount: 1, responsibleRotationPool: [] });
  // Seules les personnes réellement tirables au sort comptent pour le
  // plafond du nombre de responsables tournants (les managers/toujours-
  // approbateurs de l'équipe ne sont jamais piochés, voir nextRotatedAssignee).
  const eligibleRotationCount = form.teamIds.filter(id => {
    const m = members.find(x => x.id === id);
    return !(m?.alwaysApprover || m?.role === 'Manager');
  }).length;
  const toggleResponsible = (id) => setForm(f => ({ ...f, responsibleIds: (f.responsibleIds || []).includes(id) ? f.responsibleIds.filter(x => x !== id) : [...(f.responsibleIds || []), id] }));
  const [genGovernance, setGenGovernance] = useState(false);
  // Retirer quelqu'un de l'équipe le retire aussi du poste de responsable
  // du projet — sinon il y reste "fantôme" (invisible dans le sélecteur,
  // mais toujours enregistré comme responsable).
  const dropFromResponsibles = (f, removedIds) => (f.responsibleIds || []).some(id => removedIds.includes(id))
    ? (f.responsibleIds || []).filter(id => !removedIds.includes(id)) : f.responsibleIds;
  const toggleTeam = (id) => setForm(f => {
    const teamIds = f.teamIds.includes(id) ? f.teamIds.filter(x => x !== id) : [...f.teamIds, id];
    return { ...f, teamIds, responsibleIds: dropFromResponsibles(f, [id]) };
  });
  const comboPoolGroups = combinedPoolGroups(members);
  const togglePool = (ids) => setForm(f => {
    const allIn = ids.every(id => f.teamIds.includes(id));
    const teamIds = allIn ? f.teamIds.filter(id => !ids.includes(id)) : Array.from(new Set([...f.teamIds, ...ids]));
    return { ...f, teamIds, responsibleIds: allIn ? dropFromResponsibles(f, ids) : f.responsibleIds };
  });
  const toggleExternal = (id) => setForm(f => ({ ...f, externalIds: (f.externalIds || []).includes(id) ? f.externalIds.filter(x => x !== id) : [...(f.externalIds || []), id] }));

  // À la création, un utilisateur non-administrateur ne peut choisir que ses
  // propres services (fiche collaborateur) — pas n'importe quel service du
  // cabinet. Un administrateur, lui, choisit librement.
  const currentMemberObj = members.find(m => m.id === currentMemberId);
  const restrictServiceChoice = isNew && !perm.isManager;
  const allowedServices = restrictServiceChoice
    ? (currentMemberObj?.services?.length ? currentMemberObj.services : ['Autre'])
    : PROJECT_SERVICES;

  const [outOfRangeWarning, setOutOfRangeWarning] = useState('');
  const doSave = () => {
    const id = form.id || uid();
    const projectObj = { ...form, id };
    if (isNew) {
      projectObj.createdBy = currentMemberId;
      projectObj.pendingApproval = !perm.isManager;
      if (!perm.isManager && (!projectObj.responsibleIds || projectObj.responsibleIds.length === 0)) projectObj.responsibleIds = [currentMemberId];
    }
    // Rotation cochée mais personne choisi : tirage aléatoire immédiat dans
    // l'équipe (hors personnes exclues du roulement), plutôt que d'attendre
    // le premier renouvellement pour avoir un responsable.
    if (projectObj.rotateResponsible && (!projectObj.responsibleIds || projectObj.responsibleIds.length === 0) && (projectObj.teamIds || []).length > 0) {
      const eligible = projectObj.teamIds.filter(mid => {
        const mm = members.find(x => x.id === mid);
        return !(mm?.alwaysApprover || mm?.role === 'Manager');
      });
      // Si personne dans l'équipe n'est éligible (tous exclus du roulement),
      // on laisse le responsable vide plutôt que de retomber sur l'équipe
      // brute — piocher quand même violerait la règle d'exclusion appliquée
      // partout ailleurs (voir nextRotatedAssignee).
      if (eligible.length > 0) {
        const count = Math.max(1, Math.min(projectObj.rotateResponsibleCount || 1, eligible.length));
        let pool = shuffleArray(eligible);
        // Comme au renouvellement : parmi les candidats, on privilégie ceux
        // qui ont le moins de projets déjà en cours sur la même période —
        // sinon deux projets créés séparément (pas le même cycle) peuvent
        // tomber tous les deux sur la même personne par pur hasard.
        if (projectObj.startDate && projectObj.endDate && projects && pool.length > 1) {
          const loadOf = (id) => projects.filter(p => (p.responsibleIds || []).includes(id) && p.status !== 'termine' &&
            p.startDate && p.endDate && p.startDate <= projectObj.endDate && p.endDate >= projectObj.startDate).length;
          pool = [...pool].sort((a, b) => loadOf(a) - loadOf(b));
        }
        projectObj.responsibleIds = pool.slice(0, count);
        projectObj.responsibleRotationPool = pool.slice(count);
      }
    }
    // Les étapes générées automatiquement suivent le responsable du projet
    // (choisi manuellement ou tiré au sort ci-dessus), pas forcément la
    // personne qui crée le projet.
    const governanceAssignee = (projectObj.responsibleIds && projectObj.responsibleIds[0]) || currentMemberId;
    const governanceTasks = (isNew && genGovernance && form.startDate && form.endDate) ? buildGovernanceTasks(form.startDate, form.endDate, id, governanceAssignee) : [];
    onSave(projectObj, governanceTasks);
  };
  const validateProject = () => {
    onSave({ ...form, pendingApproval: false }, []);
  };
  const handleSubmit = () => {
    const id = form.id || uid();
    if (form.startDate && form.endDate) {
      const outOfRange = (tasks || []).filter(t => t.projectId === id && ((t.startDate && t.startDate < form.startDate) || (t.deadline && t.deadline > form.endDate)));
      if (outOfRange.length) {
        const names = outOfRange.map(t => `« ${t.title} »`).join(', ');
        setOutOfRangeWarning(`Impossible d'enregistrer : ${outOfRange.length} tâche${outOfRange.length > 1 ? 's' : ''} ${outOfRange.length > 1 ? 'sortent' : 'sort'} de ce calendrier (${fmtDate(form.startDate)} → ${fmtDate(form.endDate)}) — ${names}. Élargissez les dates du projet, ou modifiez d'abord ces tâches.`);
        return;
      }
    }
    setOutOfRangeWarning('');
    doSave();
  };

  return (
    <Modal title={project ? 'Modifier le projet' : 'Nouveau projet'} onClose={onClose} wide>
      {locked && <ReadOnlyNotice />}
      {form.pendingApproval && (
        <div className="flex items-center justify-between gap-2 text-xs text-amber-800 bg-amber-50 px-3 py-2.5 rounded-lg mb-3.5 flex-wrap">
          <span className="flex items-center gap-1.5"><AlertTriangle size={13} className="shrink-0" /> En attente de validation par un administrateur — le projet reste visible mais n'est pas encore confirmé.</span>
          {perm.isManager && <button type="button" onClick={validateProject} className="bg-amber-600 hover:bg-amber-700 text-white font-medium px-2.5 py-1.5 rounded-lg shrink-0">Valider ce projet</button>}
        </div>
      )}
      <Field label="Nom du projet"><input disabled={locked} className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Service du projet">
        <select disabled={locked} className={inputCls} value={form.service || ''} onChange={e => setForm({ ...form, service: e.target.value })}>
          <option value="">— aucun —</option>
          {allowedServices.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {restrictServiceChoice && (
          <div className="text-[11px] text-slate-400 mt-1">Limité à {currentMemberObj?.services?.length ? 'votre/vos service(s)' : '"Autre"'} — un administrateur peut choisir n'importe quel service.</div>
        )}
      </Field>
      <Field label="Description"><textarea disabled={locked} className={inputCls} rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Couleur">
        <div className="flex gap-2">
          {PROJECT_COLORS.map(c => (
            <button key={c} disabled={locked} onClick={() => setForm({ ...form, color: c })} style={{ background: c }}
              className={`w-7 h-7 rounded-full disabled:opacity-40 ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`} />
          ))}
        </div>
      </Field>
      <Field label="Équipe affectée">
        <div className="space-y-1.5 mb-2">
          <PoolButtonRow label="Pôles" groups={comboPoolGroups} isSelected={id => form.teamIds.includes(id)} onToggle={togglePool} disabled={locked} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {members.filter(m => m.role !== 'Manager').map(m => {
            const active = form.teamIds.includes(m.id);
            return (
              <button key={m.id} type="button" disabled={locked} onClick={() => toggleTeam(m.id)}
                className={`text-xs px-2.5 py-1.5 rounded-full border flex items-center gap-1.5 disabled:opacity-40 ${active ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                <Avatar name={m.name} size={16} /> {m.name}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Contacts externes associés">
        <div className="flex flex-wrap gap-1.5">
          {(externalContacts || []).map(c => {
            const active = (form.externalIds || []).includes(c.id);
            return (
              <button key={c.id} type="button" disabled={locked} onClick={() => toggleExternal(c.id)}
                className={`text-xs px-2.5 py-1.5 rounded-full border flex items-center gap-1.5 disabled:opacity-40 ${active ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                <Building2 size={12} /> {c.name}
              </button>
            );
          })}
          {(!externalContacts || externalContacts.length === 0) && <span className="text-xs text-slate-400">Aucun contact externe enregistré (onglet Contacts externes)</span>}
        </div>
      </Field>
      <Field label="Statut du projet">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          <button type="button" disabled={locked} onClick={() => setForm({ ...form, status: 'en_cours' })} className={`flex-1 py-2 disabled:opacity-60 ${(!form.status || form.status === 'en_cours') ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>En cours</button>
          <button type="button" disabled={locked} onClick={() => setForm({ ...form, status: 'termine' })} className={`flex-1 py-2 disabled:opacity-60 ${form.status === 'termine' ? 'bg-green-600 text-white' : 'bg-white text-slate-500'}`}>Terminé</button>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priorité (urgence)">
          <select disabled={locked || !perm.isManager} className={inputCls} value={form.priority || 'normale'} onChange={e => setForm({ ...form, priority: e.target.value })}>
            {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {!perm.isManager && <div className="text-[11px] text-slate-400 mt-1">Réservé aux administrateurs</div>}
        </Field>
        <Field label="Importance (impact)">
          <select disabled={locked || !perm.isManager} className={inputCls} value={form.importance || 'moyenne'} onChange={e => setForm({ ...form, importance: e.target.value })}>
            {IMPORTANCE.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          {!perm.isManager && <div className="text-[11px] text-slate-400 mt-1">Réservé aux administrateurs</div>}
        </Field>
      </div>
      <div className="text-xs text-slate-400 -mt-2.5 mb-3.5">Détermine automatiquement le classement du projet dans l'onglet Priorisation.</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Début du projet"><input disabled={locked} type="date" min={form.id ? undefined : todayISO()} className={inputCls} value={form.startDate || ''} onChange={e => setForm({ ...form, startDate: e.target.value })} /></Field>
        <Field label="Fin du projet"><input disabled={locked} type="date" min={form.startDate || undefined} className={inputCls} value={form.endDate || ''} onChange={e => setForm({ ...form, endDate: e.target.value })} /></Field>
      </div>
      <div className="text-xs text-slate-400 -mt-2.5 mb-3.5">Ces deux dates forment le calendrier du projet : les tâches créées dedans ne pourront pas avoir de date en dehors.</div>
      <Field label="Répétition du projet">
        <div className="grid grid-cols-2 gap-3">
          <select disabled={locked || !form.startDate || !form.endDate} className={inputCls} value={form.repeatUnit || 'aucune'} onChange={e => setForm({ ...form, repeatUnit: e.target.value })}>
            {REPEAT_UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
          {form.repeatUnit && form.repeatUnit !== 'aucune' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 shrink-0">Tous les</span>
              <input disabled={locked} type="number" min="1" className={inputCls} value={form.repeatEvery || 1} onChange={e => setForm({ ...form, repeatEvery: Math.max(1, parseInt(e.target.value) || 1) })} />
            </div>
          )}
        </div>
        {(!form.startDate || !form.endDate)
          ? <div className="text-xs text-slate-400 mt-1.5">Renseignez les dates de début et de fin ci-dessus pour activer la répétition.</div>
          : form.repeatUnit && form.repeatUnit !== 'aucune' && (
            <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-1"><Repeat size={11} /> {repeatLabel(form.repeatUnit, form.repeatEvery)} — dès que le projet passe à "Terminé", un nouveau projet (et ses tâches) est recréé automatiquement pour le cycle suivant.</div>
          )}
      </Field>
      <Field label="Responsable(s) du projet">
        <div className="flex flex-wrap gap-1.5">
          {members.filter(m => form.teamIds.includes(m.id)).map(m => {
            const active = (form.responsibleIds || []).includes(m.id);
            return (
              <button key={m.id} type="button" disabled={locked} onClick={() => toggleResponsible(m.id)}
                className={`text-xs px-2.5 py-1.5 rounded-full border flex items-center gap-1.5 disabled:opacity-40 ${active ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                <Avatar name={m.name} size={16} /> {m.name}
              </button>
            );
          })}
          {form.teamIds.length === 0 && <span className="text-xs text-slate-400">Ajoutez d'abord des personnes à l'équipe affectée.</span>}
        </div>
        {form.repeatUnit && form.repeatUnit !== 'aucune' && form.teamIds.length > 0 && (
          <div className="mt-2.5">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input disabled={locked} type="checkbox" checked={!!form.rotateResponsible} onChange={e => setForm({ ...form, rotateResponsible: e.target.checked })} />
              Le(s) responsable(s) change(nt) à chaque renouvellement (tirage aléatoire dans l'équipe, sans repasser avant que tout le monde soit passé)
            </label>
            {form.rotateResponsible && (
              <label className="flex items-center gap-2 text-xs text-slate-600 mt-1.5 ml-5">
                Nombre de responsables tournants
                <input disabled={locked} type="number" min="1" max={Math.max(1, eligibleRotationCount)}
                  className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none"
                  value={form.rotateResponsibleCount || 1}
                  onChange={e => setForm({ ...form, rotateResponsibleCount: Math.max(1, Math.min(Math.max(1, eligibleRotationCount), parseInt(e.target.value) || 1)) })} />
                {eligibleRotationCount === 0 && <span className="text-slate-400">(aucune personne éligible dans l'équipe)</span>}
              </label>
            )}
          </div>
        )}
      </Field>
      {isNew && (
        <div className="bg-slate-50 rounded-xl p-3.5 mb-3.5">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input type="checkbox" checked={genGovernance} disabled={!form.startDate || !form.endDate} onChange={e => setGenGovernance(e.target.checked)} />
            Générer les étapes de conduite du projet type
          </label>
          {(!form.startDate || !form.endDate)
            ? <div className="text-xs text-slate-400 mt-1.5">Renseignez une date de début et de fin ci-dessus pour activer cette option.</div>
            : genGovernance && <div className="text-xs text-slate-400 mt-2">Préparation du changement, kick-off, démarrage, points de suivi, revue, clôture — créées comme tâches du projet, avec les dates ci-dessus.</div>}
        </div>
      )}
      {outOfRangeWarning && (
        <div className="text-xs text-red-700 bg-red-50 px-3 py-2.5 rounded-lg mb-3.5 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{outOfRangeWarning}</span>
        </div>
      )}
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
        <div className="flex items-center gap-2">
          {project && !locked && (
            <ConfirmButton
              onConfirm={() => onDelete(project.id)}
              confirmLabel={(() => {
                const count = (tasks || []).filter(t => t.projectId === project.id).length;
                return count > 0 ? `Supprimera aussi ${count} tâche${count !== 1 ? 's' : ''} associée${count !== 1 ? 's' : ''}.` : 'Supprimer ce projet ?';
              })()}
            />
          )}
          {project && !locked && onDuplicate && (
            <button onClick={() => onDuplicate(project)} className="text-slate-500 hover:bg-slate-50 text-sm font-medium px-3 py-2 rounded-lg flex items-center gap-1.5">
              <Copy size={14} /> Dupliquer{(() => {
                const count = (tasks || []).filter(t => t.projectId === project.id).length;
                return count > 0 ? ` (+${count} tâche${count !== 1 ? 's' : ''})` : '';
              })()}
            </button>
          )}
        </div>
        {!locked && (
          <button disabled={!form.name.trim() || !form.startDate || !form.endDate} onClick={handleSubmit} className="bg-blue-600 disabled:opacity-40 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            {project ? 'Enregistrer' : 'Créer le projet'}
          </button>
        )}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/*  Rendez-vous & Contacts externes                                       */
/* ---------------------------------------------------------------------- */

function AppointmentModal({ appointment, members, externalContacts, readOnly, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(appointment || { title: '', date: todayISO(), time: '09:00', location: '', participants: [], externalParticipants: [], notes: '' });
  const toggleParticipant = (id) => setForm(f => ({ ...f, participants: f.participants.includes(id) ? f.participants.filter(x => x !== id) : [...f.participants, id] }));
  const toggleExternal = (id) => setForm(f => ({ ...f, externalParticipants: f.externalParticipants.includes(id) ? f.externalParticipants.filter(x => x !== id) : [...f.externalParticipants, id] }));

  const invitees = [
    ...members.filter(m => form.participants.includes(m.id)),
    ...externalContacts.filter(c => form.externalParticipants.includes(c.id)),
  ];
  const withEmail = invitees.filter(p => p.email);
  const withoutEmail = invitees.filter(p => !p.email);
  const canInvite = form.title.trim() && form.date;
  const mailBody = `Bonjour,\n\nVous êtes invité(e) à : ${form.title}\nDate : ${fmtDateLong(form.date)} à ${form.time}\nLieu : ${form.location || 'à préciser'}\n${form.notes ? `\n${form.notes}\n` : ''}\nCordialement`;
  const mailtoHref = canInvite ? buildMailto({ to: withEmail.map(p => p.email), subject: form.title, body: mailBody }) : '#';
  const handleDownloadIcs = () => downloadTextFile(`${(form.title || 'rendez-vous').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`, buildICS({ ...form, id: form.id || uid() }, invitees), 'text/calendar');

  return (
    <Modal title={appointment ? (readOnly ? 'Détail du rendez-vous' : 'Modifier le rendez-vous') : 'Nouveau rendez-vous'} onClose={onClose}>
      {readOnly && <ReadOnlyNotice />}
      <Field label="Intitulé"><input disabled={readOnly} className={inputCls} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex : Point hebdo équipe, RETEX…" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><input disabled={readOnly} type="date" className={inputCls} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Heure"><input disabled={readOnly} type="time" className={inputCls} value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></Field>
      </div>
      <Field label="Lieu"><input disabled={readOnly} className={inputCls} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Salle de réunion, visio…" /></Field>
      <Field label="Participants internes">
        <div className="flex flex-wrap gap-1.5">
          {members.map(m => {
            const active = form.participants.includes(m.id);
            return (
              <button key={m.id} disabled={readOnly} onClick={() => toggleParticipant(m.id)}
                className={`text-xs px-2.5 py-1.5 rounded-full border flex items-center gap-1.5 ${active ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                <Avatar name={m.name} size={16} /> {m.name}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Participants externes">
        <div className="flex flex-wrap gap-1.5">
          {externalContacts.map(c => {
            const active = form.externalParticipants.includes(c.id);
            return (
              <button key={c.id} disabled={readOnly} onClick={() => toggleExternal(c.id)}
                className={`text-xs px-2.5 py-1.5 rounded-full border flex items-center gap-1.5 ${active ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                <Building2 size={12} /> {c.name}
              </button>
            );
          })}
          {externalContacts.length === 0 && <span className="text-xs text-slate-400">Aucun contact externe enregistré</span>}
        </div>
      </Field>
      <Field label="Notes"><textarea disabled={readOnly} className={inputCls} rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
      {invitees.length > 0 && (
        <div className="bg-slate-50 rounded-xl p-3.5 mb-3.5">
          <div className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5"><Mail size={12} /> Générer une invitation par e-mail</div>
          <div className="flex flex-wrap gap-2">
            <a href={canInvite ? mailtoHref : undefined} aria-disabled={!canInvite}
              className={`text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5 ${canInvite ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed pointer-events-none'}`}>
              <Send size={13} /> Ouvrir un e-mail ({withEmail.length})
            </a>
            <button type="button" disabled={!canInvite} onClick={handleDownloadIcs}
              className="text-xs font-medium px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1.5">
              <CalendarDays size={13} /> Télécharger l'invitation (.ics)
            </button>
          </div>
          {withoutEmail.length > 0 && <div className="text-xs text-amber-600 mt-2">Sans email renseigné, exclu(s) de l'e-mail : {withoutEmail.map(p => p.name).join(', ')}</div>}
        </div>
      )}
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
        {appointment && !readOnly ? (
          <ConfirmButton onConfirm={() => onDelete(appointment.id)} confirmLabel="Supprimer ce rendez-vous ?" />
        ) : <span />}
        {!readOnly && (
          <button disabled={!form.title.trim() || !form.date} onClick={() => onSave({ ...form, id: form.id || uid() })} className="bg-blue-600 disabled:opacity-40 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            {appointment ? 'Enregistrer' : 'Créer le rendez-vous'}
          </button>
        )}
      </div>
    </Modal>
  );
}

function ContactModal({ contact, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(contact || { name: '', organization: '', role: '', email: '', phone: '' });
  return (
    <Modal title={contact ? 'Modifier le contact' : 'Nouveau contact externe'} onClose={onClose}>
      <Field label="Nom"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Prénom Nom" /></Field>
      <Field label="Organisme"><input className={inputCls} value={form.organization} onChange={e => setForm({ ...form, organization: e.target.value })} placeholder="Ex : Siège, prestataire, confrère…" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fonction"><input className={inputCls} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></Field>
        <Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
      </div>
      <Field label="Téléphone"><input type="tel" className={inputCls} value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="06 12 34 56 78" /></Field>
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
        {contact ? (
          <ConfirmButton onConfirm={() => onDelete(contact.id)} label="Retirer" confirmLabel="Retirer ce contact ?" />
        ) : <span />}
        <button disabled={!form.name.trim()} onClick={() => onSave({ ...form, id: form.id || uid() })} className="bg-blue-600 disabled:opacity-40 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
          {contact ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/*  Demandes (tâches et rendez-vous)                                      */
/* ---------------------------------------------------------------------- */

function RequestModal({ members, externalContacts, projects, currentMemberId, onSave, onClose }) {
  const [form, setForm] = useState({
    kind: 'tache', title: '', description: '', priority: 'normale', importance: 'moyenne', deadline: '',
    time: '10:00', location: '', projectId: '', origin: 'interne', requesterMemberId: currentMemberId, requesterContactId: '',
  });
  const isRdv = form.kind === 'rendez_vous';
  return (
    <Modal title={isRdv ? "Demander un rendez-vous" : "Demander la création d'une tâche"} onClose={onClose} wide>
      <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-2.5 py-1.5 mb-3.5">Votre demande sera envoyée au manager, qui pourra l'approuver ou la refuser.</div>
      <Field label="Type de demande">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {REQUEST_KINDS.map(k => (
            <button key={k.id} type="button" onClick={() => setForm({ ...form, kind: k.id })} className={`flex-1 py-2 ${form.kind === k.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>{k.label}</button>
          ))}
        </div>
      </Field>
      <Field label="Intitulé"><input className={inputCls} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={isRdv ? 'Ex : Point sur le dossier X' : 'Ex : Commander des fournitures'} /></Field>
      <Field label="Description / motif"><textarea className={inputCls} rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Origine de la demande">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          <button type="button" onClick={() => setForm({ ...form, origin: 'interne' })} className={`flex-1 py-2 ${form.origin === 'interne' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>De ma part</button>
          <button type="button" onClick={() => setForm({ ...form, origin: 'externe' })} className={`flex-1 py-2 ${form.origin === 'externe' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>Pour un contact externe</button>
        </div>
      </Field>
      {form.origin === 'externe' && (
        <Field label="Contact externe à l'origine de la demande">
          <select className={inputCls} value={form.requesterContactId} onChange={e => setForm({ ...form, requesterContactId: e.target.value })}>
            <option value="">— sélectionner —</option>
            {externalContacts.map(c => <option key={c.id} value={c.id}>{c.name} — {c.organization}</option>)}
          </select>
        </Field>
      )}
      {!isRdv ? (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Priorité"><select className={inputCls} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
          <Field label="Importance"><select className={inputCls} value={form.importance} onChange={e => setForm({ ...form, importance: e.target.value })}>{IMPORTANCE.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></Field>
          <Field label="Échéance souhaitée"><input type="date" className={inputCls} value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} /></Field>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date souhaitée"><input type="date" className={inputCls} value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} /></Field>
          <Field label="Heure"><input type="time" className={inputCls} value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></Field>
          <Field label="Lieu souhaité"><input className={inputCls} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></Field>
        </div>
      )}
      <div className="flex items-center justify-end mt-5 pt-4 border-t border-slate-100">
        <button disabled={!form.title.trim() || (form.origin === 'externe' && !form.requesterContactId)}
          onClick={() => onSave({ ...form, id: uid(), status: 'en_attente', comment: '', createdAt: todayISO() })}
          className="bg-blue-600 disabled:opacity-40 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
          Envoyer la demande
        </button>
      </div>
    </Modal>
  );
}

function RequestRow({ req, members, externalContacts, perm, onApprove, onReject }) {
  const [showReject, setShowReject] = useState(false);
  const [comment, setComment] = useState('');
  const requester = req.origin === 'interne' ? members.find(m => m.id === req.requesterMemberId) : externalContacts.find(c => c.id === req.requesterContactId);
  const st = REQUEST_STATUSES.find(s => s.id === req.status);
  const isRdv = req.kind === 'rendez_vous';
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            {isRdv ? <CalendarDays size={13} className="text-blue-500" /> : <ListChecks size={13} className="text-slate-400" />}
            {req.title}
          </div>
          {req.description && <div className="text-xs text-slate-400 mt-0.5">{req.description}</div>}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className="text-xs text-slate-500 flex items-center gap-1">
              {req.origin === 'externe' ? <Building2 size={11} /> : <Users size={11} />}
              {requester?.name || 'Inconnu'}{req.origin === 'externe' && requester?.organization ? ` · ${requester.organization}` : ''}
            </span>
            {!isRdv && <><PriorityTag id={req.priority} /><ImportanceTag id={req.importance} /></>}
            {req.deadline && <span className="text-xs text-slate-400">{isRdv ? 'Le' : 'Souhaité pour le'} {fmtDate(req.deadline)}{isRdv && req.time ? ` à ${req.time}` : ''}</span>}
          </div>
        </div>
        <span style={{ color: st.color, background: st.bg }} className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0">{st.label}</span>
      </div>
      {req.status === 'refusee' && req.comment && <div className="text-xs text-red-500 mt-2 bg-red-50 rounded-lg px-2.5 py-1.5">Motif du refus : {req.comment}</div>}
      {req.status === 'en_attente' && perm.canReviewRequests && (
        <div className="mt-3 pt-3 border-t border-slate-50">
          {!showReject ? (
            <div className="flex gap-2">
              <button onClick={() => onApprove(req.id)} className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Check size={13} /> Approuver</button>
              <button onClick={() => setShowReject(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><XCircle size={13} /> Refuser</button>
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              <input className={inputCls} placeholder="Motif du refus (optionnel)" value={comment} onChange={e => setComment(e.target.value)} />
              <button onClick={() => onReject(req.id, comment)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-2 rounded-lg shrink-0">Confirmer</button>
              <button onClick={() => setShowReject(false)} className="text-slate-400 hover:text-slate-600 text-xs px-2 py-2 shrink-0">Annuler</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RequestsView({ requests, members, externalContacts, perm, onApprove, onReject, newRequest }) {
  const [tab, setTab] = useState('en_attente');
  const list = requests.filter(r => r.status === tab).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {REQUEST_STATUSES.map(s => (
            <button key={s.id} onClick={() => setTab(s.id)} className={`px-3 py-1.5 ${tab === s.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>{s.label} ({requests.filter(r => r.status === s.id).length})</button>
          ))}
        </div>
        <button onClick={newRequest} className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Plus size={14} /> Nouvelle demande</button>
      </div>
      <div className="space-y-3">
        {list.map(r => <RequestRow key={r.id} req={r} members={members} externalContacts={externalContacts} perm={perm} onApprove={onApprove} onReject={onReject} />)}
      </div>
      {list.length === 0 && <EmptyState icon={ClipboardList} title="Aucune demande" />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Vue d'ensemble (Manager)                                              */
/* ---------------------------------------------------------------------- */

function Dashboard({ tasks, members, projects, appointments, connectedAs, openTask, onClaim, onOpenProject }) {
  const [expandedMembers, setExpandedMembers] = useState(new Set());
  const toggleExpanded = (id) => setExpandedMembers(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const active = tasks.filter(t => t.status !== 'termine');
  const overdue = active.filter(t => t.deadline && daysBetween(t.deadline) < 0);
  const dueSoon = active.filter(t => t.deadline && daysBetween(t.deadline) >= 0 && daysBetween(t.deadline) <= 3);
  const doneCount = tasks.filter(t => t.status === 'termine').length;
  const openPool = tasks.filter(t => t.assignMode === 'pool' && !t.assigneeId && t.pool && t.pool.length > 0);
  const lateProjects = projects.filter(isProjectLate);

  const activeProjects = projects.filter(p => p.status !== 'termine');
  const projectsByMember = members.map(m => {
    const mine = activeProjects.filter(p => (p.responsibleIds || []).includes(m.id));
    return { member: m, projects: mine };
  }).sort((a, b) => b.projects.length - a.projects.length);

  const urgentList = [...overdue, ...dueSoon.filter(t => !overdue.includes(t))]
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || '')).slice(0, 6);
  const upcomingAppts = appointments.filter(a => daysBetween(a.date) >= 0 && daysBetween(a.date) <= 5)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 4);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Tâches actives', value: active.length, color: '#1849A9', bg: '#EFF4FF', Icon: ListChecks },
          { label: 'En retard', value: overdue.length, color: '#B42318', bg: '#FEF2F1', Icon: AlertTriangle },
          { label: 'À échéance ≤ 3j', value: dueSoon.length, color: '#B54708', bg: '#FEF8EC', Icon: Clock3 },
          { label: 'Terminées', value: doneCount, color: '#127A45', bg: '#EFFAF3', Icon: CheckCircle2 },
        ].map(k => (
          <div key={k.label} className="rounded-2xl p-4 shadow-sm" style={{ background: `linear-gradient(150deg, ${k.bg} 0%, #FFFFFF 65%)`, border: `1px solid ${k.color}22` }}>
            <div style={{ background: k.color, color: '#FFFFFF' }} className="w-8 h-8 rounded-lg flex items-center justify-center mb-3 shadow-sm"><k.Icon size={16} /></div>
            <div className="text-2xl font-semibold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: k.color }}>{k.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 p-5">
          {openPool.length > 0 && (
            <div className="mb-5 pb-5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5" style={{ fontFamily: 'Space Grotesk, sans-serif' }}><Users size={15} className="text-amber-500" /> Tâches ouvertes — à prendre</h3>
              <div className="space-y-1.5">
                {openPool.map(t => {
                  const canIClaim = t.pool.includes(connectedAs);
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-amber-50/50">
                      <button onClick={() => openTask(t)} className="min-w-0 flex-1 text-left">
                        <div className="text-xs font-medium text-slate-700 truncate">{t.title}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">{t.pool.map(pid => members.find(m => m.id === pid)?.name.split(' ')[0]).join(', ')}</div>
                      </button>
                      {canIClaim && <button onClick={() => onClaim(t.id)} className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shrink-0">Prendre</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <h3 className="text-sm font-semibold text-slate-700 mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Projets par personne</h3>
          <div className="divide-y divide-slate-50">
            {projectsByMember.map(w => {
              const isOpen = expandedMembers.has(w.member.id);
              return (
                <div key={w.member.id}>
                  <button onClick={() => w.projects.length > 0 && toggleExpanded(w.member.id)}
                    className={`w-full flex items-center gap-2.5 py-2.5 text-left ${w.projects.length > 0 ? 'cursor-pointer hover:bg-slate-50 rounded-lg px-1.5 -mx-1.5' : ''}`}>
                    <Avatar name={w.member.name} size={24} />
                    <span className="text-xs font-medium text-slate-600 flex-1">{w.member.name}</span>
                    <span className="text-xs text-slate-400">{w.projects.length} projet{w.projects.length !== 1 ? 's' : ''}</span>
                    {w.projects.length > 0 && <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                  </button>
                  {isOpen && w.projects.length > 0 && (
                    <div className="pl-9 pb-2.5 space-y-1">
                      {w.projects.map(p => {
                        const color = (p.service && SERVICE_COLORS[p.service]) || p.color || '#64748B';
                        return (
                          <button key={p.id} onClick={() => onOpenProject && onOpenProject(p)}
                            className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-slate-50">
                            <span style={{ background: color }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                            <span className="text-xs font-medium text-slate-600 truncate flex-1">{p.name}</span>
                            <span className="text-[11px] text-slate-400 shrink-0">{p.startDate ? fmtDate(p.startDate) : '?'} → {p.endDate ? fmtDate(p.endDate) : '?'}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          {lateProjects.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-100 p-5">
              <h3 className="text-sm font-semibold text-red-600 mb-3 flex items-center gap-1.5" style={{ fontFamily: 'Space Grotesk, sans-serif' }}><AlertTriangle size={15} /> Projets en retard</h3>
              <div className="space-y-1">
                {lateProjects.map(p => (
                  <button key={p.id} onClick={() => onOpenProject && onOpenProject(p)} className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-red-50/50 flex items-center gap-2.5">
                    <span style={{ background: p.color }} className="w-2.5 h-2.5 rounded-full shrink-0" />
                    <span className="text-xs font-medium text-slate-700 flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-red-600 font-semibold">Fin prévue le {fmtDate(p.endDate)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>À traiter en priorité</h3>
            {urgentList.length === 0 ? <EmptyState icon={CheckCircle2} title="Rien d'urgent" /> : (
              <div className="space-y-1">
                {urgentList.map(t => {
                  const m = members.find(x => x.id === t.assigneeId);
                  return (
                    <button key={t.id} onClick={() => openTask(t)} className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2.5">
                      {m && <Avatar name={m.name} size={22} />}
                      <div className="min-w-0 flex-1"><div className="text-xs font-medium text-slate-700 truncate">{t.title}</div><div className="text-xs text-slate-400">{m?.name || (t.assignMode === 'pool' ? 'Tâche ouverte' : 'Non assignée')}</div></div>
                      <DeadlineBadge deadline={t.deadline} status={t.status} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Prochains rendez-vous</h3>
            {upcomingAppts.length === 0 ? <EmptyState icon={CalendarDays} title="Aucun rendez-vous à venir" /> : (
              <div className="space-y-1">
                {upcomingAppts.map(a => (
                  <div key={a.id} className="px-2.5 py-2 rounded-lg flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex flex-col items-center justify-center text-[10px] font-semibold leading-none shrink-0"><span>{fmtDate(a.date).split(' ')[0]}</span><span className="uppercase">{fmtDate(a.date).split(' ')[1]}</span></div>
                    <div className="min-w-0 flex-1"><div className="text-xs font-medium text-slate-700 truncate">{a.title}</div><div className="text-xs text-slate-400">{a.time}{a.location ? ` · ${a.location}` : ''}</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Tâches — regroupées par projet, avec création de projet intégrée      */
/* ---------------------------------------------------------------------- */

function TasksView({ tasks, members, projects, perm, currentMemberId, scope, openTask, newTask, newProject, editProject }) {
  const [filterMember, setFilterMember] = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterService, setFilterService] = useState('all');
  const [query, setQuery] = useState('');
  const selectCls = "border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none";

  // Filtre "Manipulateurs" / "Secrétaires" : sur l'équipe affectée au projet
  // (teamIds), pas sur telle ou telle tâche — un projet dont l'équipe compte
  // au moins un manipulateur (ou une secrétaire) reste visible avec toutes
  // ses tâches. Pour les tâches sans projet, on retombe sur les personnes
  // impliquées dans la tâche elle-même.
  const rolesOf = (ids) => (ids || []).map(id => members.find(m => m.id === id)?.role).filter(Boolean);
  const matchesTeamRoles = (roles) => {
    if (filterTeam === 'all') return true;
    if (filterTeam === 'manip') return roles.some(r => r === 'Manipulateur' || r === 'Aide manipulateur');
    if (filterTeam === 'secretaire') return roles.some(r => r === 'Secrétaire');
    return true;
  };
  const projectMatchesTeam = (p) => matchesTeamRoles(rolesOf(p?.teamIds));
  const projectMatchesService = (p) => filterService === 'all' || p?.service === filterService;
  const matchesTeam = (t) => {
    if (filterTeam === 'all') return true;
    const ids = [t.assigneeId, ...(t.pool || []), ...Object.keys(t.raci || {})].filter(Boolean);
    return matchesTeamRoles(rolesOf(ids));
  };

  // tasks/projects arrivent déjà bornés à l'équipe de l'utilisateur pour les non-managers
  // (voir scopedTasks/scopedProjects dans ReferentApp) : pas besoin de refiltrer par équipe ici.
  const baseList = scope === 'mine'
    ? (perm.isReferent ? tasks : tasks.filter(t => isTaskOfMine(t, currentMemberId)))
    : tasks;

  const filtered = baseList.filter(t =>
    (filterMember === 'all' || t.assigneeId === filterMember || (t.raci && t.raci[filterMember]) || (t.pool && t.pool.includes(filterMember))) &&
    (filterProject === 'all' || t.projectId === filterProject) &&
    (filterStatus === 'all' || t.status === filterStatus) &&
    t.title.toLowerCase().includes(query.toLowerCase())
  );

  const visibleProjects = projects.filter(p => projectMatchesTeam(p) && projectMatchesService(p));
  const byDeadline = (a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.localeCompare(b.deadline);
  };
  // Les tâches/projets dont on est responsable passent avant ceux où on est
  // juste convié (RACI C/I, pool, ou simple membre de l'équipe).
  const amResponsibleTask = (t) => t.assigneeId === currentMemberId || (t.raci && t.raci[currentMemberId] === 'R');
  const byResponsibleThenDeadline = (a, b) => {
    const ra = amResponsibleTask(a), rb = amResponsibleTask(b);
    if (ra !== rb) return ra ? -1 : 1;
    return byDeadline(a, b);
  };

  const grouped = filterProject === 'all';
  const projectGroups = grouped
    ? visibleProjects.map(p => ({ project: p, items: filtered.filter(t => t.projectId === p.id).sort(byResponsibleThenDeadline) })).filter(g => g.items.length > 0)
    : [{ project: projects.find(p => p.id === filterProject), items: [...filtered].sort(byResponsibleThenDeadline) }];
  const noProject = filtered.filter(t => !projects.some(p => p.id === t.projectId) && matchesTeam(t) && filterService === 'all').sort(byResponsibleThenDeadline);
  const noProjectGroup = grouped && noProject.length ? { project: { id: '_none', name: 'Sans projet', color: '#94A3B8' }, items: noProject } : null;

  // Regroupement par service (couleur dominante), puis par ordre chronologique
  // (date de début du projet) à l'intérieur de chaque service.
  const byProjectStart = (a, b) => {
    const sa = a.project.startDate, sb = b.project.startDate;
    if (!sa && !sb) return 0;
    if (!sa) return 1;
    if (!sb) return -1;
    return sa.localeCompare(sb);
  };
  const serviceBuckets = grouped
    ? [
        ...PROJECT_SERVICES.map(s => ({ service: s, groups: projectGroups.filter(g => g.project.service === s).sort(byProjectStart) })),
        { service: null, groups: projectGroups.filter(g => !g.project.service).sort(byProjectStart) },
      ].filter(b => b.groups.length > 0)
    : [];

  const Row = ({ t }) => {
    const responsibles = responsibleIdsOf(t).map(id => members.find(m2 => m2.id === id)).filter(Boolean);
    return (
      <tr onClick={() => openTask(t)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer">
        <td className="px-4 py-2.5">
          <div className="font-medium text-slate-700 flex items-center gap-1.5">
            {t.isGovernance && <GovIcon id={t.governanceType} size={12} className="text-purple-500 shrink-0" />}
            {t.repeatUnit && t.repeatUnit !== 'aucune' && <Repeat size={12} className="text-slate-400 shrink-0" />}
            {t.title}
          </div>
        </td>
        <td className="px-4 py-2.5">
          {responsibles.length > 0 ? (
            <div className="flex -space-x-1.5">{responsibles.map(r => <Avatar key={r.id} name={r.name} size={22} />)}</div>
          ) : t.assignMode === 'pool' ? <span className="text-xs text-amber-600 font-medium flex items-center gap-1"><Users size={12} /> À prendre ({t.pool.length})</span>
          : <span className="text-xs text-slate-400">—</span>}
        </td>
        <td className="px-4 py-2.5"><ScopeTag id={t.scope} /></td>
        <td className="px-4 py-2.5"><StatusTag id={t.status} /></td>
        <td className="px-4 py-2.5"><DeadlineBadge startDate={t.startDate} deadline={t.deadline} status={t.status} /></td>
      </tr>
    );
  };

  const ProjectGroupBlock = ({ g }) => {
    // Le bandeau reprend la couleur dominante du service (cohérence visuelle
    // avec le titre de section), et retombe sur la couleur propre du projet
    // si aucun service n'est renseigné.
    const bandColor = (g.project?.service && SERVICE_COLORS[g.project.service]) || g.project?.color || '#94A3B8';
    return (
    <div className="mb-4">
      {g.project && g.project.id !== '_none' && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-t-2xl flex-wrap" style={{ background: `linear-gradient(120deg, ${bandColor}, ${bandColor}AA)` }}>
          <span className="text-xs font-semibold text-white">{g.project.name}</span>
          <span className="text-xs text-white/70">· {g.items.length} tâche{g.items.length !== 1 ? 's' : ''}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-white/25 text-white">{g.project.status === 'termine' ? 'Terminé' : 'En cours'}</span>
          {isProjectLate(g.project) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-500 text-white flex items-center gap-1"><AlertTriangle size={10} /> En retard</span>
          )}
          {g.project.pendingApproval && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-400 text-amber-950 flex items-center gap-1"><AlertTriangle size={10} /> En attente de validation</span>
          )}
          {(g.project.responsibleIds || []).length > 0 && (
            <span className="text-[10px] text-white/80 flex items-center gap-1">
              Responsable{g.project.responsibleIds.length > 1 ? 's' : ''} : {g.project.responsibleIds.map(id => members.find(m => m.id === id)?.name).filter(Boolean).join(', ') || '—'}
            </span>
          )}
          {perm.canCreateProject && (
            <button onClick={() => editProject(g.project)} className="text-white/70 hover:text-white p-0.5" title="Modifier ou supprimer ce projet">
              <Pencil size={11} />
            </button>
          )}
          {perm.canCreateTask && (
            <button onClick={() => newTask(g.project.id)} className="text-white/70 hover:text-white p-0.5" title="Nouvelle tâche dans ce projet">
              <Plus size={12} />
            </button>
          )}
          {g.project.externalIds && g.project.externalIds.length > 0 && (
            <span className="text-[10px] text-white bg-white/25 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Building2 size={10} />{g.project.externalIds.length}</span>
          )}
        </div>
      )}
      {g.project && g.project.id === '_none' && (
        <div className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-t-2xl bg-slate-100">
          <span className="text-xs font-semibold text-slate-500">{g.project.name}</span>
          <span className="text-xs text-slate-400">· {g.items.length} tâche{g.items.length !== 1 ? 's' : ''}</span>
        </div>
      )}
      <div className="bg-white rounded-b-2xl border border-t-0 border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="px-4 py-2.5 font-medium">Tâche</th><th className="px-4 py-2.5 font-medium">Assignée à</th>
            <th className="px-4 py-2.5 font-medium">Durée</th>
            <th className="px-4 py-2.5 font-medium">Statut</th><th className="px-4 py-2.5 font-medium">Échéance</th>
          </tr></thead>
          <tbody>{g.items.map(t => <Row key={t.id} t={t} />)}</tbody>
        </table>
      </div>
    </div>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher une tâche…" className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        <select className={selectCls} value={filterMember} onChange={e => setFilterMember(e.target.value)}>
          <option value="all">Tous les collaborateurs</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className={selectCls} value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="all">Tous les projets (regroupés)</option>{visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className={selectCls} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">Tous les statuts</option>{STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select className={selectCls} value={filterService} onChange={e => setFilterService(e.target.value)}>
          <option value="all">Tous les services</option>{PROJECT_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {[{ id: 'all', label: 'Toute l\'équipe' }, { id: 'manip', label: 'Manipulateurs' }, { id: 'secretaire', label: 'Secrétaires' }].map(o => (
            <button key={o.id} type="button" onClick={() => setFilterTeam(o.id)}
              className={`px-3 py-1.5 ${filterTeam === o.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {perm.canCreateProject && <button onClick={newProject} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><FolderPlus size={14} /> Nouveau projet</button>}
          {perm.canCreateTask && <button onClick={() => newTask(filterProject !== 'all' ? filterProject : undefined)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Plus size={14} /> Nouvelle tâche</button>}
        </div>
      </div>

      {grouped ? (
        serviceBuckets.length === 0 && !noProjectGroup ? (
          <div className="bg-white rounded-2xl border border-slate-100"><EmptyState icon={Inbox} title="Aucune tâche" subtitle="Créez une tâche ou ajustez les filtres." /></div>
        ) : (
          <>
            {serviceBuckets.map(b => (
              <div key={b.service || '_sans_service'} className="mb-6">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.service ? SERVICE_COLORS[b.service] : '#94A3B8' }} />
                  <span className="text-xs font-bold uppercase tracking-wide shrink-0" style={{ color: b.service ? SERVICE_COLORS[b.service] : '#94A3B8' }}>{b.service || 'Sans service'}</span>
                  <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${b.service ? SERVICE_COLORS[b.service] : '#94A3B8'}55, transparent)` }} />
                </div>
                {b.groups.map(g => <ProjectGroupBlock key={g.project.id} g={g} />)}
              </div>
            ))}
            {noProjectGroup && <ProjectGroupBlock g={noProjectGroup} />}
          </>
        )
      ) : (
        projectGroups.length === 0 || projectGroups[0].items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100"><EmptyState icon={Inbox} title="Aucune tâche" subtitle="Créez une tâche ou ajustez les filtres." /></div>
        ) : projectGroups.map(g => <ProjectGroupBlock key={g.project?.id || 'x'} g={g} />)
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Équipe & Contacts externes                                            */
/* ---------------------------------------------------------------------- */

function TeamView({ members, tasks, perm, editMember, newMember, onImport }) {
  const fileInputRef = React.useRef(null);
  const [importMsg, setImportMsg] = useState('');
  const [query, setQuery] = useState('');
  const visibleMembers = members
    .filter(m => m.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = decodeBestEffort(reader.result);
      const newMembers = membersFromCSV(text);
      if (newMembers.length === 0) { setImportMsg("Aucune ligne valide trouvée dans le fichier."); }
      else { onImport(newMembers); setImportMsg(`${newMembers.length} collaborateur${newMembers.length !== 1 ? 's' : ''} importé${newMembers.length !== 1 ? 's' : ''} (sans email, en rôle Utilisateur — à compléter).`); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un collaborateur…" className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        {perm.canManageTeam && (
          <div className="flex items-center gap-2 ml-auto">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            <button onClick={() => fileInputRef.current?.click()} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Upload size={14} /> Importer un fichier (CSV)</button>
            <button onClick={newMember} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Plus size={14} /> Ajouter un collaborateur</button>
          </div>
        )}
      </div>
      {importMsg && <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 mb-4">{importMsg}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visibleMembers.map(m => {
          const active = tasks.filter(t => isTaskOfMine(t, m.id) && t.status !== 'termine').length;
          return (
            <div key={m.id} className="bg-white rounded-2xl border border-slate-100 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3"><Avatar name={m.name} size={40} /><div><div className="font-medium text-slate-700 text-sm">{m.name}</div><div className="text-xs text-slate-400">{m.role}{(m.services || []).length > 0 ? ` · ${m.services.join(', ')}` : ''}</div></div></div>
                {perm.canManageTeam && <button onClick={() => editMember(m)} className="text-slate-300 hover:text-slate-500 p-1"><Pencil size={14} /></button>}
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap"><RoleTag id={m.accessLevel} />{m.email && <span className="text-xs text-slate-400 flex items-center gap-1"><Mail size={11} />{m.email}</span>}</div>
              <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-50">{active} tâche{active !== 1 ? 's' : ''} en cours</div>
            </div>
          );
        })}
      </div>
      {visibleMembers.length === 0 && <EmptyState icon={Users} title={members.length === 0 ? "Aucun collaborateur" : "Aucun résultat"} />}
    </div>
  );
}

function ContactsView({ contacts, perm, editContact, newContact }) {
  const [query, setQuery] = useState('');
  const visibleContacts = contacts
    .filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un contact…" className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        {perm.canManageContacts && (
          <button onClick={newContact} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 ml-auto"><Plus size={14} /> Ajouter un contact</button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visibleContacts.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><Building2 size={16} /></div>
                <div><div className="font-medium text-slate-700 text-sm">{c.name}</div><div className="text-xs text-slate-400">{c.role}{c.role && c.organization ? ' · ' : ''}{c.organization}</div></div>
              </div>
              {perm.canManageContacts && <button onClick={() => editContact(c)} className="text-slate-300 hover:text-slate-500 p-1"><Pencil size={14} /></button>}
            </div>
            {(c.email || c.phone) && (
              <div className="mt-3 pt-3 border-t border-slate-50 flex flex-col gap-1">
                {c.email && <div className="text-xs text-slate-400 flex items-center gap-1"><Mail size={11} />{c.email}</div>}
                {c.phone && <div className="text-xs text-slate-400 flex items-center gap-1"><Phone size={11} />{fmtPhone(c.phone)}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
      {visibleContacts.length === 0 && <EmptyState icon={Building2} title={contacts.length === 0 ? "Aucun contact externe" : "Aucun résultat"} />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Planning — calendrier mensuel + export .ics groupé                    */
/* ---------------------------------------------------------------------- */

function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
const isoOfDate = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;

// Grille mensuelle générique — le contenu de chaque case (tâches/RDV pour
// Planning, projets actifs ce jour-là pour Durée des projets...) est fourni
// par renderDay(iso), pour réutiliser la même mise en page partout.
function MonthCalendar({ year, month, onPrev, onNext, renderDay }) {
  const cells = monthMatrix(year, month);
  const monthLabel = new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrev} className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-400"><ChevronLeft size={16} /></button>
        <div className="text-sm font-semibold text-slate-700 capitalize" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{monthLabel}</div>
        <button onClick={onNext} className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-400"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] text-slate-400 mb-1 uppercase">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => <div key={d} className="text-center py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const iso = isoOfDate(d);
          const today = iso === todayISO();
          return (
            <div key={i} className={`min-h-[76px] rounded-lg border p-1 ${d ? 'border-slate-100' : 'border-transparent'} ${today ? 'bg-blue-50/50 border-blue-200' : ''}`}>
              {d && <div className={`text-[10px] mb-1 ${today ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>{d.getDate()}</div>}
              <div className="space-y-0.5">{d && renderDay(iso)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlanningView({ members, tasks, appointments, externalContacts, perm, currentMemberId, openTask, openAppt, newAppt }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const person = members.find(m => m.id === currentMemberId);

  const mine = tasks.filter(t => isTaskOfMine(t, currentMemberId));
  const myAppts = appointments.filter(a => a.participants.includes(currentMemberId));
  const myOpenPool = tasks.filter(t => t.assignMode === 'pool' && !t.assigneeId && t.pool && t.pool.includes(currentMemberId));

  // Planning = uniquement les tâches ponctuelles (un seul jour, comme un rendez-vous) : pas de startDate,
  // ou startDate identique à l'échéance. Les tâches qui s'étalent sur plusieurs jours restent dans Tâches/Gantt.
  const punctualMine = mine.filter(t => t.deadline && (!t.startDate || t.startDate === t.deadline));

  const [exportTime, setExportTime] = useState('09:00');

  const dayTasks = {};
  punctualMine.forEach(t => {
    projectOccurrences(t).forEach(date => { (dayTasks[date] = dayTasks[date] || []).push(t); });
  });
  const dayAppts = {}; myAppts.forEach(a => (dayAppts[a.date] = dayAppts[a.date] || []).push(a));

  // Liste "Rendez-vous" : les vrais rendez-vous + les tâches de type Rendez-vous (envergure ≤2h) —
  // cliquer ouvre directement la vraie tâche/le vrai rendez-vous, donc modifier l'un modifie l'autre.
  const rdvTasks = punctualMine.filter(t => t.scope === 'eclair');
  const rdvList = [
    ...myAppts.map(a => ({ kind: 'appt', id: a.id, title: a.title, date: a.date, time: a.time, item: a })),
    ...rdvTasks.map(t => ({ kind: 'task', id: t.id, title: t.title, date: t.deadline, time: t.time, item: t })),
  ].sort((x, y) => (x.date + (x.time || '')).localeCompare(y.date + (y.time || '')));

  const handleExportIcs = () => {
    const events = [];
    punctualMine.forEach(t => {
      projectOccurrences(t).forEach(date => events.push({ title: t.title, date, time: t.time || exportTime, location: '', notes: t.description }));
    });
    myAppts.forEach(a => events.push({ title: a.title, date: a.date, time: a.time, location: a.location, notes: a.notes }));
    if (events.length === 0) return;
    downloadTextFile(`planning-${(person?.name || 'export').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`, buildICSMulti(events), 'text/calendar');
  };
  const handleDownloadOne = (row) => {
    if (row.kind === 'appt') {
      const a = row.item;
      const invitees = [...members.filter(m => a.participants.includes(m.id)), ...(externalContacts || []).filter(c => (a.externalParticipants || []).includes(c.id))];
      downloadTextFile(`${(a.title || 'rendez-vous').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`, buildICS(a, invitees), 'text/calendar');
    } else {
      const t = row.item;
      downloadTextFile(`${(t.title || 'rendez-vous').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`, buildICSMulti([{ title: t.title, date: t.deadline, time: t.time || exportTime, location: '', notes: t.description }]), 'text/calendar');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        {perm.canManageAppointments && (
          <div className="flex justify-end">
            <button onClick={newAppt} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Plus size={14} /> Nouveau rendez-vous</button>
          </div>
        )}
        {myOpenPool.length > 0 && (
          <div className="bg-white rounded-2xl border border-amber-100 p-3">
            <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2 px-1">Tâches ouvertes disponibles</div>
            <div className="divide-y divide-slate-50">
              {myOpenPool.map(t => (
                <button key={t.id} onClick={() => openTask(t)} className="w-full text-left px-2 py-2 hover:bg-amber-50/40 flex items-center gap-2.5 rounded-lg">
                  <Users size={14} className="text-amber-500 shrink-0" />
                  <span className="text-sm text-slate-700 flex-1 truncate">{t.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <MonthCalendar
          year={cursor.year} month={cursor.month}
          onPrev={() => setCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })}
          onNext={() => setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })}
          renderDay={(iso) => (
            <>
              {(dayAppts[iso] || []).map(a => (
                <button key={a.id} onClick={() => openAppt(a)} className="w-full text-left text-[10px] leading-tight bg-blue-100 text-blue-700 rounded px-1 py-0.5 block whitespace-normal break-words">{a.time} {a.title}</button>
              ))}
              {(dayTasks[iso] || []).map(t => {
                const repeating = t.repeatUnit && t.repeatUnit !== 'aucune';
                return (
                  <button key={t.id} onClick={() => openTask(t)} className="w-full text-left text-[10px] leading-tight bg-slate-100 text-slate-600 rounded px-1 py-0.5 flex items-start gap-0.5 whitespace-normal break-words">
                    {repeating && <Repeat size={9} className="shrink-0 mt-0.5" />}<span>{t.time ? `${t.time} ` : ''}{t.title}</span>
                  </button>
                );
              })}
            </>
          )}
        />
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 mb-2">Rendez-vous</div>
          <div className="divide-y divide-slate-50">
            {rdvList.map(row => (
              <div key={`${row.kind}-${row.id}`} className="flex items-center gap-2 py-2">
                <button onClick={() => row.kind === 'appt' ? openAppt(row.item) : openTask(row.item)} className="flex-1 min-w-0 text-left hover:bg-slate-50 rounded-lg px-1 -mx-1 py-0.5">
                  <div className="text-xs font-medium text-slate-700 truncate">{row.title}</div>
                  <div className="text-xs text-slate-400">{fmtDate(row.date)}{row.time ? ` · ${row.time}` : ''}</div>
                </button>
                <button onClick={() => handleDownloadOne(row)} title="Télécharger (.ics)" className="text-slate-300 hover:text-blue-600 p-1 shrink-0"><Download size={13} /></button>
              </div>
            ))}
            {rdvList.length === 0 && <div className="text-xs text-slate-400 py-4 text-center">Aucun rendez-vous</div>}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-3">
          <div className="text-[10px] text-slate-400 mb-1">Horaire par défaut (tâches sans heure propre)</div>
          <input type="time" value={exportTime} onChange={e => setExportTime(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600 mb-1.5" />
          <button onClick={handleExportIcs} className="w-full text-xs font-medium text-slate-500 hover:text-blue-700 flex items-center justify-center gap-1.5 py-1.5">
            <Download size={13} /> Exporter tout le planning (.ics)
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Durée des projets (ex-Gantt)                                          */
/* ---------------------------------------------------------------------- */

// Semaine par semaine, chaque élément (projet ou tâche, selon getRange/
// getColor/getLabel fournis par l'appelant) est dessiné une seule fois en
// barre continue sur ses jours d'activité (grille CSS, colonnes = jours de
// la semaine), au lieu de répéter son nom dans chaque case comme un agenda
// classique. Plusieurs éléments actifs la même semaine s'empilent chacun
// sur leur propre ligne (recherche de la première ligne libre).
function SpanMonthCalendar({ year, month, items, onPrev, onNext, onOpenItem, getRange, getColor, getLabel }) {
  const cells = monthMatrix(year, month);
  const monthLabel = new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrev} className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-400"><ChevronLeft size={16} /></button>
        <div className="text-sm font-semibold text-slate-700 capitalize" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{monthLabel}</div>
        <button onClick={onNext} className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-400"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] text-slate-400 mb-1 uppercase">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => <div key={d} className="text-center py-1">{d}</div>)}
      </div>
      <div className="space-y-1">
        {weeks.map((week, wi) => {
          const isoWeek = week.map(isoOfDate);
          const weekDates = isoWeek.filter(Boolean);
          if (weekDates.length === 0) return null;
          const wMin = weekDates[0], wMax = weekDates[weekDates.length - 1];
          const active = items.filter(it => { const r = getRange(it); return r.start <= wMax && r.end >= wMin; })
            .map(it => {
              const r = getRange(it);
              const startCol = isoWeek.findIndex(iso => iso && iso >= r.start);
              let endCol = 6;
              for (let i = 6; i >= 0; i--) { if (isoWeek[i] && isoWeek[i] <= r.end) { endCol = i; break; } }
              return { it, startCol, endCol, lane: 0 };
            })
            .sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol);
          const lanes = [];
          active.forEach(item => {
            let li = lanes.findIndex(lane => lane.every(e => e.endCol < item.startCol || e.startCol > item.endCol));
            if (li === -1) { lanes.push([item]); li = lanes.length - 1; } else lanes[li].push(item);
            item.lane = li;
          });
          const laneCount = Math.max(1, lanes.length);
          return (
            <div key={wi} className="grid grid-cols-7 gap-1 pb-1 border-b border-slate-50 last:border-0" style={{ gridAutoRows: '18px', minHeight: 18 + laneCount * 20 }}>
              {week.map((d, i) => {
                const today = isoOfDate(d) === todayISO();
                return (
                  <div key={i} style={{ gridColumn: i + 1, gridRow: 1 }}
                    className={`text-[10px] px-1 rounded ${(i === 5 || i === 6) ? 'bg-slate-50/70' : ''} ${today ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>
                    {d ? d.getDate() : ''}
                  </div>
                );
              })}
              {active.map(({ it, startCol, endCol, lane }) => {
                const color = getColor(it);
                return (
                  <button key={it.id} onClick={() => onOpenItem(it)}
                    style={{ gridColumn: `${startCol + 1} / ${endCol + 2}`, gridRow: lane + 2, background: `${color}22`, color }}
                    className="text-[10px] font-medium rounded px-1.5 h-[18px] flex items-center truncate hover:brightness-95">
                    {getLabel(it)}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function GanttView({ tasks, projects, members, openTask, onOpenProject }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [displayMode, setDisplayMode] = useState('project'); // 'project' | 'task'
  const [filterService, setFilterService] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [expanded, setExpanded] = useState(new Set());
  const toggleExpanded = (id) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const rolesOf = (ids) => (ids || []).map(id => members.find(m => m.id === id)?.role).filter(Boolean);
  const matchesTeamRoles = (roles) => {
    if (filterTeam === 'all') return true;
    if (filterTeam === 'manip') return roles.some(r => r === 'Manipulateur' || r === 'Aide manipulateur');
    if (filterTeam === 'secretaire') return roles.some(r => r === 'Secrétaire');
    return true;
  };
  const filteredProjects = projects.filter(p => p.startDate && p.endDate &&
    (filterService === 'all' || p.service === filterService) && matchesTeamRoles(rolesOf(p.teamIds)));
  const sortedProjects = [...filteredProjects].sort((a, b) => a.startDate.localeCompare(b.startDate));

  const filteredTasks = tasks.filter(t => {
    if (!t.deadline) return false;
    const proj = projects.find(p => p.id === t.projectId);
    if (filterService !== 'all' && proj?.service !== filterService) return false;
    const ids = [t.assigneeId, ...(t.pool || []), ...Object.keys(t.raci || {})].filter(Boolean);
    return matchesTeamRoles(rolesOf(ids));
  }).map(t => { let start = t.startDate || t.deadline; if (start > t.deadline) start = t.deadline; return { ...t, _start: start }; });
  const sortedTasks = [...filteredTasks].sort((a, b) => a.deadline.localeCompare(b.deadline));

  const empty = displayMode === 'project' ? filteredProjects.length === 0 : filteredTasks.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {[{ id: 'project', label: 'Projets' }, { id: 'task', label: 'Tâches' }].map(o => (
            <button key={o.id} type="button" onClick={() => setDisplayMode(o.id)}
              className={`px-3 py-1.5 font-medium ${displayMode === o.id ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
              {o.label}
            </button>
          ))}
        </div>
        <select className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none" value={filterService} onChange={e => setFilterService(e.target.value)}>
          <option value="all">Tous les services</option>{PROJECT_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {[{ id: 'all', label: 'Tout métier' }, { id: 'manip', label: 'Manipulateurs' }, { id: 'secretaire', label: 'Secrétaires' }].map(o => (
            <button key={o.id} type="button" onClick={() => setFilterTeam(o.id)}
              className={`px-3 py-1.5 ${filterTeam === o.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {empty ? (
        <EmptyState icon={GanttChartSquare} title={displayMode === 'project' ? 'Aucun projet planifiable' : 'Aucune tâche planifiable'}
          subtitle={displayMode === 'project' ? 'Renseignez une durée de projet (début et fin), ou ajustez les filtres.' : 'Renseignez une échéance sur vos tâches, ou ajustez les filtres.'} />
      ) : displayMode === 'project' ? (
        <>
          <SpanMonthCalendar
            year={cursor.year} month={cursor.month} items={filteredProjects}
            onPrev={() => setCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })}
            onNext={() => setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })}
            onOpenItem={onOpenProject}
            getRange={(p) => ({ start: p.startDate, end: p.endDate })}
            getColor={(p) => (p.service && SERVICE_COLORS[p.service]) || p.color || '#64748B'}
            getLabel={(p) => {
              const r = members.find(m => (p.responsibleIds || []).includes(m.id));
              return r ? `${p.name} · ${r.name.split(' ')[0]}` : p.name;
            }}
          />
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Projets ({sortedProjects.length})</h3>
            <div className="divide-y divide-slate-50">
              {sortedProjects.map(p => {
                const isOpen = expanded.has(p.id);
                const color = (p.service && SERVICE_COLORS[p.service]) || p.color || '#64748B';
                const projectTasks = tasks.filter(t => t.projectId === p.id).sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
                return (
                  <div key={p.id}>
                    <button onClick={() => toggleExpanded(p.id)}
                      className="w-full flex items-center gap-2.5 py-2.5 text-left cursor-pointer hover:bg-slate-50 rounded-lg px-1.5 -mx-1.5">
                      <span style={{ background: color }} className="w-2 h-2 rounded-full shrink-0" />
                      <span className="text-xs font-medium text-slate-600 flex-1 truncate">{p.name}</span>
                      {(() => {
                        const r = members.find(m => (p.responsibleIds || []).includes(m.id));
                        return r ? <span className="text-[11px] text-slate-400 shrink-0 flex items-center gap-1"><Avatar name={r.name} size={16} />{r.name.split(' ')[0]}</span> : null;
                      })()}
                      <span className="text-[11px] text-slate-400 shrink-0">{fmtDate(p.startDate)} → {fmtDate(p.endDate)}</span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="pl-6 pb-2.5 space-y-1">
                        {projectTasks.length === 0 ? (
                          <div className="text-xs text-slate-300 py-1">Aucune tâche sur ce projet</div>
                        ) : projectTasks.map(t => (
                          <button key={t.id} onClick={() => openTask(t)} className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-slate-50">
                            {t.isGovernance && <GovIcon id={t.governanceType} size={12} className="text-purple-500 shrink-0" />}
                            <span className="text-xs text-slate-600 truncate flex-1">{t.title}</span>
                            <DeadlineBadge deadline={t.deadline} status={t.status} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <>
          <SpanMonthCalendar
            year={cursor.year} month={cursor.month} items={filteredTasks}
            onPrev={() => setCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })}
            onNext={() => setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })}
            onOpenItem={openTask}
            getRange={(t) => ({ start: t._start, end: t.deadline })}
            getColor={(t) => { const proj = projects.find(p => p.id === t.projectId); return (proj?.service && SERVICE_COLORS[proj.service]) || proj?.color || '#64748B'; }}
            getLabel={(t) => {
              const r = responsibleIdsOf(t).map(id => members.find(m => m.id === id)).filter(Boolean)[0];
              return r ? `${t.title} · ${r.name.split(' ')[0]}` : t.title;
            }}
          />
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Tâches ({sortedTasks.length})</h3>
            <div className="divide-y divide-slate-50">
              {sortedTasks.map(t => {
                const responsibles = responsibleIdsOf(t).map(id => members.find(m => m.id === id)).filter(Boolean);
                return (
                  <button key={t.id} onClick={() => openTask(t)} className="w-full flex items-center gap-2.5 py-2.5 text-left hover:bg-slate-50 rounded-lg px-1.5 -mx-1.5">
                    {t.isGovernance ? <GovIcon id={t.governanceType} size={14} className="text-purple-500 shrink-0" /> : responsibles[0] && <Avatar name={responsibles[0].name} size={20} />}
                    <span className="text-xs font-medium text-slate-600 flex-1 truncate">{t.title}</span>
                    <DeadlineBadge deadline={t.deadline} status={t.status} />
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Priorisation (matrice urgence × importance)                           */
/* ---------------------------------------------------------------------- */

function ProjectPriorityCard({ p, members, onOpenProject }) {
  const responsibles = (p.responsibleIds || []).map(id => members.find(m => m.id === id)).filter(Boolean);
  const color = (p.service && SERVICE_COLORS[p.service]) || p.color || '#64748B';
  return (
    <button onClick={() => onOpenProject(p)} className="w-full text-left bg-white/70 hover:bg-white rounded-xl px-3 py-2.5 border border-slate-100">
      <div className="text-xs font-medium text-slate-700 truncate mb-1.5 flex items-center gap-1.5">
        <span style={{ background: color }} className="w-2 h-2 rounded-full shrink-0" />{p.name}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {p.service && <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>{p.service}</span>}
        {responsibles[0] && <span className="flex items-center gap-1 text-[10px] text-slate-400"><Avatar name={responsibles[0].name} size={16} />{responsibles[0].name.split(' ')[0]}</span>}
        <span className="ml-auto text-[10px] text-slate-400">{p.endDate ? `Fin ${fmtDate(p.endDate)}` : 'Sans échéance'}</span>
      </div>
    </button>
  );
}
function Quadrant({ title, subtitle, accent, bg, list, renderItem }) {
  return (
    <div style={{ background: bg, border: `1.5px solid ${accent}55` }} className="rounded-2xl p-4 min-h-[220px]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: accent }}>{title}</div>
          <div className="text-xs text-slate-500">{subtitle}</div>
        </div>
        <span style={{ background: accent }} className="text-white text-xs font-semibold rounded-full w-6 h-6 flex items-center justify-center shrink-0">{list.length}</span>
      </div>
      <div className="space-y-1.5">
        {list.length === 0 && <div className="text-xs text-slate-400 px-1">Rien ici</div>}
        {list.map(renderItem)}
      </div>
    </div>
  );
}
// Classe automatiquement les projets (pas les tâches) selon la Priorité et
// l'Importance fixées à leur création — le classement se met à jour tout
// seul dès qu'on modifie ces champs sur le projet.
function PrioritisationView({ projects, members, onOpenProject }) {
  const active = projects.filter(p => p.status !== 'termine');
  const sortByEnd = (a, b) => (a.endDate || '9999').localeCompare(b.endDate || '9999');
  const q1 = active.filter(p => isUrgent(p) && isImportant(p)).sort(sortByEnd);
  const q2 = active.filter(p => !isUrgent(p) && isImportant(p)).sort(sortByEnd);
  const q3 = active.filter(p => isUrgent(p) && !isImportant(p)).sort(sortByEnd);
  const q4 = active.filter(p => !isUrgent(p) && !isImportant(p)).sort(sortByEnd);
  const renderItem = (p) => <ProjectPriorityCard key={p.id} p={p} members={members} onOpenProject={onOpenProject} />;
  return (
    <div>
      <div className="text-xs text-slate-400 mb-4">Le classement est automatique, d'après la Priorité et l'Importance fixées à la création du projet (modifiables par un administrateur depuis la fiche projet).</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Quadrant title="Faire maintenant" subtitle="Urgent et important" accent="#B42318" bg="#FBD5D1" list={q1} renderItem={renderItem} />
        <Quadrant title="Planifier" subtitle="Important, pas urgent" accent="#1849A9" bg="#C9DBFD" list={q2} renderItem={renderItem} />
        <Quadrant title="Déléguer" subtitle="Urgent, peu important" accent="#B54708" bg="#FBE3AE" list={q3} renderItem={renderItem} />
        <Quadrant title="Reporter / éliminer" subtitle="Ni urgent ni important" accent="#475467" bg="#DBDFE3" list={q4} renderItem={renderItem} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Transmissions                                                         */
/* ---------------------------------------------------------------------- */

function TransmissionsView({ transmissions, members, currentMemberId, lastSeen, onPost }) {
  const channels = [
    ...SERVICES.map(s => ({ service: s, functionGroup: 'Secrétaire', label: `Secrétaires ${s}` })),
    ...SERVICES.map(s => ({ service: s, functionGroup: 'Manipulateur', label: `Manipulateurs ${s}` })),
  ];
  const currentMemberObj = members.find(m => m.id === currentMemberId);
  const myChannel = channels.find(c => (currentMemberObj?.services || []).includes(c.service) &&
    (currentMemberObj?.role === c.functionGroup || (c.functionGroup === 'Manipulateur' && currentMemberObj?.role === 'Aide manipulateur')));
  const [selected, setSelected] = useState(myChannel || channels[0]);
  const [message, setMessage] = useState('');
  const channelMsgs = transmissions
    .filter(t => t.service === selected.service && t.functionGroup === selected.functionGroup)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const fmtWhen = (iso) => iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const handleSend = () => {
    if (!message.trim()) return;
    onPost(selected.service, selected.functionGroup, message.trim());
    setMessage('');
  };
  return (
    <div className="flex gap-4 items-start">
      <div className="w-56 shrink-0 space-y-1.5">
        {channels.map(c => {
          const active = selected.service === c.service && selected.functionGroup === c.functionGroup;
          const color = SERVICE_COLORS[c.service] || '#64748B';
          // Nombre de messages non lus (depuis la dernière ouverture de
          // l'onglet), pas le total depuis toujours — sinon ce chiffre ne
          // redescend jamais à zéro une fois qu'un canal a reçu un message.
          const count = transmissions.filter(t => t.service === c.service && t.functionGroup === c.functionGroup &&
            t.authorId !== currentMemberId && (!lastSeen || t.createdAt > lastSeen)).length;
          return (
            <button key={`${c.functionGroup}-${c.service}`} onClick={() => setSelected(c)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm border font-medium"
              style={active ? { background: color, borderColor: color, color: '#fff' } : { background: `${color}14`, borderColor: `${color}55`, color }}>
              <span className="flex-1 text-left">{c.label}</span>
              {count > 0 && (
                <span className="text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0"
                  style={active ? { background: 'rgba(255,255,255,0.25)', color: '#fff' } : { background: `${color}22`, color }}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex-1 bg-white rounded-2xl border border-slate-100 flex flex-col" style={{ minHeight: 520 }}>
        <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-700" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{selected.label}</div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {channelMsgs.length === 0 && <EmptyState icon={MessageCircle} title="Aucun message" subtitle="Soyez la première personne à écrire ici." />}
          {channelMsgs.map(t => {
            const author = members.find(m => m.id === t.authorId);
            return (
              <div key={t.id} className="flex gap-2.5">
                <Avatar name={author?.name || '?'} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-slate-700">{author?.name || 'Ancien collaborateur'}</span>
                    <span className="text-[11px] text-slate-400">{fmtWhen(t.createdAt)}</span>
                  </div>
                  <div className="text-sm text-slate-600 whitespace-pre-wrap">{t.message}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-3 border-t border-slate-100 flex items-center gap-2">
          <input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            placeholder="Écrire un message pour ce service…" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          <button onClick={handleSend} disabled={!message.trim()} className="bg-blue-600 disabled:opacity-40 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-1.5">
            <Send size={14} /> Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Organigramme                                                          */
/* ---------------------------------------------------------------------- */

// Étiquette de rôle sous une personne (ex. "Référente qualité") : stockée
// sur l'affectation à la boîte (org_assignments), jamais sur la fiche
// collaborateur ou le contact externe — la modifier ici ne les touche pas.
// assignment.id === null : personne "automatique" (service coché sur sa
// fiche), pas encore de ligne en base — n'existe que pour l'affichage tant
// qu'on ne lui ajoute pas un rôle (ce qui crée alors la ligne réelle).
function OrgPersonChip({ assignment, person, canEdit, nodes, showFunction, tint, onUpdate, onRemove, onMaterialize }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(assignment.roleLabel || '');
  if (!person) return null;
  const auto = assignment.id === null;
  // Personnes externes (siège, prestataires...) : mêmes couleurs violettes
  // que "Contacts externes" ailleurs dans l'app. Sinon, dans une boîte de
  // service, la couleur du service teinte la personne (pas la boîte).
  const external = assignment.personType === 'external';
  const cardStyle = external ? undefined : (tint ? { background: `${tint}1F`, borderColor: `${tint}66` } : undefined);
  const nameStyle = !external && tint ? { color: tint } : undefined;
  const saveRole = () => {
    if (auto) onMaterialize(assignment.nodeId, assignment.personType, assignment.personId, role);
    else onUpdate(assignment.id, { roleLabel: role });
    setEditing(false);
  };
  return (
    <div className={`border rounded-lg px-2 py-1.5 group ${external ? 'bg-purple-50 border-purple-200' : (tint ? '' : 'bg-white border-slate-200')}`} style={cardStyle}>
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Avatar name={person.name} size={16} />
          <span className={`text-xs truncate ${external ? 'text-purple-700' : 'text-slate-700'}`} style={nameStyle}>{person.name}</span>
        </div>
        {canEdit && (
          <div className="hidden group-hover:flex items-center gap-1 shrink-0">
            <button onClick={() => setEditing(v => !v)} className="text-slate-400 hover:text-slate-600"><Pencil size={11} /></button>
            {!auto && <button onClick={() => onRemove(assignment.id)} className="text-slate-400 hover:text-red-600"><X size={11} /></button>}
          </div>
        )}
      </div>
      {person.email && <div className="text-[11px] text-slate-700 font-medium truncate">{person.email}</div>}
      {external && person.phone && <div className="text-[11px] text-slate-700 font-medium truncate">{fmtPhone(person.phone)}</div>}
      {showFunction && person.role && (
        <div className="text-[10px] text-slate-400 mt-0.5">{person.role}</div>
      )}
      {auto && !editing && (
        <div className="text-[9px] text-slate-400 italic mt-0.5">Auto (service coché sur la fiche)</div>
      )}
      {(assignment.roleLabel || editing) && !editing && (
        <div className="text-[10px] text-blue-600 mt-0.5">{assignment.roleLabel}</div>
      )}
      {editing && (
        <div className="flex items-center gap-1 mt-1">
          <input autoFocus value={role} onChange={e => setRole(e.target.value)} placeholder="Rôle (ex. Référente qualité)"
            className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 flex-1 min-w-0 focus:outline-none" />
          {!auto && (
            <select value={assignment.nodeId} onChange={e => onUpdate(assignment.id, { nodeId: e.target.value })} className="text-[10px] border border-slate-200 rounded px-1 py-0.5 max-w-[70px]" title="Déplacer vers…">
              {nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          )}
          <button onClick={saveRole} className="text-blue-600"><Check size={13} /></button>
        </div>
      )}
    </div>
  );
}

function OrgAddPersonForm({ members, externalContacts, onlyExternal, onAdd, onCancel }) {
  const [type, setType] = useState(onlyExternal ? 'external' : 'member');
  const [personId, setPersonId] = useState('');
  const options = type === 'member' ? members : externalContacts;
  return (
    <div className="flex items-center gap-1 mt-1.5">
      {!onlyExternal && (
        <select value={type} onChange={e => { setType(e.target.value); setPersonId(''); }} className="text-[11px] border border-slate-200 rounded px-1 py-1">
          <option value="member">Équipe</option>
          <option value="external">Externe</option>
        </select>
      )}
      <select value={personId} onChange={e => setPersonId(e.target.value)} className="text-[11px] border border-slate-200 rounded px-1 py-1 flex-1 min-w-0">
        <option value="">— choisir —</option>
        {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button disabled={!personId} onClick={() => { onAdd(type, personId); setPersonId(''); }} className="text-blue-600 disabled:opacity-30"><Check size={14} /></button>
      <button onClick={onCancel} className="text-slate-400"><X size={14} /></button>
    </div>
  );
}

// Regroupe les personnes d'une boîte par fonction (Secrétaires /
// Manipulateurs / Autres) quand la boîte n'a pas d'enfants — pure mise en
// forme, ne change rien aux données.
function orgPersonBucket(role) {
  if (role === 'Secrétaire') return 'Secrétaires';
  if (role === 'Manipulateur' || role === 'Aide manipulateur') return 'Manipulateurs';
  return 'Autres';
}
function OrgPeopleList({ list, personOf, canEdit, allNodes, onUpdateAssignment, onRemoveAssignment, onAddPerson, grouped, tint, horizontal }) {
  if (list.length === 0) return <span className="text-[11px] text-slate-400">Personne ici</span>;
  if (!grouped) {
    return (
      <div className={horizontal ? 'flex flex-wrap gap-1.5' : 'flex flex-col gap-1.5'}>
        {list.map(a => (
          <OrgPersonChip key={a.id || `auto-${a.personId}`} assignment={a} person={personOf(a)} canEdit={canEdit} nodes={allNodes} showFunction tint={tint}
            onUpdate={onUpdateAssignment} onRemove={onRemoveAssignment} onMaterialize={onAddPerson} />
        ))}
      </div>
    );
  }
  const buckets = { Secrétaires: [], Manipulateurs: [], Autres: [] };
  list.forEach(a => { const p = personOf(a); buckets[p ? orgPersonBucket(p.role) : 'Autres'].push(a); });
  return (
    <div className="flex flex-col gap-2.5">
      {Object.entries(buckets).filter(([, l]) => l.length > 0).map(([label, l]) => (
        <div key={label}>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</div>
          <div className="flex flex-col gap-1.5">
            {l.map(a => (
              <OrgPersonChip key={a.id || `auto-${a.personId}`} assignment={a} person={personOf(a)} canEdit={canEdit} nodes={allNodes} tint={tint}
                onUpdate={onUpdateAssignment} onRemove={onRemoveAssignment} onMaterialize={onAddPerson} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Boîtes IRM/Scanner/Radio... : mêmes couleurs de service que le reste de
// l'app (Radio/Scanner/IRM/Autre), reconnues par le nom de la boîte. Siège
// et Cabinet ont leur propre couleur dédiée (pas des services).
const ORG_NODE_COLORS = { 'Siège SIMAGO': '#0D9488', 'Cabinet': '#94A3B8', 'Manager': '#22C55E' };
function orgNodeMatchedService(label) {
  return PROJECT_SERVICES.find(s => s !== 'Autre' && label.toLowerCase().includes(s.toLowerCase())) || null;
}
function orgNodeServiceColor(label) {
  if (ORG_NODE_COLORS[label]) return ORG_NODE_COLORS[label];
  const service = orgNodeMatchedService(label);
  return service ? SERVICE_COLORS[service] : null;
}

// Bandeau plein de couleur en haut de chaque boîte (façon fiche annuaire),
// couleur du service si le nom correspond, sinon gris foncé neutre pour les
// boîtes structurelles (Siège, Opérationnel, Cabinet).
function OrgNodeHeaderActions({ node, canEdit, renaming, setRenaming, label, setLabel, hasContent, barColor, onRenameNode, onDeleteNode }) {
  return (
    <>
      <div className="px-3 py-2" style={{ background: barColor }}>
        {renaming ? (
          <input autoFocus value={label} onChange={e => setLabel(e.target.value)} className="text-xs bg-white/90 rounded px-1.5 py-1 w-full focus:outline-none" />
        ) : (
          <span className="text-sm font-semibold text-white">{node.label}</span>
        )}
      </div>
      {canEdit && (
        <div className="flex items-center justify-end gap-2 px-3 pt-2 -mb-1">
          {renaming ? (
            <button onClick={() => { onRenameNode(node.id, label); setRenaming(false); }} className="text-blue-600 text-[11px] font-medium">Valider</button>
          ) : (
            <button onClick={() => setRenaming(true)} className="text-slate-400 hover:text-slate-600"><Pencil size={12} /></button>
          )}
          <ConfirmButton onConfirm={() => onDeleteNode(node.id)} icon={Trash2} confirmLabel={hasContent ? 'Supprimera aussi son contenu.' : 'Supprimer cette boîte ?'} label="" />
        </div>
      )}
    </>
  );
}

function OrgNodeBox({ node, allNodes, assignments, members, externalContacts, canEdit, onAddNode, onRenameNode, onDeleteNode, onAddPerson, onUpdateAssignment, onRemoveAssignment }) {
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(node.label);
  const [addingPerson, setAddingPerson] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [childLabel, setChildLabel] = useState('');
  const [addingSibling, setAddingSibling] = useState(false);
  const [siblingLabel, setSiblingLabel] = useState('');
  const children = allNodes.filter(n => n.parentId === node.id).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const manualPeople = assignments.filter(a => a.nodeId === node.id);
  // Boîte de service (IRM/Scanner/Radio) : les collaborateurs affectés à ce
  // service dans leur fiche y apparaissent automatiquement (hors fonction
  // "Manager", qui va dans la boîte Manager) — seuls les contacts externes
  // s'ajoutent manuellement. La boîte "Manager" fait pareil avec la fonction.
  const matchedService = orgNodeMatchedService(node.label);
  const isManagerBox = node.label === 'Manager';
  const manualMemberIds = new Set(manualPeople.filter(a => a.personType === 'member').map(a => a.personId));
  let autoPeople = [];
  if (matchedService) {
    autoPeople = members.filter(m => (m.services || []).includes(matchedService) && m.role !== 'Manager' && !manualMemberIds.has(m.id))
      .map(m => ({ id: null, nodeId: node.id, personType: 'member', personId: m.id, roleLabel: '' }));
  } else if (isManagerBox) {
    autoPeople = members.filter(m => m.role === 'Manager' && !manualMemberIds.has(m.id))
      .map(m => ({ id: null, nodeId: node.id, personType: 'member', personId: m.id, roleLabel: '' }));
  }
  const people = [...manualPeople, ...autoPeople];
  const personOf = (a) => a.personType === 'member' ? members.find(m => m.id === a.personId) : externalContacts.find(c => c.id === a.personId);
  // Plusieurs enfants (ex. Cabinet → IRM/Scanner/Radio) : ils sont dessinés
  // comme des colonnes à l'intérieur d'une seule grande boîte, plutôt que
  // reliés par un trait en dessous.
  const fanOut = children.length > 1;
  const color = orgNodeServiceColor(node.label);
  const barColor = color || '#1E293B';
  // Le fond de couleur ne marque que les boîtes structurelles (Cabinet,
  // Siège) — les boîtes de service restent blanches, seules les personnes
  // dedans portent la couleur (voir OrgPeopleList tint).
  const bodyBg = matchedService ? '#fff' : (color ? `${color}33` : '#F8FAFC');

  const onlyExternal = !!matchedService || isManagerBox;
  const addPersonBlock = canEdit && (
    addingPerson ? (
      <OrgAddPersonForm members={members} externalContacts={externalContacts} onlyExternal={onlyExternal}
        onAdd={(type, id) => { onAddPerson(node.id, type, id); setAddingPerson(false); }}
        onCancel={() => setAddingPerson(false)} />
    ) : (
      <button onClick={() => setAddingPerson(true)} className="text-[11px] text-blue-600 hover:underline mt-1.5">
        + Ajouter{onlyExternal ? ' un externe' : ''}
      </button>
    )
  );
  const addChildBlock = canEdit && (
    addingChild ? (
      <div className="flex items-center gap-1 mt-1.5">
        <input autoFocus value={childLabel} onChange={e => setChildLabel(e.target.value)} placeholder="Nom de la boîte" className="text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none" />
        <button disabled={!childLabel.trim()} onClick={() => { onAddNode(node.id, childLabel.trim()); setChildLabel(''); setAddingChild(false); }} className="text-blue-600 disabled:opacity-30"><Check size={14} /></button>
        <button onClick={() => setAddingChild(false)} className="text-slate-400"><X size={14} /></button>
      </div>
    ) : (
      <button onClick={() => setAddingChild(true)} className="text-[11px] text-slate-400 hover:text-slate-600 mt-1.5">+ Sous-boîte</button>
    )
  );
  // Boîte latérale : un nouveau frère du même niveau (même parent) que
  // cette boîte, plutôt qu'un enfant dedans.
  const addSiblingBlock = canEdit && (
    addingSibling ? (
      <div className="flex items-center gap-1 mt-1.5">
        <input autoFocus value={siblingLabel} onChange={e => setSiblingLabel(e.target.value)} placeholder="Nom de la boîte" className="text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none" />
        <button disabled={!siblingLabel.trim()} onClick={() => { onAddNode(node.parentId || '', siblingLabel.trim()); setSiblingLabel(''); setAddingSibling(false); }} className="text-blue-600 disabled:opacity-30"><Check size={14} /></button>
        <button onClick={() => setAddingSibling(false)} className="text-slate-400"><X size={14} /></button>
      </div>
    ) : (
      <button onClick={() => setAddingSibling(true)} className="text-[11px] text-slate-400 hover:text-slate-600 mt-1.5">+ Boîte à côté</button>
    )
  );

  // Seul Cabinet englobe vraiment ses enfants dans une grande boîte
  // colorée (IRM/Scanner/Radio à l'intérieur). Toute autre boîte à
  // plusieurs enfants (Opérationnel avec Cabinet + des sociétés tierces,
  // par ex.) reste compacte comme Siège, avec juste une ligne vers ses
  // enfants rangés en dessous.
  const encloseChildren = fanOut && node.label === 'Cabinet';

  if (encloseChildren) {
    const sideBySide = children.filter(c => orgNodeMatchedService(c.label));
    const rest = children.filter(c => !orgNodeMatchedService(c.label));
    const compound = rest.filter(c => allNodes.some(n => n.parentId === c.id));
    const simple = rest.filter(c => !allNodes.some(n => n.parentId === c.id));
    const childProps = { allNodes, assignments, members, externalContacts, canEdit, onAddNode, onRenameNode, onDeleteNode, onAddPerson, onUpdateAssignment, onRemoveAssignment };
    return (
      <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${barColor}` }}>
        <OrgNodeHeaderActions node={node} canEdit={canEdit} renaming={renaming} setRenaming={setRenaming} label={label} setLabel={setLabel}
          hasContent={children.length > 0} barColor={barColor} onRenameNode={onRenameNode} onDeleteNode={onDeleteNode} />
        <div className="p-3 flex flex-col gap-3" style={{ background: `${barColor}26` }}>
          {(compound.length > 0 || simple.length > 0) && (
            <div className="flex items-start gap-4">
              {compound.map(child => <OrgNodeBox key={child.id} node={child} {...childProps} />)}
              {simple.length > 0 && (
                <div className="flex flex-col gap-3">
                  {simple.map(child => <OrgNodeBox key={child.id} node={child} {...childProps} />)}
                </div>
              )}
            </div>
          )}
          {sideBySide.length > 0 && (
            <div className="flex items-start gap-4">
              {sideBySide.map(child => <OrgNodeBox key={child.id} node={child} {...childProps} />)}
            </div>
          )}
          <div className="flex items-center gap-3">{addChildBlock}{addSiblingBlock}</div>
        </div>
      </div>
    );
  }

  // Boîte compacte (Siège, Opérationnel, Manager, IRM/Scanner/Radio,
  // sociétés tierces...) : ses propres personnes (si c'est une boîte
  // "feuille"), puis une ligne vers ses enfants rangés en dessous — les
  // boîtes qui ont elles-mêmes des enfants (ex. Cabinet) sur leur propre
  // ligne, les boîtes simples (ex. plusieurs sociétés) empilées entre
  // elles à côté, pour limiter la hauteur totale.
  const compoundChildren = children.filter(c => allNodes.some(n => n.parentId === c.id));
  const simpleChildren = children.filter(c => !allNodes.some(n => n.parentId === c.id));
  const childProps = { allNodes, assignments, members, externalContacts, canEdit, onAddNode, onRenameNode, onDeleteNode, onAddPerson, onUpdateAssignment, onRemoveAssignment };
  return (
    <div className="flex flex-col items-center">
      <div className={`rounded-xl overflow-hidden ${matchedService ? 'min-w-[220px]' : 'min-w-[190px]'}`} style={{ border: `2px solid ${barColor}` }}>
        <OrgNodeHeaderActions node={node} canEdit={canEdit} renaming={renaming} setRenaming={setRenaming} label={label} setLabel={setLabel}
          hasContent={children.length > 0 || people.length > 0} barColor={barColor} onRenameNode={onRenameNode} onDeleteNode={onDeleteNode} />
        <div className="p-3" style={{ background: bodyBg }}>
          <OrgPeopleList list={people} personOf={personOf} canEdit={canEdit} allNodes={allNodes} onUpdateAssignment={onUpdateAssignment} onRemoveAssignment={onRemoveAssignment} onAddPerson={onAddPerson}
            grouped={children.length === 0 && !isManagerBox} tint={matchedService ? color : null} horizontal={isManagerBox} />
          {addPersonBlock}
        </div>
      </div>
      <div className="flex items-center gap-3">{addChildBlock}{addSiblingBlock}</div>
      {children.length > 0 && (
        <>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-start gap-4">
            {compoundChildren.map(child => <OrgNodeBox key={child.id} node={child} {...childProps} />)}
            {simpleChildren.length > 0 && (
              <div className="flex flex-col gap-3">
                {simpleChildren.map(child => <OrgNodeBox key={child.id} node={child} {...childProps} />)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function OrgChartView({ nodes, assignments, members, externalContacts, perm, onAddNode, onRenameNode, onDeleteNode, onAddPerson, onUpdateAssignment, onRemoveAssignment }) {
  const roots = nodes.filter(n => !n.parentId).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  if (roots.length === 0) {
    return <EmptyState icon={Network} title="Organigramme vide" subtitle="Il sera généré automatiquement à la prochaine connexion d'un administrateur." />;
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 overflow-x-auto">
      <div className="flex flex-col items-center min-w-fit mx-auto w-fit">
        {roots.map(root => (
          <OrgNodeBox key={root.id} node={root} allNodes={nodes} assignments={assignments} members={members} externalContacts={externalContacts} canEdit={perm.isManager}
            onAddNode={onAddNode} onRenameNode={onRenameNode} onDeleteNode={onDeleteNode} onAddPerson={onAddPerson} onUpdateAssignment={onUpdateAssignment} onRemoveAssignment={onRemoveAssignment} />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Commentaires & suggestions                                            */
/* ---------------------------------------------------------------------- */

function FeedbackView({ currentMember, onSend }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    const ok = await onSend(message.trim());
    setSending(false);
    if (ok) { setSent(true); setMessage(''); } else {
      showToast("Le message n'a pas pu être envoyé (problème de connexion). Réessayez dans un instant.");
    }
  };

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <div className="text-sm font-semibold text-slate-700 mb-1">Une idée, un bug, une suggestion ?</div>
        <div className="text-xs text-slate-400 mb-3.5">Votre message part par email au(x) manager(s) de l'application, avec votre nom.</div>
        <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-300" rows={6}
          placeholder="Décrivez votre idée ou le problème rencontré…" value={message} onChange={e => setMessage(e.target.value)} />
        <div className="flex items-center justify-between mt-3.5">
          {sent ? <span className="text-xs text-emerald-600 font-medium flex items-center gap-1.5"><Check size={14} /> Message envoyé, merci !</span> : <span />}
          <button disabled={!message.trim() || sending} onClick={handleSend}
            className="bg-teal-600 disabled:opacity-40 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-1.5">
            <Send size={14} /> {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Navigation par rôle                                                   */
/* ---------------------------------------------------------------------- */

function navFor(perm) {
  const nav = [];
  if (perm.isManager) nav.push({ id: 'dashboard', label: "Vue d'ensemble", Icon: LayoutDashboard, accent: '#60A5FA' });
  nav.push({ id: 'tasks', label: perm.isManager ? 'Tâches et projets' : 'Mes tâches et projets', Icon: ListChecks, accent: '#818CF8' });
  nav.push({ id: 'planning', label: 'Planning', Icon: CalendarDays, accent: '#38BDF8' });
  nav.push({ id: 'transmissions', label: 'Transmissions', Icon: MessageCircle, accent: '#0EA5E9' });
  if (perm.isReferent) {
    nav.push({ id: 'gantt', label: 'Durée des projets', Icon: GanttChartSquare, accent: '#A78BFA' });
  }
  if (perm.isManager) {
    nav.push({ id: 'priorisation', label: 'Priorisation', Icon: Target, accent: '#FB923C' });
    nav.push({ id: 'team', label: 'Équipe', Icon: Users, accent: '#F472B6' });
    nav.push({ id: 'contacts', label: 'Contacts externes', Icon: Building2, accent: '#C084FC' });
  }
  nav.push({ id: 'orgchart', label: 'Organigramme', Icon: Network, accent: '#F59E0B' });
  nav.push({ id: 'feedback', label: 'Commentaires & suggestions', Icon: MessageSquare, accent: '#14B8A6' });
  return nav;
}

/* ---------------------------------------------------------------------- */
/*  App principale (après authentification)                              */
/* ---------------------------------------------------------------------- */

function ReferentApp({ session, onSignOut }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notRecognized, setNotRecognized] = useState(false);
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [externalContacts, setExternalContacts] = useState([]);
  const [taskRequests, setTaskRequests] = useState([]);
  const [orgNodes, setOrgNodes] = useState([]);
  const [orgAssignments, setOrgAssignments] = useState([]);
  const [transmissions, setTransmissions] = useState([]);
  const [view, setView] = useState('tasks');
  const [connectedAs, setConnectedAs] = useState('');
  const [taskModal, setTaskModal] = useState(null);
  const [memberModal, setMemberModal] = useState(null);
  const [projectModal, setProjectModal] = useState(null);
  const [apptModal, setApptModal] = useState(null);
  const [contactModal, setContactModal] = useState(null);
  const [requestModal, setRequestModal] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [hoveredNav, setHoveredNav] = useState('');
  const [transmissionsLastSeen, setTransmissionsLastSeen] = useState('');
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      const id = uid();
      setToasts(prev => [...prev, { id, ...e.detail }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
    };
    window.addEventListener('app-toast', handler);
    return () => window.removeEventListener('app-toast', handler);
  }, []);

  const myEmail = (session?.user?.email || '').toLowerCase();

  useEffect(() => {
    (async () => {
      const data = await loadAll();
      if (Object.values(data).some(r => r.error)) { setLoadError(true); setLoading(false); return; }
      const m = data.members.items, p = data.projects.items, t = data.tasks.items, a = data.appointments.items, ec = data.externalContacts.items, tr = data.taskRequests.items;
      let on = data.orgNodes.items, oa = data.orgAssignments.items;
      setMembers(m); setProjects(p); setTasks(t); setAppointments(a); setExternalContacts(ec); setTaskRequests(tr);
      setTransmissions(data.transmissions.items);
      const matched = m.find(x => (x.email || '').toLowerCase() === myEmail);
      // Squelette par défaut de l'organigramme, créé une seule fois par un
      // administrateur si la table est encore vide.
      if (on.length === 0 && matched?.accessLevel === 'manager') {
        const siege = uid(), operationnel = uid(), cabinet = uid();
        on = [
          { id: siege, parentId: '', label: 'Siège SIMAGO', sortOrder: 0 },
          { id: operationnel, parentId: siege, label: 'Opérationnel', sortOrder: 0 },
          { id: cabinet, parentId: operationnel, label: 'Cabinet', sortOrder: 0 },
          { id: uid(), parentId: cabinet, label: 'Manager', sortOrder: 0 },
          { id: uid(), parentId: cabinet, label: 'IRM', sortOrder: 1 },
          { id: uid(), parentId: cabinet, label: 'Scanner', sortOrder: 2 },
          { id: uid(), parentId: cabinet, label: 'Radio / Sénologie', sortOrder: 3 },
        ];
        insertRows('orgNodes', on);
      } else if (matched?.accessLevel === 'manager') {
        // Migration : sur un organigramme déjà créé, la boîte des managers
        // n'existait pas encore, ou existait sous l'ancien nom "Encadrement"
        // — on la crée/renomme une fois, et on y déplace les personnes
        // posées directement sur Cabinet (ancien comportement).
        const cabinetNode = on.find(n => n.label === 'Cabinet');
        let managerNode = cabinetNode && on.find(n => n.parentId === cabinetNode.id && n.label === 'Manager');
        const encadrementNode = cabinetNode && on.find(n => n.parentId === cabinetNode.id && n.label === 'Encadrement');
        if (cabinetNode && !managerNode && encadrementNode) {
          const renamed = { ...encadrementNode, label: 'Manager' };
          on = on.map(n => n.id === encadrementNode.id ? renamed : n);
          upsertRows('orgNodes', [renamed]);
          managerNode = renamed;
        } else if (cabinetNode && !managerNode) {
          const managerId = uid();
          const newManagerNode = { id: managerId, parentId: cabinetNode.id, label: 'Manager', sortOrder: -1 };
          on = [...on, newManagerNode];
          insertRows('orgNodes', [newManagerNode]);
          managerNode = newManagerNode;
        }
        // Nettoyage : des personnes posées directement sur Cabinet (boîte qui
        // n'affiche plus ses propres personnes depuis qu'elle englobe des
        // enfants) sont déplacées dans Manager, où qu'elles doivent être vues.
        const directOnCabinet = cabinetNode ? oa.filter(a => a.nodeId === cabinetNode.id) : [];
        if (managerNode && directOnCabinet.length) {
          const moved = directOnCabinet.map(a => ({ ...a, nodeId: managerNode.id }));
          oa = oa.map(a => moved.find(mv => mv.id === a.id) || a);
          upsertRows('orgAssignments', moved);
        }
      }
      setOrgNodes(on); setOrgAssignments(oa);
      if (matched) {
        setConnectedAs(matched.id);
        setView(matched.accessLevel === 'manager' ? 'dashboard' : 'tasks');
        setTransmissionsLastSeen(localStorage.getItem(`transmissions_last_seen_${matched.id}`) || '');
      } else { setNotRecognized(true); }
      setLoading(false);
    })();
  }, []);

  // Petit badge sur l'onglet Transmissions : nombre de messages postés par
  // d'autres depuis la dernière visite de cet onglet (mémorisé localement).
  // La remise à zéro se fait en QUITTANT l'onglet, pas en y entrant : sinon
  // le chiffre par canal (dans TransmissionsView) retombe à zéro avant même
  // que la personne ait pu voir quel canal était concerné.
  useEffect(() => {
    if (view !== 'transmissions' || !connectedAs) return;
    return () => {
      const now = new Date().toISOString();
      localStorage.setItem(`transmissions_last_seen_${connectedAs}`, now);
      setTransmissionsLastSeen(now);
    };
  }, [view, connectedAs]);
  const unreadTransmissions = transmissions.filter(t => t.authorId !== connectedAs && (!transmissionsLastSeen || t.createdAt > transmissionsLastSeen)).length;

  // Une tâche "Programmée" passe seule à "En cours" dès que sa date de
  // début est atteinte — pas besoin d'y repenser pour la démarrer.
  useEffect(() => {
    if (loading) return;
    const today = todayISO();
    const due = tasks.filter(t => t.status === 'a_faire' && t.startDate && t.startDate <= today);
    if (due.length === 0) return;
    const updated = due.map(t => ({ ...t, status: 'en_cours' }));
    setTasks(prev => prev.map(t => updated.find(u => u.id === t.id) || t));
    upsertRows('tasks', updated);
  }, [loading, tasks]);

  const currentMember = members.find(m => m.id === connectedAs);
  const perm = permissionsFor(currentMember?.accessLevel || 'utilisateur');
  const nav = navFor(perm).map(n => n.id === 'transmissions' ? { ...n, badge: unreadTransmissions } : n);

  // Portée équipe : un non-manager ne voit que les projets dont il est membre déclaré,
  // et — pour les tâches sans projet — celles qui lui sont personnellement assignées.
  const myTeamProjectIds = perm.isManager ? null : myProjectIds(connectedAs, projects);
  const scopedProjects = perm.isManager ? projects : projects.filter(p => myTeamProjectIds.has(p.id));
  const scopedTasks = perm.isManager ? tasks : tasks.filter(t => t.projectId ? myTeamProjectIds.has(t.projectId) : isTaskOfMine(t, connectedAs));

  // Invitation Supabase (email + mot de passe) déclenchée dès qu'un manager
  // saisit/modifie l'email d'un collaborateur — plus besoin de le refaire à
  // la main dans le dashboard Supabase.
  const inviteMemberByEmail = async (email) => {
    try {
      const res = await fetch('/api/invite-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(`L'invitation par email n'a pas pu être envoyée à ${email} (${data.error || 'erreur inconnue'}). Vous pouvez inviter la personne manuellement depuis Supabase (Authentication → Users → Invite user).`);
      }
    } catch {
      showToast(`L'invitation par email n'a pas pu être envoyée à ${email} (problème de connexion). Vous pouvez inviter la personne manuellement depuis Supabase.`);
    }
  };

  // Notifications applicatives (affectation à un projet, projet mis à jour,
  // tâche assignée...) — best-effort, ne bloque jamais la sauvegarde.
  // Les notifications ne partent plus une par une : elles sont mises en
  // file d'attente (table notification_queue) et regroupées en un seul
  // email par destinataire, envoyé une fois par jour (cron, voir
  // api/cron-daily.js) — pour ne pas polluer les boîtes mail à chaque
  // affectation/rotation.
  const notifyByEmail = async (to, subject, html) => {
    const recipients = (to || []).filter(Boolean);
    if (!recipients.length) return true;
    const rows = recipients.map(email => ({ id: uid(), recipient_email: email, subject, html }));
    const { error } = await supabase.from('notification_queue').insert(rows);
    if (error) { console.error('Notification en attente non enregistrée', error); return false; }
    return true;
  };

  const sendFeedback = async (message) => {
    const managerEmails = members.filter(m => m.accessLevel === 'manager' && m.email).map(m => m.email);
    if (!managerEmails.length) return false;
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          to: managerEmails,
          subject: `Suggestion de ${currentMember?.name || myEmail}`,
          html: `<p><strong>${escapeHtml(currentMember?.name || myEmail)}</strong> (${escapeHtml(myEmail)}) a laissé un commentaire :</p><p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>`,
        }),
      });
      return res.ok;
    } catch { return false; }
  };

  // Transmissions : un canal par service × métier (Secrétaires/Manipulateurs
  // Radio/Scanner/IRM). Chaque nouveau message notifie par email les membres
  // de ce canal (regroupé dans le digest quotidien, comme les autres notifs).
  const postTransmission = async (service, functionGroup, message) => {
    const t = { id: uid(), service, functionGroup, authorId: connectedAs, message, createdAt: new Date().toISOString() };
    setTransmissions(prev => [...prev, t]);
    warnIfFailed(await upsertRow('transmissions', t), 'Le message');
    // Les managers reçoivent systématiquement le mail, en plus des membres du
    // canal concerné, pour pouvoir surveiller les transmissions même s'ils ne
    // font partie d'aucun service/métier qui matche ce canal.
    const channelMembers = members.filter(m => m.id !== connectedAs && (m.services || []).includes(service) &&
      (m.role === functionGroup || (functionGroup === 'Manipulateur' && m.role === 'Aide manipulateur')) && m.email);
    const managerMembers = members.filter(m => m.id !== connectedAs && m.accessLevel === 'manager' && m.email);
    const recipients = [...new Set([...channelMembers, ...managerMembers].map(m => m.email))];
    if (recipients.length) {
      const channelLabel = `${functionGroup === 'Secrétaire' ? 'Secrétaires' : 'Manipulateurs'} ${service}`;
      const queued = await notifyByEmail(recipients, `Nouvelle transmission — ${channelLabel}`,
        `<p><strong>${escapeHtml(currentMember?.name || 'Quelqu\'un')}</strong> a laissé un message dans la transmission <strong>${escapeHtml(channelLabel)}</strong> :</p><p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>`);
      warnIfFailed(queued, "La notification par email de ce message");
    }
  };

  // Organigramme : boîtes hiérarchiques (org_nodes) + personnes placées
  // dedans (org_assignments), séparées des fiches collaborateurs — modifier
  // le rôle affiché ici ne touche jamais à la fonction/fiche de la personne.
  const orgDescendantIds = (nodeId) => {
    const direct = orgNodes.filter(n => n.parentId === nodeId).map(n => n.id);
    return direct.concat(...direct.map(orgDescendantIds));
  };
  const addOrgNode = async (parentId, label) => {
    const node = { id: uid(), parentId, label, sortOrder: orgNodes.filter(n => n.parentId === parentId).length };
    setOrgNodes(prev => [...prev, node]);
    warnIfFailed(await upsertRow('orgNodes', node), "La boîte de l'organigramme");
  };
  const renameOrgNode = async (nodeId, label) => {
    const updated = { ...orgNodes.find(n => n.id === nodeId), label };
    setOrgNodes(prev => prev.map(n => n.id === nodeId ? updated : n));
    warnIfFailed(await upsertRow('orgNodes', updated), "Le nom de la boîte");
  };
  const deleteOrgNode = async (nodeId) => {
    const ids = new Set([nodeId, ...orgDescendantIds(nodeId)]);
    setOrgNodes(prev => prev.filter(n => !ids.has(n.id)));
    setOrgAssignments(prev => prev.filter(a => !ids.has(a.nodeId)));
    warnIfFailed(await deleteRow('orgNodes', nodeId), 'La suppression de la boîte');
  };
  const addOrgPerson = async (nodeId, personType, personId, roleLabel = '') => {
    const assignment = { id: uid(), nodeId, personType, personId, roleLabel, sortOrder: orgAssignments.filter(a => a.nodeId === nodeId).length };
    setOrgAssignments(prev => [...prev, assignment]);
    warnIfFailed(await upsertRow('orgAssignments', assignment), "L'ajout dans l'organigramme");
  };
  const updateOrgAssignment = async (assignmentId, patch) => {
    const updated = { ...orgAssignments.find(a => a.id === assignmentId), ...patch };
    setOrgAssignments(prev => prev.map(a => a.id === assignmentId ? updated : a));
    warnIfFailed(await upsertRow('orgAssignments', updated), "La mise à jour de l'organigramme");
  };
  const removeOrgAssignment = async (assignmentId) => {
    setOrgAssignments(prev => prev.filter(a => a.id !== assignmentId));
    warnIfFailed(await deleteRow('orgAssignments', assignmentId), "Le retrait de l'organigramme");
  };

  const notifyNewProjectTeam = (project) => {
    (project.teamIds || []).filter(id => id !== connectedAs).forEach(id => {
      const m = members.find(x => x.id === id);
      if (m?.email) notifyByEmail([m.email], `Vous avez été affecté(e) au projet « ${project.name} »`,
        `<p>Bonjour ${escapeHtml(m.name)},</p><p>Vous avez été affecté(e) au projet <strong>${escapeHtml(project.name)}</strong>.</p>${project.description ? `<p>${escapeHtml(project.description)}</p>` : ''}`);
    });
    (project.responsibleIds || []).filter(id => id !== connectedAs).forEach(id => {
      const rm = members.find(x => x.id === id);
      if (rm?.email) notifyByEmail([rm.email], `Vous êtes responsable du projet « ${project.name} »`,
        `<p>Bonjour ${escapeHtml(rm.name)},</p><p>Vous êtes responsable du projet <strong>${escapeHtml(project.name)}</strong>.</p>`);
    });
    if (project.pendingApproval) {
      const managerEmails = members.filter(m => m.accessLevel === 'manager' && m.email).map(m => m.email);
      const creator = members.find(m => m.id === project.createdBy);
      if (managerEmails.length) notifyByEmail(managerEmails, `Projet en attente de validation : ${project.name}`,
        `<p>${escapeHtml(creator?.name || 'Un utilisateur')} a créé le projet <strong>${escapeHtml(project.name)}</strong>, qui attend votre validation.</p>`);
    }
  };

  const notifyProjectChanges = (prev, next) => {
    const prevTeam = prev.teamIds || [];
    const nextTeam = next.teamIds || [];
    const added = nextTeam.filter(id => !prevTeam.includes(id) && id !== connectedAs);
    const removed = prevTeam.filter(id => !nextTeam.includes(id) && id !== connectedAs);
    added.forEach(id => {
      const m = members.find(x => x.id === id);
      if (m?.email) notifyByEmail([m.email], `Vous avez été affecté(e) au projet « ${next.name} »`,
        `<p>Bonjour ${escapeHtml(m.name)},</p><p>Vous avez été affecté(e) au projet <strong>${escapeHtml(next.name)}</strong>.</p>${next.description ? `<p>${escapeHtml(next.description)}</p>` : ''}`);
    });
    removed.forEach(id => {
      const m = members.find(x => x.id === id);
      if (m?.email) notifyByEmail([m.email], `Vous avez été retiré(e) du projet « ${next.name} »`,
        `<p>Bonjour ${escapeHtml(m.name)},</p><p>Vous n'êtes plus affecté(e) au projet <strong>${escapeHtml(next.name)}</strong>.</p>`);
    });
    const prevResponsibles = prev.responsibleIds || [];
    const nextResponsibles = next.responsibleIds || [];
    nextResponsibles.filter(id => !prevResponsibles.includes(id) && id !== connectedAs).forEach(id => {
      const rm = members.find(x => x.id === id);
      if (rm?.email) notifyByEmail([rm.email], `Vous êtes responsable du projet « ${next.name} »`,
        `<p>Bonjour ${escapeHtml(rm.name)},</p><p>Vous êtes désormais responsable du projet <strong>${escapeHtml(next.name)}</strong>.</p>`);
    });
    if (prev.pendingApproval && !next.pendingApproval) {
      const creator = members.find(m => m.id === next.createdBy);
      if (creator?.email && creator.id !== connectedAs) notifyByEmail([creator.email], `Projet validé : ${next.name}`,
        `<p>Bonjour ${escapeHtml(creator.name)},</p><p>Votre projet <strong>${escapeHtml(next.name)}</strong> a été validé par un administrateur.</p>`);
    }
    // Volontairement pas de notification sur les simples changements de dates/statut
    // du projet : pour ne pas surcharger les emails, on ne notifie que
    // l'implication dans un nouveau projet ou un changement de rôle.
  };

  // Notifie qui est nouvellement "responsable" d'une tâche : nouvel assigné
  // individuel, nouvel ajout au pool, ou nouvelle personne au rôle "R" (RACI)
  // — y compris quand ce changement vient d'un tirage par rotation.
  const notifyTaskAssignment = (existing, t) => {
    const project = projects.find(p => p.id === t.projectId);
    const prevR = Object.entries(existing?.raci || {}).filter(([, r]) => r === 'R').map(([id]) => id);
    const nextR = Object.entries(t.raci || {}).filter(([, r]) => r === 'R').map(([id]) => id);
    const prevAssignees = new Set([existing?.assigneeId, ...(existing?.pool || []), ...prevR].filter(Boolean));
    const nextAssignees = new Set([t.assigneeId, ...(t.pool || []), ...nextR].filter(Boolean));
    const newlyAssigned = [...nextAssignees].filter(id => !prevAssignees.has(id) && id !== connectedAs);
    newlyAssigned.forEach(id => {
      const m = members.find(x => x.id === id);
      if (m?.email) notifyByEmail([m.email], `Nouvelle tâche assignée : ${t.title}`,
        `<p>Bonjour ${escapeHtml(m.name)},</p><p>La tâche <strong>${escapeHtml(t.title)}</strong>${project ? ` (projet ${escapeHtml(project.name)})` : ''} vous a été assignée.</p>${t.deadline ? `<p>Échéance : ${fmtDateLong(t.deadline)}</p>` : ''}`);
    });
  };

  // Tirage aléatoire "sac tournant" : chaque membre de l'équipe du projet
  // passe une fois avant qu'un nom puisse ressortir une deuxième fois.
  // rotationPool = les personnes qui n'ont pas encore été tirées dans le
  // cycle en cours ; vide → on démarre un nouveau cycle (nouveau tirage).
  const nextRotatedAssignee = (t, teamOverride, targetDate, loadFn) => {
    const rawTeam = teamOverride || projects.find(p => p.id === t.projectId)?.teamIds || [];
    // Certaines personnes (toujours approbatrices, ou fonction "Manager") ne
    // doivent jamais être tirées au sort comme responsable, même en
    // rotation aléatoire.
    const team = rawTeam.filter(id => {
      const m = members.find(x => x.id === id);
      return !(m?.alwaysApprover || m?.role === 'Manager');
    });
    if (team.length === 0) return { assigneeId: t.assigneeId, rotationPool: [] };
    let pool = (t.rotationPool || []).filter(id => team.includes(id));
    if (pool.length === 0) {
      pool = shuffleArray(team);
      if (pool.length > 1 && pool[0] === t.assigneeId) [pool[0], pool[1]] = [pool[1], pool[0]];
    }
    // Répartition de charge : parmi les personnes dont c'est le tour dans le
    // cycle courant — même juste après une remise à zéro complète du sac
    // tournant, ce choix s'applique toujours —, on privilégie celle qui a le
    // moins de charge sur la période concernée (tâches de la semaine par
    // défaut, ou un autre critère via loadFn, ex. projets qui se chevauchent
    // pour la rotation du responsable de projet), pour éviter qu'une
    // personne cumule pendant qu'une autre n'a rien — sans casser l'équité
    // du sac tournant (le choix reste parmi les personnes dont c'est le tour).
    let pickIdx = 0;
    if (targetDate && pool.length > 1) {
      const load = loadFn || ((id) => {
        const weekStart = startOfWeekISO(targetDate);
        const weekEnd = addDays(weekStart, 6);
        return tasks.filter(x => x.assigneeId === id && x.status !== 'termine' && x.deadline >= weekStart && x.deadline <= weekEnd).length;
      });
      // La répartition de charge ne doit jamais reproposer la même personne
      // qu'avant (déjà écartée de la position 0 par l'échange anti-répétition
      // ci-dessus) : on l'exclut du choix par charge, sauf si elle est
      // vraiment la seule option restante dans le sac.
      const candidateIdx = pool.map((_, i) => i).filter(i => pool[i] !== t.assigneeId);
      const searchIn = candidateIdx.length > 0 ? candidateIdx : pool.map((_, i) => i);
      let bestLoad = Infinity;
      searchIn.forEach(i => { const l = load(pool[i]); if (l < bestLoad) { bestLoad = l; pickIdx = i; } });
    }
    const assigneeId = pool[pickIdx];
    const rest = [...pool.slice(0, pickIdx), ...pool.slice(pickIdx + 1)];
    return { assigneeId, rotationPool: rest };
  };

  // Même principe que nextRotatedAssignee (sac tournant, priorité à la
  // charge la plus faible), mais désigne plusieurs responsables à la fois
  // pour un même cycle — utilisé quand un projet a besoin de N responsables
  // tournants plutôt qu'un seul. Personne n'est repris avant que tout le
  // monde soit passé ; si le sac se vide en cours de tirage, on repart sur
  // les personnes pas encore prises CE tour-ci (et seulement si vraiment
  // tout le monde a déjà été pris cette fois, on autorise un doublon —
  // n'arrive que si le nombre demandé dépasse la taille de l'équipe).
  const nextRotatedAssignees = (prevIds, prevPool, count, teamOverride, targetDate, loadFn) => {
    const team = (teamOverride || []).filter(id => {
      const m = members.find(x => x.id === id);
      return !(m?.alwaysApprover || m?.role === 'Manager');
    });
    if (team.length === 0) return { assigneeIds: [], rotationPool: [] };
    const n = Math.max(1, Math.min(count, team.length));
    let pool = (prevPool || []).filter(id => team.includes(id));
    const picked = [];
    while (picked.length < n) {
      if (pool.length === 0) pool = shuffleArray(team.filter(id => !picked.includes(id)));
      if (pool.length === 0) pool = shuffleArray(team);
      const candidates = pool.filter(id => !picked.includes(id));
      if (candidates.length === 0) { pool = []; continue; }
      let pickIdx = 0;
      if (targetDate && candidates.length > 1 && loadFn) {
        let bestLoad = Infinity;
        candidates.forEach((id, i) => { const l = loadFn(id); if (l < bestLoad) { bestLoad = l; pickIdx = i; } });
      }
      const id = candidates[pickIdx];
      picked.push(id);
      pool = pool.filter(x => x !== id);
    }
    return { assigneeIds: picked, rotationPool: pool };
  };

  // Même principe que nextRotatedAssignee, mais pour le mode Équipe (RACI) :
  // le rôle "R" (Responsable) tourne, les autres rôles (A/C/I) restent tels quels.
  const rotateRaciResponsible = (t, teamOverride, targetDate) => {
    const currentR = Object.entries(t.raci || {}).find(([, r]) => r === 'R')?.[0] || '';
    const { assigneeId, rotationPool } = nextRotatedAssignee({ ...t, assigneeId: currentR }, teamOverride, targetDate);
    const raci = { ...(t.raci || {}) };
    Object.keys(raci).forEach(id => { if (raci[id] === 'R') delete raci[id]; });
    if (assigneeId) raci[assigneeId] = 'R';
    return { raci, rotationPool };
  };

  const saveTask = async (t) => {
    const existing = tasks.find(x => x.id === t.id);
    const justCompleted = existing && existing.status !== 'termine' && t.status === 'termine';
    setTasks(prev => existing ? prev.map(x => x.id === t.id ? t : x) : [...prev, t]);
    warnIfFailed(await upsertRow('tasks', t), 'La tâche');
    notifyTaskAssignment(existing, t);
    const ownerProject = projects.find(p => p.id === t.projectId);
    // Si cette tâche termine la dernière encore ouverte du projet, le projet
    // passe automatiquement "Terminé" à son tour — ça déclenche au passage
    // sa propre répétition si elle en a une (voir saveProject). Le rappel du
    // dernier jour reste utile pour les projets sans tâches, ou dont toutes
    // les tâches ne se terminent jamais en même temps.
    if (justCompleted && ownerProject && ownerProject.status !== 'termine') {
      const projectTasks = tasks.filter(x => x.projectId === t.projectId);
      // `tasks` (l'état avant cette mise à jour) contient encore l'ancienne
      // version de la tâche qu'on vient de sauver — on la traite comme
      // terminée (elle l'est, justCompleted le garantit) plutôt que de se
      // fier à son statut pas encore rafraîchi dans ce tableau.
      if (projectTasks.length > 0 && projectTasks.every(x => x.id === t.id || x.status === 'termine')) {
        saveProject({ ...ownerProject, status: 'termine' });
      }
    }
    const projectOwnsRepeat = ownerProject?.repeatUnit && ownerProject.repeatUnit !== 'aucune';
    if (justCompleted && !projectOwnsRepeat && t.repeatUnit && t.repeatUnit !== 'aucune') {
      let nextStart = shiftByRepeat(t.startDate, t.repeatUnit, t.repeatEvery);
      let nextDeadline = shiftByRepeat(t.deadline, t.repeatUnit, t.repeatEvery);
      let guard = 0;
      while (isAvoidedDay(nextDeadline, t.avoidDays) && guard < 30) {
        nextStart = shiftByRepeat(nextStart, t.repeatUnit, t.repeatEvery);
        nextDeadline = shiftByRepeat(nextDeadline, t.repeatUnit, t.repeatEvery);
        guard++;
      }
      const clone = { ...t, id: uid(), status: 'a_faire', createdAt: todayISO(), startDate: nextStart, deadline: nextDeadline };
      if (t.rotateAssignee && t.assignMode === 'individuel') {
        const { assigneeId, rotationPool } = nextRotatedAssignee(t, undefined, nextDeadline);
        clone.assigneeId = assigneeId;
        clone.rotationPool = rotationPool;
      } else if (t.rotateAssignee && t.assignMode === 'equipe') {
        const { raci, rotationPool } = rotateRaciResponsible(t, undefined, nextDeadline);
        clone.raci = raci;
        clone.rotationPool = rotationPool;
      }
      setTasks(prev => [...prev, clone]);
      warnIfFailed(await upsertRow('tasks', clone), 'La prochaine occurrence');
      notifyTaskAssignment(t, clone);
    }
    setTaskModal(null);
  };
  const deleteTask = async (id) => {
    setTasks(prev => prev.filter(x => x.id !== id));
    warnIfFailed(await deleteRow('tasks', id), 'La suppression de la tâche');
    setTaskModal(null);
  };
  const claimTask = async (taskId) => {
    const updated = { ...tasks.find(t => t.id === taskId), assigneeId: connectedAs };
    if (updated.status === 'a_faire') updated.status = 'en_cours';
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t));
    warnIfFailed(await upsertRow('tasks', updated), 'La prise de la tâche');
    setTaskModal(null);
  };
  const duplicateTask = async (original) => {
    const clone = { ...original, id: uid(), title: `${original.title} (copie)`, status: 'a_faire', createdAt: todayISO() };
    setTasks(prev => [...prev, clone]);
    warnIfFailed(await upsertRow('tasks', clone), 'La copie de la tâche');
    setTaskModal({ task: clone });
  };

  const importMembers = (newMembers) => {
    setMembers(prev => [...prev, ...newMembers]);
    insertRows('members', newMembers);
  };

  const saveMember = async (m) => {
    const prevMember = members.find(x => x.id === m.id);
    const exists = !!prevMember;
    setMembers(prev => exists ? prev.map(x => x.id === m.id ? m : x) : [...prev, m]);
    warnIfFailed(await upsertRow('members', m), 'La fiche du collaborateur');
    const newEmail = (m.email || '').trim();
    const hadEmail = (prevMember?.email || '').trim();
    if (newEmail && newEmail.toLowerCase() !== hadEmail.toLowerCase()) inviteMemberByEmail(newEmail);
    setMemberModal(null);
  };
  const deleteMember = async (id) => {
    setMembers(prev => prev.filter(x => x.id !== id));
    warnIfFailed(await deleteRow('members', id), 'La suppression du collaborateur');

    const affectedTasks = tasks.filter(t => t.assigneeId === id || (t.pool || []).includes(id) || (t.raci && t.raci[id]));
    if (affectedTasks.length) {
      const updated = affectedTasks.map(t => ({
        ...t, assigneeId: t.assigneeId === id ? '' : t.assigneeId,
        pool: (t.pool || []).filter(p => p !== id),
        raci: Object.fromEntries(Object.entries(t.raci || {}).filter(([k]) => k !== id)),
      }));
      setTasks(prev => prev.map(t => updated.find(u => u.id === t.id) || t));
      upsertRows('tasks', updated);
    }
    const affectedAppts = appointments.filter(a => a.participants.includes(id));
    if (affectedAppts.length) {
      const updated = affectedAppts.map(a => ({ ...a, participants: a.participants.filter(p => p !== id) }));
      setAppointments(prev => prev.map(a => updated.find(u => u.id === a.id) || a));
      upsertRows('appointments', updated);
    }
    const affectedProjects = projects.filter(p => (p.teamIds || []).includes(id));
    if (affectedProjects.length) {
      const updated = affectedProjects.map(p => ({ ...p, teamIds: (p.teamIds || []).filter(x => x !== id) }));
      setProjects(prev => prev.map(p => updated.find(u => u.id === p.id) || p));
      upsertRows('projects', updated);
    }
    if (connectedAs === id) setConnectedAs(members.find(m => m.id !== id)?.id || '');
    setMemberModal(null);
  };

  const saveProject = async (projectObjInput, governanceTasks) => {
    const prevProject = projects.find(p => p.id === projectObjInput.id);
    const exists = !!prevProject;
    const justCompleted = exists && prevProject.status !== 'termine' && projectObjInput.status === 'termine';
    // Si les dates ou le statut changent, on réarme l'alerte de retard pour
    // qu'elle puisse se redéclencher si le projet redevient en retard plus tard.
    const datesOrStatusChanged = exists && (prevProject.endDate !== projectObjInput.endDate || prevProject.status !== projectObjInput.status);
    // Pareil pour le rappel de démarrage (veille du jour ouvré) si la date
    // de début change, et pour le rappel de fin (jour même) si la date de
    // fin change, pour qu'ils repartent du bon jour.
    const startDateChanged = exists && prevProject.startDate !== projectObjInput.startDate;
    const endDateChanged = exists && prevProject.endDate !== projectObjInput.endDate;
    const projectObj = (datesOrStatusChanged || startDateChanged || endDateChanged)
      ? {
          ...projectObjInput,
          lateNotifiedAt: datesOrStatusChanged ? null : projectObjInput.lateNotifiedAt,
          startReminderSent: startDateChanged ? false : projectObjInput.startReminderSent,
          endReminderSent: endDateChanged ? false : projectObjInput.endReminderSent,
        }
      : projectObjInput;
    setProjects(prev => exists ? prev.map(p => p.id === projectObj.id ? projectObj : p) : [...prev, projectObj]);
    warnIfFailed(await upsertRow('projects', projectObj), 'Le projet');
    if (governanceTasks && governanceTasks.length) {
      setTasks(prev => [...prev, ...governanceTasks]);
      insertRows('tasks', governanceTasks);
    }
    if (exists) notifyProjectChanges(prevProject, projectObj);
    else notifyNewProjectTeam(projectObj);

    // Garder les tâches du projet cohérentes avec l'équipe et le responsable
    // actuels (utile après une duplication vers un autre service, ou un
    // simple changement d'équipe) : on retire des tâches les personnes qui
    // ne sont plus dans l'équipe, et les tâches alignées sur l'ancien
    // responsable suivent le nouveau.
    if (exists) {
      const oldTeam = prevProject.teamIds || [];
      const newTeam = projectObj.teamIds || [];
      const teamChanged = oldTeam.length !== newTeam.length || oldTeam.some(id => !newTeam.includes(id));
      const oldResponsibleIds = prevProject.responsibleIds || [];
      const newResponsibleIdsArr = projectObj.responsibleIds || [];
      const newResponsibleId = newResponsibleIdsArr[0] || '';
      // Comparaison par ensemble, pas par ordre : décocher puis recocher un
      // responsable (ou cocher un second responsable) rallonge le tableau
      // sans changer qui est réellement responsable — comparer juste [0]
      // aurait alors ré-assigné à tort les tâches de l'ancien responsable.
      const responsibleChanged = oldResponsibleIds.length !== newResponsibleIdsArr.length ||
        oldResponsibleIds.some(id => !newResponsibleIdsArr.includes(id));
      if (teamChanged || responsibleChanged) {
        const affected = tasks.filter(t => t.projectId === projectObj.id);
        const updated = [];
        affected.forEach(t => {
          let changed = false;
          const nt = { ...t };
          if (nt.assignMode === 'individuel' && nt.assigneeId) {
            if (!newTeam.includes(nt.assigneeId)) {
              nt.assigneeId = (newResponsibleId && newTeam.includes(newResponsibleId)) ? newResponsibleId : '';
              changed = true;
            } else if (oldResponsibleIds.includes(nt.assigneeId) && newResponsibleId && nt.assigneeId !== newResponsibleId) {
              nt.assigneeId = newResponsibleId;
              changed = true;
            }
          } else if (nt.assignMode === 'pool') {
            const filteredPool = (nt.pool || []).filter(id => newTeam.includes(id));
            if (filteredPool.length !== (nt.pool || []).length) { nt.pool = filteredPool; changed = true; }
          } else if (nt.assignMode === 'equipe') {
            const raci = { ...(nt.raci || {}) };
            let raciChanged = false;
            Object.keys(raci).forEach(id => { if (!newTeam.includes(id)) { delete raci[id]; raciChanged = true; } });
            const currentR = Object.entries(raci).find(([, r]) => r === 'R')?.[0] || '';
            if (newResponsibleId && newTeam.includes(newResponsibleId) && currentR !== newResponsibleId && (!currentR || oldResponsibleIds.includes(currentR))) {
              Object.keys(raci).forEach(id => { if (raci[id] === 'R') delete raci[id]; });
              raci[newResponsibleId] = 'R';
              raciChanged = true;
            }
            if (raciChanged) { nt.raci = raci; changed = true; }
          }
          if (changed) updated.push(nt);
        });
        if (updated.length) {
          setTasks(prev => prev.map(x => updated.find(u => u.id === x.id) || x));
          warnIfFailed(await upsertRows('tasks', updated), 'La mise à jour des tâches du projet');
        }
      }
    }

    // Répétition au niveau projet : à la clôture, on recrée un nouveau
    // projet pour le cycle suivant (dates décalées), avec une copie de
    // chacune de ses tâches (dates décalées pareil, responsable qui tourne
    // si la tâche a "rotateAssignee").
    let renewedProject = null;
    if (justCompleted && projectObj.repeatUnit && projectObj.repeatUnit !== 'aucune' && projectObj.startDate && projectObj.endDate) {
      const nextStart = shiftByRepeat(projectObj.startDate, projectObj.repeatUnit, projectObj.repeatEvery);
      const nextEnd = shiftByRepeat(projectObj.endDate, projectObj.repeatUnit, projectObj.repeatEvery);
      let newResponsibleIds = projectObj.responsibleIds || [];
      let newResponsibleRotationPool = projectObj.responsibleRotationPool || [];
      if (projectObj.rotateResponsible && newResponsibleIds.length > 0) {
        // Le nombre de responsables tournants est celui choisi dans le
        // formulaire (rotateResponsibleCount) — par défaut le nombre de
        // responsables déjà en place, pour les projets créés avant l'ajout
        // de ce réglage. Parmi les personnes dont c'est le tour, on
        // privilégie celles qui ont le moins de projets déjà en cours sur
        // la même période, pour éviter qu'une personne cumule plusieurs
        // responsabilités de projet à la fois.
        const projectLoadOf = (id) => projects.filter(p => p.id !== projectObj.id && p.status !== 'termine' &&
          (p.responsibleIds || []).includes(id) && p.startDate && p.endDate && p.startDate <= nextEnd && p.endDate >= nextStart).length;
        const count = projectObj.rotateResponsibleCount || newResponsibleIds.length;
        const rotated = nextRotatedAssignees(newResponsibleIds, projectObj.responsibleRotationPool, count, projectObj.teamIds, nextStart, projectLoadOf);
        if (rotated.assigneeIds.length > 0) {
          newResponsibleIds = rotated.assigneeIds;
          newResponsibleRotationPool = rotated.rotationPool;
        }
      }
      const newProject = { ...projectObj, id: uid(), status: 'en_cours', startDate: nextStart, endDate: nextEnd, lateNotifiedAt: null, startReminderSent: false, endReminderSent: false, responsibleIds: newResponsibleIds, responsibleRotationPool: newResponsibleRotationPool };
      renewedProject = newProject;
      setProjects(prev => [...prev, newProject]);
      warnIfFailed(await upsertRow('projects', newProject), 'Le renouvellement du projet');
      newResponsibleIds.filter(id => !(projectObj.responsibleIds || []).includes(id)).forEach(id => {
        const rm = members.find(x => x.id === id);
        if (rm?.email) notifyByEmail([rm.email], `Vous êtes responsable du projet « ${newProject.name} »`,
          `<p>Bonjour ${escapeHtml(rm.name)},</p><p>Vous êtes désormais responsable du projet <strong>${escapeHtml(newProject.name)}</strong> pour ce cycle (${fmtDateLong(newProject.startDate)} → ${fmtDateLong(newProject.endDate)}).</p>`);
      });

      const oldTasks = tasks.filter(t => t.projectId === projectObj.id);
      const clonedTasks = oldTasks.map(t => {
        const clone = {
          ...t, id: uid(), projectId: newProject.id, status: 'a_faire', createdAt: todayISO(),
          startDate: shiftByRepeat(t.startDate, projectObj.repeatUnit, projectObj.repeatEvery),
          deadline: shiftByRepeat(t.deadline, projectObj.repeatUnit, projectObj.repeatEvery),
        };
        if (t.rotateAssignee && t.assignMode === 'individuel') {
          const { assigneeId, rotationPool } = nextRotatedAssignee(t, newProject.teamIds, clone.deadline);
          clone.assigneeId = assigneeId;
          clone.rotationPool = rotationPool;
        } else if (t.rotateAssignee && t.assignMode === 'equipe') {
          const { raci, rotationPool } = rotateRaciResponsible(t, newProject.teamIds, clone.deadline);
          clone.raci = raci;
          clone.rotationPool = rotationPool;
        } else if (t.assignMode === 'individuel' && newResponsibleIds[0] && t.assigneeId && (projectObj.responsibleIds || []).includes(t.assigneeId)) {
          // Pas de rotation propre à la tâche : si elle était assignée à
          // l'ancien responsable du projet, elle suit le nouveau.
          clone.assigneeId = newResponsibleIds[0];
        } else if (t.assignMode === 'equipe' && newResponsibleIds[0]) {
          const currentR = Object.entries(t.raci || {}).find(([, r]) => r === 'R')?.[0] || '';
          if (currentR && (projectObj.responsibleIds || []).includes(currentR)) {
            const raci = { ...(t.raci || {}) };
            Object.keys(raci).forEach(id => { if (raci[id] === 'R') delete raci[id]; });
            raci[newResponsibleIds[0]] = 'R';
            clone.raci = raci;
          }
        }
        return clone;
      });
      if (clonedTasks.length) {
        setTasks(prev => [...prev, ...clonedTasks]);
        warnIfFailed(await insertRows('tasks', clonedTasks), 'Les tâches du nouveau cycle');
        oldTasks.forEach((t, i) => notifyTaskAssignment(t, clonedTasks[i]));
      }
    }
    setProjectModal(renewedProject ? { project: renewedProject } : null);
  };
  const deleteProject = async (id) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    warnIfFailed(await deleteRow('projects', id), 'La suppression du projet');
    const affectedTasks = tasks.filter(t => t.projectId === id);
    if (affectedTasks.length) {
      const affectedIds = new Set(affectedTasks.map(t => t.id));
      setTasks(prev => prev.filter(t => !affectedIds.has(t.id)));
      const results = await Promise.all(affectedTasks.map(t => deleteRow('tasks', t.id)));
      warnIfFailed(results.every(Boolean), 'La suppression des tâches du projet');
    }
    setProjectModal(null);
  };
  const duplicateProject = async (original) => {
    const id = uid();
    const clone = { ...original, id, name: `${original.name} (copie)`, status: 'en_cours', pendingApproval: false, createdBy: connectedAs, lateNotifiedAt: null, startReminderSent: false, endReminderSent: false };
    setProjects(prev => [...prev, clone]);
    warnIfFailed(await upsertRow('projects', clone), 'La copie du projet');
    const oldTasks = tasks.filter(t => t.projectId === original.id);
    const clonedTasks = oldTasks.map(t => ({ ...t, id: uid(), projectId: id, status: 'a_faire', createdAt: todayISO() }));
    if (clonedTasks.length) {
      setTasks(prev => [...prev, ...clonedTasks]);
      warnIfFailed(await insertRows('tasks', clonedTasks), 'Les tâches du projet dupliqué');
    }
    setProjectModal({ project: clone });
  };

  const saveAppt = async (a) => {
    const exists = appointments.some(x => x.id === a.id);
    setAppointments(prev => exists ? prev.map(x => x.id === a.id ? a : x) : [...prev, a]);
    warnIfFailed(await upsertRow('appointments', a), 'Le rendez-vous');
    setApptModal(null);
  };
  const deleteAppt = async (id) => {
    setAppointments(prev => prev.filter(x => x.id !== id));
    warnIfFailed(await deleteRow('appointments', id), 'La suppression du rendez-vous');
    setApptModal(null);
  };

  const saveContact = async (c) => {
    const exists = externalContacts.some(x => x.id === c.id);
    setExternalContacts(prev => exists ? prev.map(x => x.id === c.id ? c : x) : [...prev, c]);
    warnIfFailed(await upsertRow('externalContacts', c), 'Le contact externe');
    setContactModal(null);
  };
  const deleteContact = async (id) => {
    setExternalContacts(prev => prev.filter(x => x.id !== id));
    warnIfFailed(await deleteRow('externalContacts', id), 'La suppression du contact');
    const affectedAppts = appointments.filter(a => (a.externalParticipants || []).includes(id));
    if (affectedAppts.length) {
      const updated = affectedAppts.map(a => ({ ...a, externalParticipants: (a.externalParticipants || []).filter(p => p !== id) }));
      setAppointments(prev => prev.map(a => updated.find(u => u.id === a.id) || a));
      warnIfFailed(await upsertRows('appointments', updated), 'La mise à jour des rendez-vous liés');
    }
    setContactModal(null);
  };

  const saveRequest = async (r) => { setTaskRequests(prev => [...prev, r]); warnIfFailed(await upsertRow('taskRequests', r), 'La demande'); setRequestModal(null); };
  const approveRequest = async (id) => {
    const req = taskRequests.find(r => r.id === id); if (!req) return;
    if (req.kind === 'rendez_vous') {
      const newAppt = {
        id: uid(), title: req.title, date: req.deadline || todayISO(), time: req.time || '10:00', location: req.location || '',
        participants: req.origin === 'interne' && req.requesterMemberId ? [req.requesterMemberId] : [],
        externalParticipants: req.origin === 'externe' && req.requesterContactId ? [req.requesterContactId] : [],
        notes: req.description || '',
      };
      setAppointments(prev => [...prev, newAppt]);
      warnIfFailed(await upsertRow('appointments', newAppt), 'Le rendez-vous');
    } else {
      const newTask = {
        id: uid(), title: req.title, description: req.description, projectId: req.projectId || '',
        assignMode: 'individuel', assigneeId: req.origin === 'interne' ? (req.requesterMemberId || '') : '', pool: [], raci: {},
        priority: req.priority, importance: req.importance, scope: 'courte', status: 'a_faire',
        startDate: '', deadline: req.deadline, createdAt: todayISO(), repeatUnit: 'aucune', repeatEvery: 1,
      };
      setTasks(prev => [...prev, newTask]);
      warnIfFailed(await upsertRow('tasks', newTask), 'La tâche');
    }
    const updatedReq = { ...req, status: 'approuvee' };
    setTaskRequests(prev => prev.map(r => r.id === id ? updatedReq : r));
    warnIfFailed(await upsertRow('taskRequests', updatedReq), 'La demande');
  };
  const rejectRequest = async (id, comment) => {
    const req = taskRequests.find(r => r.id === id); if (!req) return;
    const updated = { ...req, status: 'refusee', comment };
    setTaskRequests(prev => prev.map(r => r.id === id ? updated : r));
    warnIfFailed(await upsertRow('taskRequests', updated), 'La demande');
  };

  const notifications = useMemo(() => {
    const taskNotifs = tasks.filter(t => t.status !== 'termine' && t.deadline && daysBetween(t.deadline) <= 3).map(t => ({ kind: 'task', date: t.deadline, item: t }));
    const apptNotifs = appointments.filter(a => daysBetween(a.date) >= 0 && daysBetween(a.date) <= 2).map(a => ({ kind: 'appt', date: a.date, item: a }));
    return [...taskNotifs, ...apptNotifs].sort((x, y) => x.date.localeCompare(y.date));
  }, [tasks, appointments]);
  const pendingRequests = taskRequests.filter(r => r.status === 'en_attente').length;

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2" size={18} /> Chargement…</div>;

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center gap-3 p-8">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center"><AlertTriangle size={20} className="text-red-500" /></div>
        <div className="text-sm font-semibold text-slate-700">Impossible de charger vos données</div>
        <div className="text-xs text-slate-400 max-w-sm">Un problème de connexion à la base de données est survenu. Vos données n'ont pas été touchées. Réessayez dans quelques instants.</div>
        <button onClick={() => window.location.reload()} className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg mt-2">Réessayer</button>
      </div>
    );
  }

  if (notRecognized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center gap-3 p-8">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center"><Lock size={20} className="text-amber-500" /></div>
        <div className="text-sm font-semibold text-slate-700">Compte non reconnu</div>
        <div className="text-xs text-slate-400 max-w-sm">
          Vous êtes connecté(e) avec <strong>{myEmail}</strong>, mais cette adresse n'est associée à aucun collaborateur.
          Demandez à votre manager de vous ajouter (Équipe → Ajouter un collaborateur) avec cette même adresse.
        </div>
        <button onClick={onSignOut} className="text-xs font-medium text-slate-500 hover:text-slate-700 underline mt-2">Se déconnecter</button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F7F8FA] overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');`}</style>
      <div className="w-56 shrink-0 flex flex-col" style={{ background: 'linear-gradient(180deg, #0B1B3F 0%, #142B5C 100%)' }}>
        <div className="px-5 py-5 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm text-white shadow-sm" style={{ fontFamily: 'Space Grotesk, sans-serif', background: 'linear-gradient(135deg, #3B82F6, #6366F1)' }}>R</div>
          <span className="font-semibold tracking-tight text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Mes projets</span>
        </div>
        <nav className="flex-1 px-2.5 space-y-1.5 overflow-y-auto">
          {nav.map(n => {
            const active = view === n.id;
            const hovered = hoveredNav === n.id;
            return (
              <button key={n.id} onClick={() => setView(n.id)}
                onMouseEnter={() => setHoveredNav(n.id)} onMouseLeave={() => setHoveredNav('')}
                style={{
                  background: active ? n.accent : (hovered ? `${n.accent}33` : 'transparent'),
                  boxShadow: active ? `0 2px 10px ${n.accent}66` : 'none',
                }}
                className={`w-full flex items-center gap-2.5 pl-3 pr-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? 'text-white' : 'text-white/70 hover:text-white'}`}>
                <n.Icon size={16} style={{ color: active ? '#FFFFFF' : n.accent }} /> {n.label}
                {!!n.badge && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0">
                    {n.badge > 99 ? '99+' : n.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="px-3 py-3 border-t border-white/10">
          <div className="flex items-center gap-2 px-2 mb-2">
            {currentMember && <Avatar name={currentMember.name} size={26} />}
            <div className="min-w-0 flex-1"><div className="text-xs font-medium text-white truncate">{currentMember?.name}</div><div className="text-[10px] text-white/50 truncate">{myEmail}</div></div>
          </div>
          <button onClick={onSignOut} className="w-full text-xs text-white/70 hover:text-white bg-white/10 hover:bg-white/15 rounded-lg px-2.5 py-2 flex items-center justify-center gap-1.5"><Lock size={12} /> Se déconnecter</button>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white relative">
          <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: `linear-gradient(90deg, ${nav.find(n => n.id === view)?.accent || '#818CF8'}, ${nav.find(n => n.id === view)?.accent || '#818CF8'}55, transparent)` }} />
          <h2 className="font-semibold text-lg flex items-center gap-2" style={{ fontFamily: 'Space Grotesk, sans-serif', color: nav.find(n => n.id === view)?.accent || '#1E293B' }}>{nav.find(n => n.id === view)?.label}</h2>
          <div className="relative">
            <button onClick={() => setNotifOpen(o => !o)} className="relative p-2 rounded-lg hover:bg-slate-50 text-slate-500">
              <Bell size={18} />
              {notifications.length > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">{notifications.length}</span>}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-100 rounded-xl shadow-lg z-40 overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-slate-50 text-xs font-semibold text-slate-500">Échéances & rendez-vous proches</div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 && <div className="px-3.5 py-4 text-xs text-slate-400">Rien à signaler.</div>}
                  {notifications.map((n, i) => n.kind === 'task' ? (
                    <button key={i} onClick={() => { setTaskModal({ task: n.item }); setNotifOpen(false); }} className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2 border-b border-slate-50 last:border-0">
                      <Clock3 size={14} className="text-amber-500 shrink-0" />
                      <div className="min-w-0 flex-1"><div className="text-xs font-medium text-slate-700 truncate">{n.item.title}</div></div>
                      <DeadlineBadge deadline={n.item.deadline} status={n.item.status} />
                    </button>
                  ) : (
                    <button key={i} onClick={() => { setApptModal({ appointment: n.item }); setNotifOpen(false); }} className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2 border-b border-slate-50 last:border-0">
                      <CalendarDays size={14} className="text-blue-500 shrink-0" />
                      <div className="min-w-0 flex-1"><div className="text-xs font-medium text-slate-700 truncate">{n.item.title}</div><div className="text-xs text-slate-400">{fmtDateLong(n.item.date)} · {n.item.time}</div></div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {view === 'dashboard' && <Dashboard tasks={tasks} members={members} projects={projects} appointments={appointments} connectedAs={connectedAs} openTask={(t) => setTaskModal({ task: t })} onClaim={claimTask} onOpenProject={(p) => setProjectModal({ project: p })} />}
          {view === 'tasks' && <TasksView tasks={scopedTasks} members={members} projects={scopedProjects} perm={perm} currentMemberId={connectedAs} scope={perm.isManager ? 'all' : 'mine'} openTask={(t) => setTaskModal({ task: t })} newTask={(projectId) => setTaskModal({ task: null, presetProjectId: projectId })} newProject={() => setProjectModal({ project: null })} editProject={(p) => setProjectModal({ project: p })} />}
          {view === 'planning' && <PlanningView members={members} tasks={scopedTasks} appointments={appointments} externalContacts={externalContacts} perm={perm} currentMemberId={connectedAs} openTask={(t) => setTaskModal({ task: t })} openAppt={(a) => setApptModal({ appointment: a })} newAppt={() => setApptModal({ appointment: null })} />}
          {view === 'transmissions' && <TransmissionsView transmissions={transmissions} members={members} currentMemberId={connectedAs} lastSeen={transmissionsLastSeen} onPost={postTransmission} />}
          {view === 'gantt' && <GanttView tasks={scopedTasks} members={members} projects={scopedProjects} openTask={(t) => setTaskModal({ task: t })} onOpenProject={(p) => setProjectModal({ project: p })} />}
          {view === 'priorisation' && <PrioritisationView projects={scopedProjects} members={members} onOpenProject={(p) => setProjectModal({ project: p })} />}
          {view === 'team' && <TeamView members={members} tasks={tasks} perm={perm} editMember={(m) => setMemberModal({ member: m })} newMember={() => setMemberModal({ member: null })} onImport={importMembers} />}
          {view === 'contacts' && <ContactsView contacts={externalContacts} perm={perm} editContact={(c) => setContactModal({ contact: c })} newContact={() => setContactModal({ contact: null })} />}
          {view === 'orgchart' && <OrgChartView nodes={orgNodes} assignments={orgAssignments} members={members} externalContacts={externalContacts} perm={perm}
            onAddNode={addOrgNode} onRenameNode={renameOrgNode} onDeleteNode={deleteOrgNode} onAddPerson={addOrgPerson} onUpdateAssignment={updateOrgAssignment} onRemoveAssignment={removeOrgAssignment} />}
          {view === 'feedback' && <FeedbackView currentMember={currentMember} onSend={sendFeedback} />}
        </div>
      </div>

      {taskModal && <TaskModal key={taskModal.task?.id || 'new'} task={taskModal.task} initialProjectId={taskModal.presetProjectId} members={members} projects={projects} perm={perm} currentMemberId={connectedAs} onSave={saveTask} onDelete={deleteTask} onClaim={claimTask} onDuplicate={duplicateTask} onClose={() => setTaskModal(null)} />}
      {memberModal && perm.canManageTeam && <MemberModal member={memberModal.member} onSave={saveMember} onDelete={deleteMember} onClose={() => setMemberModal(null)} />}
      {projectModal && perm.canCreateProject && <ProjectModal key={projectModal.project?.id || 'new'} project={projectModal.project} members={members} externalContacts={externalContacts} tasks={tasks} projects={projects} currentMemberId={connectedAs} perm={perm} onSave={saveProject} onDelete={deleteProject} onDuplicate={duplicateProject} onClose={() => setProjectModal(null)} />}
      {apptModal && <AppointmentModal appointment={apptModal.appointment} members={members} externalContacts={externalContacts} readOnly={!perm.canManageAppointments} onSave={saveAppt} onDelete={deleteAppt} onClose={() => setApptModal(null)} />}
      {contactModal && perm.canManageContacts && <ContactModal contact={contactModal.contact} onSave={saveContact} onDelete={deleteContact} onClose={() => setContactModal(null)} />}
      {requestModal && <RequestModal members={members} externalContacts={externalContacts} projects={projects} currentMemberId={connectedAs} onSave={saveRequest} onClose={() => setRequestModal(null)} />}

      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm px-4 sm:px-0">
        {toasts.map(t => (
          <div key={t.id} className={`rounded-xl shadow-lg border px-4 py-3 text-sm flex items-start gap-2.5 ${t.type === 'error' ? 'bg-white border-red-200' : 'bg-white border-slate-200'}`}>
            <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${t.type === 'error' ? 'text-red-500' : 'text-slate-400'}`} />
            <span className="flex-1 text-slate-600">{t.message}</span>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="text-slate-300 hover:text-slate-500 shrink-0"><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Authentification (email + mot de passe, via Supabase Auth)            */
/* ---------------------------------------------------------------------- */

function AuthShell({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA] p-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&display=swap');`}</style>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-sm" style={{ fontFamily: 'Space Grotesk, sans-serif', background: 'linear-gradient(135deg, #3B82F6, #6366F1)' }}>R</div>
          <span className="font-semibold text-lg text-slate-800" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Mes projets</span>
        </div>
        {children}
      </div>
    </div>
  );
}
const authInputCls = "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 mb-3";
const authButtonCls = "w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg";

function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'reset' | 'reset_sent'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setSending(true); setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSending(false);
    if (err) setError('Email ou mot de passe incorrect.');
  };
  const handleReset = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true); setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setSending(false);
    if (err) setError("Impossible d'envoyer l'email. Vérifiez votre adresse.");
    else setMode('reset_sent');
  };

  if (mode === 'reset_sent') {
    return (
      <AuthShell>
        <div className="text-center py-4">
          <div className="text-sm font-medium text-slate-700 mb-1">Email envoyé ✓</div>
          <div className="text-xs text-slate-400">Ouvrez l'email reçu à <strong>{email}</strong> pour choisir un nouveau mot de passe.</div>
          <button onClick={() => setMode('login')} className="text-xs text-slate-400 hover:text-slate-600 mt-4 underline">← Retour à la connexion</button>
        </div>
      </AuthShell>
    );
  }
  if (mode === 'reset') {
    return (
      <AuthShell>
        <form onSubmit={handleReset}>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Votre email professionnel</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="prenom.nom@cabinet.fr" className={authInputCls} />
          {error && <div className="text-xs text-red-500 mb-3">{error}</div>}
          <button type="submit" disabled={sending} className={authButtonCls}>{sending ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}</button>
          <button type="button" onClick={() => { setMode('login'); setError(''); }} className="w-full text-xs text-slate-400 hover:text-slate-600 mt-3">← Retour à la connexion</button>
        </form>
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <form onSubmit={handleLogin}>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">Email professionnel</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="prenom.nom@cabinet.fr" className={authInputCls} />
        <label className="block text-xs font-medium text-slate-500 mb-1.5">Mot de passe</label>
        <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={authInputCls} />
        {error && <div className="text-xs text-red-500 mb-3">{error}</div>}
        <button type="submit" disabled={sending} className={authButtonCls}>{sending ? 'Connexion…' : 'Se connecter'}</button>
        <button type="button" onClick={() => { setMode('reset'); setError(''); }} className="w-full text-xs text-slate-400 hover:text-slate-600 mt-3">Mot de passe oublié ?</button>
      </form>
    </AuthShell>
  );
}

function SetPasswordForm({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError('8 caractères minimum.'); return; }
    if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    setSending(true); setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setSending(false);
    if (err) setError("Impossible d'enregistrer le mot de passe. Réessayez.");
    else onDone();
  };

  return (
    <AuthShell>
      <div className="text-xs text-slate-500 mb-3">Choisissez votre mot de passe pour accéder à l'application.</div>
      <form onSubmit={handleSubmit}>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">Nouveau mot de passe</label>
        <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères minimum" className={authInputCls} />
        <label className="block text-xs font-medium text-slate-500 mb-1.5">Confirmer le mot de passe</label>
        <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" className={authInputCls} />
        {error && <div className="text-xs text-red-500 mb-3">{error}</div>}
        <button type="submit" disabled={sending} className={authButtonCls}>{sending ? 'Enregistrement…' : 'Valider mon mot de passe'}</button>
      </form>
    </AuthShell>
  );
}

// Détecte un lien d'invitation ou de réinitialisation, que Supabase le renvoie
// dans le fragment de l'URL (#type=... — ancien flux) ou dans ses paramètres
// (?code=...&type=... — flux PKCE, par défaut sur les projets Supabase récents).
const isInviteOrRecoveryLink = () => /type=(invite|recovery)/.test(window.location.hash) || /type=(invite|recovery)/.test(window.location.search);

// Certains antivirus / scanners de messagerie d'entreprise "pré-visitent"
// automatiquement les liens contenus dans les emails avant que la personne
// ne clique elle-même — ce qui consomme le lien à usage unique de Supabase
// et le rend mort pour la vraie personne. Pour éviter ça, le lien envoyé par
// email ne doit pas valider tout seul : il amène sur cet écran, qui exige un
// vrai clic humain avant d'échanger le jeton (un scanner automatique charge
// la page mais ne clique jamais sur un bouton).
function ConfirmLinkScreen({ type, tokenHash, onVerified }) {
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const handleConfirm = async () => {
    setVerifying(true); setError('');
    const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    setVerifying(false);
    if (err) setError("Ce lien a expiré ou a déjà été utilisé. Redemandez une invitation, ou cliquez sur \"Mot de passe oublié\" pour en obtenir un nouveau.");
    else { window.history.replaceState(null, '', window.location.pathname); onVerified(); }
  };
  return (
    <AuthShell>
      <div className="text-sm text-slate-600 mb-4">
        {type === 'recovery'
          ? 'Cliquez pour continuer la réinitialisation de votre mot de passe.'
          : 'Cliquez pour activer votre compte et choisir votre mot de passe.'}
      </div>
      {error && <div className="text-xs text-red-500 mb-3">{error}</div>}
      <button onClick={handleConfirm} disabled={verifying} className={authButtonCls}>{verifying ? 'Vérification…' : 'Continuer'}</button>
    </AuthShell>
  );
}

export default function AuthGate() {
  const [session, setSession] = useState(undefined);
  const [needsPassword, setNeedsPassword] = useState(() => isInviteOrRecoveryLink());
  const linkParams = new URLSearchParams(window.location.search);
  const tokenHash = linkParams.get('token_hash');
  const linkType = linkParams.get('type');
  const [linkConfirmed, setLinkConfirmed] = useState(!tokenHash);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session && isInviteOrRecoveryLink()) setNeedsPassword(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && isInviteOrRecoveryLink())) setNeedsPassword(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (tokenHash && linkType && !linkConfirmed) {
    return <ConfirmLinkScreen type={linkType} tokenHash={tokenHash} onVerified={() => { setLinkConfirmed(true); setNeedsPassword(true); }} />;
  }
  if (session === undefined) return <div className="min-h-screen flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2" size={18} /> Chargement…</div>;
  if (!session) return <Login />;
  if (needsPassword) return <SetPasswordForm onDone={() => setNeedsPassword(false)} />;
  return <ReferentApp session={session} onSignOut={() => supabase.auth.signOut()} />;
}
