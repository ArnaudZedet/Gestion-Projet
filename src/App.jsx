import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient';
import {
  LayoutDashboard, ListChecks, Users, CalendarDays, Bell,
  Plus, X, Pencil, Trash2, AlertTriangle, CheckCircle2, Clock3,
  Search, Loader2, Inbox, GanttChartSquare, Grid3x3, MapPin, Lock, Target, Repeat,
  ClipboardList, Send, XCircle, Building2, Mail, Check,
  Flag, PlayCircle, ShieldAlert, GraduationCap, Milestone as MilestoneIcon, Megaphone, ClipboardCheck,
  ChevronLeft, ChevronRight, FolderPlus, List as ListIcon, Download, Copy, Upload
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
  { id: 'a_faire',  label: 'À faire',  color: '#475467', bg: '#F1F2F4' },
  { id: 'en_cours', label: 'En cours', color: '#1849A9', bg: '#DBE7FE' },
  { id: 'termine',  label: 'Terminé',  color: '#127A45', bg: '#D8F4E4' },
];

// Trois niveaux : Manager (tous droits), Référent (gère ses projets), Utilisateur (lecture + demandes)
const ACCESS_LEVELS = [
  { id: 'manager',     label: 'Manager',     desc: 'Accès total : équipe, contacts, tous les projets, toutes les tâches' },
  { id: 'referent',    label: 'Référent',    desc: 'Peut créer des tâches et RDV, gérer le RACI et le planning de ses projets' },
  { id: 'utilisateur', label: 'Utilisateur', desc: "Voit ses tâches et le planning, peut faire des demandes de tâche/RDV" },
];

const RACI_LEVELS = [
  { id: 'R', label: 'Responsable', color: '#1849A9', bg: '#DBE7FE' },
  { id: 'A', label: 'Approbateur', color: '#6D28D9', bg: '#EDE4FF' },
  { id: 'C', label: 'Consulté',    color: '#0D9488', bg: '#D7F5F0' },
  { id: 'I', label: 'Informé',     color: '#475467', bg: '#F1F2F4' },
];
const RACI_CYCLE = ['', 'R', 'A', 'C', 'I'];

const IMPORTANCE = [
  { id: 'critique', label: 'Critique', color: '#B42318', bg: '#FEE4E2' },
  { id: 'elevee',   label: 'Élevée',   color: '#B54708', bg: '#FEF0C7' },
  { id: 'moyenne',  label: 'Moyenne',  color: '#1849A9', bg: '#DBE7FE' },
  { id: 'faible',   label: 'Faible',   color: '#475467', bg: '#F1F2F4' },
];
const SCOPES = [
  { id: 'eclair',  label: 'Éclair (≤ 2h)',        short: 'Éclair' },
  { id: 'courte',  label: 'Courte (quelques jours)', short: 'Courte' },
  { id: 'moyenne', label: 'Moyenne (quelques semaines)', short: 'Moyenne' },
  { id: 'longue',  label: 'Longue (plusieurs mois)', short: 'Longue' },
];
const isUrgent = (t) => t.priority === 'urgente' || t.priority === 'haute';
const isImportant = (t) => t.importance === 'critique' || t.importance === 'elevee';

const PROJECT_COLORS = ['#2563EB', '#0D9488', '#B54708', '#7C3AED', '#B42318', '#0369A1', '#4D7C0F'];
const FUNCTIONS = ['Manipulateur', 'Secrétaire', 'Aide manipulateur', 'Médecin'];

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
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
const addYears = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setFullYear(d.getFullYear() + n); return d.toISOString().slice(0, 10); };

const daysBetween = (isoDate) => {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00');
  const t = new Date(todayISO() + 'T00:00:00');
  return Math.round((d - t) / 86400000);
};
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); };
const fmtDateLong = (iso) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }); };

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
// Projette les prochaines occurrences d'une tâche répétitive (affichage uniquement,
// aucune tâche réelle n'est créée — la vraie occurrence suivante n'apparaît qu'à la validation).
function projectOccurrences(task, monthsAhead = 12, maxCount = 60) {
  if (!task.deadline) return [];
  if (!task.repeatUnit || task.repeatUnit === 'aucune') return [task.deadline];
  const horizon = addMonths(todayISO(), monthsAhead);
  const dates = [task.deadline];
  let cur = task.deadline;
  let count = 0;
  while (count < maxCount) {
    cur = shiftByRepeat(cur, task.repeatUnit, task.repeatEvery);
    if (cur > horizon) break;
    dates.push(cur);
    count++;
  }
  return dates;
}

// Étapes types de conduite de projet — deviennent de vraies tâches (isGovernance) mêlées aux tâches du projet
const GOVERNANCE_TYPES = [
  { id: 'preparation', label: 'Préparation du changement', Icon: Megaphone,      hint: 'Cadrage, parties prenantes, plan de communication' },
  { id: 'kickoff',      label: 'Kick-off',                  Icon: Flag,           hint: 'Lancement officiel du projet' },
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
    base('kickoff', 'Kick-off', addDays(start, Math.min(7, Math.max(1, Math.round(span * 0.05)))), { priority: 'haute' }),
    base('demarrage', 'Démarrage opérationnel', addDays(start, Math.min(14, Math.max(2, Math.round(span * 0.08))))),
    base('suivi', 'Point de suivi', addDays(start, 14), { repeatUnit: 'semaine', repeatEvery: 1, description: 'Comité de suivi' }),
    base('revue', 'Revue à mi-parcours', mid),
    base('risques', 'Revue des risques', addDays(start, Math.round(span * 0.3))),
    base('cloture', 'Clôture & bilan (RETEX)', end, { importance: 'elevee', description: "Indicateurs de succès, retour d'expérience" }),
  ];
}

/* ---------------------------------------------------------------------- */
/*  Données de démonstration                                             */
/* ---------------------------------------------------------------------- */

const seedMembers = (managerEmail) => ([
  { id: uid(), name: 'Vous (à renommer)', role: "Responsable d'exploitation", email: managerEmail || 'vous@cabinet.fr', accessLevel: 'manager', external: false },
  { id: uid(), name: 'Thomas Lenoir', role: 'Manipulateur radio référent', email: 'thomas.lenoir@cabinet-radio.fr', accessLevel: 'referent', external: false },
  { id: uid(), name: 'Camille Roussel', role: 'Secrétaire médicale', email: 'camille.roussel@cabinet-radio.fr', accessLevel: 'utilisateur', external: false },
  { id: uid(), name: 'Yasmine Belkacem', role: 'Secrétaire médicale', email: 'yasmine.belkacem@cabinet-radio.fr', accessLevel: 'utilisateur', external: false },
]);

const seedProjects = (members) => {
  const byName = (n) => members.find(m => m.name === n)?.id;
  return [
    { id: uid(), name: 'Départ Dr. Mercier', color: '#2563EB', description: "Organisation du pot de départ et des courriers associés", teamIds: [byName('Camille Roussel')].filter(Boolean) },
    { id: uid(), name: 'Fonctionnement courant', color: '#64748B', description: 'Tâches récurrentes du cabinet', teamIds: members.map(m => m.id) },
    { id: uid(), name: 'Digitalisation parcours patient', color: '#7C3AED', description: 'Projet structurant pluriannuel : bornes, pré-admission, ticketing', teamIds: members.map(m => m.id) },
  ];
};

const seedTasks = (members, projects) => {
  const byName = (n) => members.find(m => m.name === n)?.id;
  const p0 = projects[0]?.id, p1 = projects[1]?.id, p2 = projects[2]?.id;
  const plus = (n) => addDays(todayISO(), n);
  const manager = byName('Vous (à renommer)');
  const tasks = [
    { id: uid(), title: "Rédiger les courriers d'invitation", description: 'Invitation au pot de départ, à envoyer aux confrères et partenaires.', projectId: p0, assignMode: 'individuel', assigneeId: byName('Camille Roussel'), pool: [], raci: {}, priority: 'haute', importance: 'moyenne', scope: 'eclair', status: 'en_cours', startDate: plus(-1), deadline: plus(2), createdAt: todayISO(), repeatUnit: 'aucune', repeatEvery: 1 },
    { id: uid(), title: 'Relancer les impayés tiers payant', description: 'Liste des dossiers en attente depuis plus de 30 jours.', projectId: p1, assignMode: 'individuel', assigneeId: byName('Yasmine Belkacem'), pool: [], raci: {}, priority: 'normale', importance: 'moyenne', scope: 'courte', status: 'a_faire', startDate: plus(1), deadline: plus(5), createdAt: todayISO(), repeatUnit: 'aucune', repeatEvery: 1 },
    { id: uid(), title: 'Vérifier planning vacations du mois', description: '', projectId: p1, assignMode: 'individuel', assigneeId: byName('Thomas Lenoir'), pool: [], raci: {}, priority: 'urgente', importance: 'faible', scope: 'eclair', status: 'a_faire', startDate: plus(-3), deadline: plus(-1), createdAt: todayISO(), repeatUnit: 'aucune', repeatEvery: 1 },
    { id: uid(), title: 'Préparer reporting KPI mensuel', description: '', projectId: p1, assignMode: 'individuel', assigneeId: manager, pool: [], raci: {}, priority: 'normale', importance: 'elevee', scope: 'courte', status: 'a_faire', startDate: plus(2), deadline: plus(6), createdAt: todayISO(), repeatUnit: 'aucune', repeatEvery: 1 },
    { id: uid(), title: 'Assurer la permanence accueil du midi', description: "Ouverte à toute personne disponible — prise par la première personne qui se rend disponible.", projectId: p1, assignMode: 'pool', assigneeId: '', pool: [byName('Camille Roussel'), byName('Yasmine Belkacem')].filter(Boolean), raci: {}, priority: 'haute', importance: 'moyenne', scope: 'eclair', status: 'a_faire', startDate: plus(0), deadline: plus(0), createdAt: todayISO(), repeatUnit: 'aucune', repeatEvery: 1 },
    { id: uid(), title: 'Contrôle de sécurité radioprotection', description: 'Vérification hebdomadaire des dosimètres et des équipements de protection.', projectId: p1, assignMode: 'individuel', assigneeId: byName('Thomas Lenoir'), pool: [], raci: {}, priority: 'haute', importance: 'elevee', scope: 'eclair', status: 'a_faire', startDate: plus(3), deadline: plus(3), createdAt: todayISO(), repeatUnit: 'semaine', repeatEvery: 1 },
    { id: uid(), title: "Cadrage des bornes d'accueil patients", description: 'Choix du prestataire, périmètre fonctionnel.', projectId: p2, assignMode: 'equipe', assigneeId: '', pool: [],
      raci: { [manager]: 'A', [byName('Thomas Lenoir')]: 'R', [byName('Camille Roussel')]: 'C' },
      priority: 'normale', importance: 'critique', scope: 'longue', status: 'en_cours', startDate: plus(-10), deadline: plus(20), createdAt: todayISO(), repeatUnit: 'aucune', repeatEvery: 1 },
  ];
  return [...tasks, ...buildGovernanceTasks(plus(-10), plus(150), p2, manager)];
};

const seedExternalContacts = () => ([
  { id: uid(), name: 'Dr. Vasseur', organization: 'Cabinet partenaire', role: 'Radiologue confrère', email: 'dr.vasseur@partenaire-imagerie.fr' },
  { id: uid(), name: 'Marc Ancelin', organization: 'Prestataire maintenance IRM', role: 'Référent technique', email: 'm.ancelin@maintenance-imagerie.fr' },
]);

const seedAppointments = (members, contacts) => {
  const byName = (n) => members.find(m => m.name === n)?.id;
  const plus = (n) => addDays(todayISO(), n);
  return [
    { id: uid(), title: 'Point hebdo équipe secrétariat', date: plus(1), time: '09:00', location: 'Salle de réunion', participants: [byName('Vous (à renommer)'), byName('Camille Roussel'), byName('Yasmine Belkacem')].filter(Boolean), externalParticipants: [], notes: '' },
    { id: uid(), title: 'RDV fournisseur maintenance IRM', date: plus(4), time: '14:30', location: 'Sur site', participants: [byName('Thomas Lenoir'), byName('Vous (à renommer)')].filter(Boolean), externalParticipants: [contacts[1]?.id].filter(Boolean), notes: 'Prévoir le carnet de maintenance.' },
  ];
};

const seedTaskRequests = () => ([]);

/* ---------------------------------------------------------------------- */
/*  Stockage — une vraie table par type d'objet (CRUD ligne à ligne)      */
/* ---------------------------------------------------------------------- */

const d = (v) => (v ? v : null); // '' -> null pour les colonnes date

const ROW_MAPPERS = {
  members: {
    table: 'members',
    toRow: (m) => ({ id: m.id, name: m.name, role: m.role || null, email: m.email || null, access_level: m.accessLevel, external: !!m.external }),
    fromRow: (r) => ({ id: r.id, name: r.name, role: r.role || '', email: r.email || '', accessLevel: r.access_level, external: !!r.external }),
  },
  projects: {
    table: 'projects',
    toRow: (p) => ({ id: p.id, name: p.name, description: p.description || null, color: p.color || null, team_ids: p.teamIds || [] }),
    fromRow: (r) => ({ id: r.id, name: r.name, description: r.description || '', color: r.color || '', teamIds: r.team_ids || [] }),
  },
  tasks: {
    table: 'tasks',
    toRow: (t) => ({
      id: t.id, title: t.title, description: t.description || null, project_id: t.projectId || null,
      assign_mode: t.assignMode, assignee_id: t.assigneeId || null, pool: t.pool || [], raci: t.raci || {},
      priority: t.priority, importance: t.importance, scope: t.scope, status: t.status,
      start_date: d(t.startDate), deadline: d(t.deadline),
      repeat_unit: t.repeatUnit, repeat_every: t.repeatEvery,
      is_governance: !!t.isGovernance, governance_type: t.governanceType || null, created_at: d(t.createdAt),
    }),
    fromRow: (r) => ({
      id: r.id, title: r.title, description: r.description || '', projectId: r.project_id || '',
      assignMode: r.assign_mode, assigneeId: r.assignee_id || '', pool: r.pool || [], raci: r.raci || {},
      priority: r.priority, importance: r.importance, scope: r.scope, status: r.status,
      startDate: r.start_date || '', deadline: r.deadline || '',
      repeatUnit: r.repeat_unit, repeatEvery: r.repeat_every,
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
    toRow: (c) => ({ id: c.id, name: c.name, organization: c.organization || null, role: c.role || null, email: c.email || null }),
    fromRow: (r) => ({ id: r.id, name: r.name, organization: r.organization || '', role: r.role || '', email: r.email || '' }),
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
  if (!items || items.length === 0) return;
  const { table, toRow } = ROW_MAPPERS[key];
  const { error } = await supabase.from(table).insert(items.map(toRow));
  if (error) console.error('Erreur de création', key, error);
}
async function upsertRow(key, item) {
  const { table, toRow } = ROW_MAPPERS[key];
  const { error } = await supabase.from(table).upsert(toRow(item));
  if (error) console.error('Erreur de sauvegarde', key, error);
}
async function upsertRows(key, items) {
  if (!items || items.length === 0) return;
  const { table, toRow } = ROW_MAPPERS[key];
  const { error } = await supabase.from(table).upsert(items.map(toRow));
  if (error) console.error('Erreur de sauvegarde', key, error);
}
async function deleteRow(key, id) {
  const { table } = ROW_MAPPERS[key];
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) console.error('Erreur de suppression', key, error);
}


/* ---------------------------------------------------------------------- */
/*  Permissions & aides de portée (référent → "ses" projets)              */
/* ---------------------------------------------------------------------- */

function permissionsFor(accessLevel) {
  const isManager = accessLevel === 'manager';
  const isReferent = accessLevel === 'referent' || isManager;
  return {
    accessLevel, isManager, isReferent,
    canManageTeam: isManager,
    canManageContacts: isManager,
    canSeeOverview: isManager,
    canSeeAllTasks: isManager,
    canCreateTask: isReferent,
    canCreateProject: isReferent,
    canManageAppointments: isReferent,
    canEditRaci: isReferent,
    canReviewRequests: isManager,
  };
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
function myProjectIds(memberId, tasks, projects) {
  const ids = new Set();
  tasks.forEach(t => { if (t.projectId && isTaskOfMine(t, memberId)) ids.add(t.projectId); });
  projects.forEach(p => { if ((p.teamIds || []).includes(memberId)) ids.add(p.id); });
  return ids;
}
// Toutes les personnes impliquées (équipe déclarée + participantes aux tâches) sur un ensemble de projets
function teamOfProjects(projectIds, tasks, projects) {
  const ids = new Set();
  projects.forEach(p => { if (projectIds.has(p.id)) (p.teamIds || []).forEach(id => ids.add(id)); });
  tasks.forEach(t => {
    if (!t.projectId || !projectIds.has(t.projectId)) return;
    if (t.assigneeId) ids.add(t.assigneeId);
    (t.pool || []).forEach(id => ids.add(id));
    Object.keys(t.raci || {}).forEach(id => ids.add(id));
  });
  return ids;
}

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
  const r = ACCESS_LEVELS.find(x => x.id === id) || ACCESS_LEVELS[2];
  const styles = { manager: { c: '#B42318', b: '#FEE4E2' }, referent: { c: '#1849A9', b: '#DBE7FE' }, utilisateur: { c: '#475467', b: '#F1F2F4' } };
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
    <div style={{ width: size, height: size, background: `hsl(${hue} 55% 40%)`, fontSize: size * 0.38 }}
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0">
      {initials}
    </div>
  );
}

function DeadlineBadge({ deadline, status }) {
  if (!deadline) return <span className="text-xs text-slate-400">Sans échéance</span>;
  const d = daysBetween(deadline);
  const done = status === 'termine';
  let cls = 'text-slate-500', label = fmtDate(deadline);
  if (!done && d < 0) { cls = 'text-red-600 font-semibold'; label = `${fmtDate(deadline)} · retard ${Math.abs(d)}j`; }
  else if (!done && d === 0) { cls = 'text-amber-600 font-semibold'; label = "Aujourd'hui"; }
  else if (!done && d <= 3) { cls = 'text-amber-600'; label = `${fmtDate(deadline)} · J-${d}`; }
  return <span className={`text-xs ${cls}`}>{label}</span>;
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
      <Lock size={12} /> Lecture seule pour votre rôle
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

function TaskModal({ task, members, projects, perm, currentMemberId, onSave, onDelete, onClaim, onDuplicate, onClose }) {
  const [form, setForm] = useState(task || {
    title: '', description: '', projectId: projects[0]?.id || '',
    assignMode: 'individuel', assigneeId: '', pool: [], raci: {},
    priority: 'normale', importance: 'moyenne', scope: 'courte', status: 'a_faire', startDate: '', deadline: '',
    repeatUnit: 'aucune', repeatEvery: 1,
  });

  const isOpenPoolTask = task && form.assignMode === 'pool' && task.pool && task.pool.length > 0 && !task.assigneeId;
  const canClaim = isOpenPoolTask && task.pool.includes(currentMemberId);
  const isOwn = task && isTaskOfMine(task, currentMemberId);
  const fullyLocked = task && perm.accessLevel === 'utilisateur' && !isOwn;
  const statusOnly = task && perm.accessLevel === 'utilisateur' && isOwn;
  const locked = fullyLocked || statusOnly;

  const currentProject = projects.find(p => p.id === form.projectId);
  const projectTeamIds = currentProject?.teamIds || [];
  const availableMembers = projectTeamIds.length > 0 ? members.filter(m => projectTeamIds.includes(m.id)) : members;

  const handleProjectChange = (newProjectId) => {
    const team = projects.find(p => p.id === newProjectId)?.teamIds || [];
    const stillValid = (id) => team.length === 0 || team.includes(id);
    setForm(f => ({
      ...f, projectId: newProjectId,
      assigneeId: stillValid(f.assigneeId) ? f.assigneeId : '',
      pool: f.pool.filter(stillValid),
      raci: Object.fromEntries(Object.entries(f.raci).filter(([id]) => stillValid(id))),
    }));
  };

  const toggleParticipant = (id) => setForm(f => {
    if (f.assignMode === 'pool') {
      return { ...f, pool: f.pool.includes(id) ? f.pool.filter(x => x !== id) : [...f.pool, id] };
    }
    const raci = { ...f.raci };
    if (raci[id]) delete raci[id]; else raci[id] = 'R';
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
          <select disabled={locked} className={inputCls} value={form.assigneeId} onChange={e => setForm({ ...form, assigneeId: e.target.value })}>
            <option value="">— non assignée —</option>
            {availableMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
      )}

      {form.assignMode === 'pool' && (
        <Field label="Candidats (le premier qui la prend l'obtient)">
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="Priorité (urgence)">
          <select disabled={locked} className={inputCls} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
            {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Importance (impact)">
          <select disabled={locked} className={inputCls} value={form.importance} onChange={e => setForm({ ...form, importance: e.target.value })}>
            {IMPORTANCE.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Envergure">
          <select disabled={locked} className={inputCls} value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}>
            {SCOPES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Statut">
          <select disabled={fullyLocked} className={inputCls} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date de début (pour Durée des projets)">
          <input disabled={locked} type="date" className={inputCls} value={form.startDate || ''} onChange={e => setForm({ ...form, startDate: e.target.value })} />
        </Field>
        <Field label="Échéance">
          <input disabled={locked} type="date" className={inputCls} value={form.deadline || ''} onChange={e => setForm({ ...form, deadline: e.target.value })} />
        </Field>
      </div>
      <Field label="Répétition">
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
        {form.repeatUnit && form.repeatUnit !== 'aucune' && (
          <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-1"><Repeat size={11} /> {repeatLabel(form.repeatUnit, form.repeatEvery)} — nouvelle occurrence créée automatiquement une fois "Terminé".</div>
        )}
      </Field>

      <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
        <div className="flex items-center gap-2">
          {task && !fullyLocked && (
            <button onClick={() => onDelete(task.id)} disabled={statusOnly} className="text-red-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-red-50 text-sm font-medium px-3 py-2 rounded-lg flex items-center gap-1.5">
              <Trash2 size={14} /> Supprimer
            </button>
          )}
          {task && perm.canCreateTask && !fullyLocked && (
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
          {!fullyLocked && (
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
  const [form, setForm] = useState(member || { name: '', role: '', accessLevel: 'utilisateur', email: '' });
  const [roleChoice, setRoleChoice] = useState(FUNCTIONS.includes(member?.role) ? member.role : (member?.role ? 'Autre' : ''));
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
        <Field label="Email (compte de connexion)"><input type="email" className={inputCls} value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="prenom.nom@cabinet.fr" /></Field>
      </div>
      <Field label="Rôle applicatif (droits d'accès)">
        <select className={inputCls} value={form.accessLevel} onChange={e => setForm({ ...form, accessLevel: e.target.value })}>
          {ACCESS_LEVELS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <div className="text-xs text-slate-400 mt-1">{ACCESS_LEVELS.find(a => a.id === form.accessLevel)?.desc}</div>
      </Field>
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
        {member ? (
          <button onClick={() => onDelete(member.id)} className="text-red-500 hover:bg-red-50 text-sm font-medium px-3 py-2 rounded-lg flex items-center gap-1.5"><Trash2 size={14} /> Retirer</button>
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

function ProjectModal({ project, members, tasks, currentMemberId, onSave, onDelete, onClose }) {
  const isNew = !project;
  const [form, setForm] = useState(project || { name: '', description: '', color: PROJECT_COLORS[0], teamIds: [] });
  const [genGovernance, setGenGovernance] = useState(isNew);
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(addDays(todayISO(), 90));
  const toggleTeam = (id) => setForm(f => ({ ...f, teamIds: f.teamIds.includes(id) ? f.teamIds.filter(x => x !== id) : [...f.teamIds, id] }));

  const handleSubmit = () => {
    const id = form.id || uid();
    const projectObj = { ...form, id };
    const governanceTasks = (isNew && genGovernance) ? buildGovernanceTasks(startDate, endDate, id, currentMemberId) : [];
    onSave(projectObj, governanceTasks);
  };

  return (
    <Modal title={project ? 'Modifier le projet' : 'Nouveau projet'} onClose={onClose} wide>
      <Field label="Nom du projet"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Description"><textarea className={inputCls} rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Couleur">
        <div className="flex gap-2">
          {PROJECT_COLORS.map(c => (
            <button key={c} onClick={() => setForm({ ...form, color: c })} style={{ background: c }}
              className={`w-7 h-7 rounded-full ${form.color === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`} />
          ))}
        </div>
      </Field>
      <Field label="Équipe affectée">
        <div className="flex flex-wrap gap-1.5">
          {members.map(m => {
            const active = form.teamIds.includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => toggleTeam(m.id)}
                className={`text-xs px-2.5 py-1.5 rounded-full border flex items-center gap-1.5 ${active ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                <Avatar name={m.name} size={16} /> {m.name}
              </button>
            );
          })}
        </div>
      </Field>
      {isNew && (
        <div className="bg-slate-50 rounded-xl p-3.5 mb-3.5">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-2.5">
            <input type="checkbox" checked={genGovernance} onChange={e => setGenGovernance(e.target.checked)} />
            Générer les étapes de conduite du projet type
          </label>
          {genGovernance && (
            <>
              <div className="text-xs text-slate-400 mb-2.5">Préparation du changement, kick-off, démarrage, points de suivi, revue, clôture — créées comme tâches du projet, avec les bonnes dates.</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Début du projet"><input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} /></Field>
                <Field label="Fin du projet"><input type="date" className={inputCls} value={endDate} onChange={e => setEndDate(e.target.value)} /></Field>
              </div>
            </>
          )}
        </div>
      )}
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
        {project ? (
          <button onClick={() => {
            const count = (tasks || []).filter(t => t.projectId === project.id).length;
            const msg = count > 0
              ? `Supprimer ce projet supprimera aussi ses ${count} tâche${count !== 1 ? 's' : ''} associée${count !== 1 ? 's' : ''}. Continuer ?`
              : 'Supprimer ce projet ?';
            if (window.confirm(msg)) onDelete(project.id);
          }} className="text-red-500 hover:bg-red-50 text-sm font-medium px-3 py-2 rounded-lg flex items-center gap-1.5"><Trash2 size={14} /> Supprimer</button>
        ) : <span />}
        <button disabled={!form.name.trim()} onClick={handleSubmit} className="bg-blue-600 disabled:opacity-40 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
          {project ? 'Enregistrer' : 'Créer le projet'}
        </button>
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
          <button onClick={() => onDelete(appointment.id)} className="text-red-500 hover:bg-red-50 text-sm font-medium px-3 py-2 rounded-lg flex items-center gap-1.5"><Trash2 size={14} /> Supprimer</button>
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
  const [form, setForm] = useState(contact || { name: '', organization: '', role: '', email: '' });
  return (
    <Modal title={contact ? 'Modifier le contact' : 'Nouveau contact externe'} onClose={onClose}>
      <Field label="Nom"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Prénom Nom" /></Field>
      <Field label="Organisme"><input className={inputCls} value={form.organization} onChange={e => setForm({ ...form, organization: e.target.value })} placeholder="Ex : Siège, prestataire, confrère…" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fonction"><input className={inputCls} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></Field>
        <Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
      </div>
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
        {contact ? (
          <button onClick={() => onDelete(contact.id)} className="text-red-500 hover:bg-red-50 text-sm font-medium px-3 py-2 rounded-lg flex items-center gap-1.5"><Trash2 size={14} /> Retirer</button>
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

function Dashboard({ tasks, members, appointments, connectedAs, openTask, onClaim }) {
  const active = tasks.filter(t => t.status !== 'termine');
  const overdue = active.filter(t => t.deadline && daysBetween(t.deadline) < 0);
  const dueSoon = active.filter(t => t.deadline && daysBetween(t.deadline) >= 0 && daysBetween(t.deadline) <= 3);
  const doneCount = tasks.filter(t => t.status === 'termine').length;
  const openPool = tasks.filter(t => t.assignMode === 'pool' && !t.assigneeId && t.pool && t.pool.length > 0);

  const workload = members.map(m => {
    const mine = active.filter(t => responsibleIdsOf(t).includes(m.id));
    const counts = {};
    PRIORITIES.forEach(p => counts[p.id] = mine.filter(t => t.priority === p.id).length);
    return { member: m, total: mine.length, counts };
  }).sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(1, ...workload.map(w => w.total));

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
          <div key={k.label} className="bg-white rounded-2xl border border-slate-100 p-4">
            <div style={{ background: k.bg, color: k.color }} className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"><k.Icon size={16} /></div>
            <div className="text-2xl font-semibold text-slate-800" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{k.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{k.label}</div>
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
          <h3 className="text-sm font-semibold text-slate-700 mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Charge de travail par personne</h3>
          <div className="space-y-3">
            {workload.map(w => (
              <div key={w.member.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2"><Avatar name={w.member.name} size={22} /><span className="text-xs font-medium text-slate-600">{w.member.name}</span></div>
                  <span className="text-xs text-slate-400">{w.total} tâche{w.total !== 1 ? 's' : ''}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
                  {PRIORITIES.map(p => { const c = w.counts[p.id]; if (!c) return null; return <div key={p.id} style={{ width: `${(c / maxTotal) * 100}%`, background: p.bar }} title={`${p.label}: ${c}`} />; })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100">
            {PRIORITIES.map(p => <div key={p.id} className="flex items-center gap-1.5 text-xs text-slate-400"><span style={{ background: p.bar }} className="w-2 h-2 rounded-full" /> {p.label}</div>)}
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
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
  const [query, setQuery] = useState('');
  const selectCls = "border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none";

  const baseList = scope === 'mine'
    ? (perm.isReferent
        ? tasks.filter(t => isTaskOfMine(t, currentMemberId) || myProjectIds(currentMemberId, tasks, projects).has(t.projectId))
        : tasks.filter(t => isTaskOfMine(t, currentMemberId)))
    : tasks;

  const filtered = baseList.filter(t =>
    (filterMember === 'all' || t.assigneeId === filterMember || (t.raci && t.raci[filterMember]) || (t.pool && t.pool.includes(filterMember))) &&
    (filterProject === 'all' || t.projectId === filterProject) &&
    (filterStatus === 'all' || t.status === filterStatus) &&
    t.title.toLowerCase().includes(query.toLowerCase())
  );

  const visibleProjects = scope === 'mine' && !perm.isManager
    ? projects.filter(p => myProjectIds(currentMemberId, tasks, projects).has(p.id))
    : projects;

  const grouped = filterProject === 'all';
  const groups = grouped
    ? visibleProjects.map(p => ({ project: p, items: filtered.filter(t => t.projectId === p.id) })).filter(g => g.items.length > 0)
    : [{ project: projects.find(p => p.id === filterProject), items: filtered }];
  const noProject = filtered.filter(t => !projects.some(p => p.id === t.projectId));
  if (grouped && noProject.length) groups.push({ project: { id: '_none', name: 'Sans projet', color: '#94A3B8' }, items: noProject });

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
        <td className="px-4 py-2.5"><PriorityTag id={t.priority} /></td>
        <td className="px-4 py-2.5"><StatusTag id={t.status} /></td>
        <td className="px-4 py-2.5"><DeadlineBadge deadline={t.deadline} status={t.status} /></td>
      </tr>
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
        <div className="ml-auto flex gap-2">
          {perm.canCreateProject && <button onClick={newProject} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><FolderPlus size={14} /> Nouveau projet</button>}
          {perm.canCreateTask && <button onClick={newTask} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Plus size={14} /> Nouvelle tâche</button>}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100"><EmptyState icon={Inbox} title="Aucune tâche" subtitle="Créez une tâche ou ajustez les filtres." /></div>
      ) : groups.map(g => (
        <div key={g.project?.id || 'x'} className="mb-4">
          {g.project && g.project.id !== '_none' && (
            <div className="flex items-center gap-1.5 px-1 mb-1.5">
              <span style={{ background: g.project.color }} className="w-2 h-2 rounded-full" />
              <span className="text-xs font-semibold text-slate-500">{g.project.name}</span>
              <span className="text-xs text-slate-300">· {g.items.length} tâche{g.items.length !== 1 ? 's' : ''}</span>
              {perm.canCreateProject && (
                <button onClick={() => editProject(g.project)} className="text-slate-300 hover:text-slate-500 p-0.5" title="Modifier ou supprimer ce projet">
                  <Pencil size={11} />
                </button>
              )}
            </div>
          )}
          {g.project && g.project.id === '_none' && (
            <div className="flex items-center gap-1.5 px-1 mb-1.5">
              <span style={{ background: g.project.color }} className="w-2 h-2 rounded-full" />
              <span className="text-xs font-semibold text-slate-500">{g.project.name}</span>
              <span className="text-xs text-slate-300">· {g.items.length} tâche{g.items.length !== 1 ? 's' : ''}</span>
            </div>
          )}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-4 py-2.5 font-medium">Tâche</th><th className="px-4 py-2.5 font-medium">Assignée à</th>
                <th className="px-4 py-2.5 font-medium">Envergure</th><th className="px-4 py-2.5 font-medium">Priorité</th>
                <th className="px-4 py-2.5 font-medium">Statut</th><th className="px-4 py-2.5 font-medium">Échéance</th>
              </tr></thead>
              <tbody>{g.items.map(t => <Row key={t.id} t={t} />)}</tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Équipe & Contacts externes                                            */
/* ---------------------------------------------------------------------- */

function TeamView({ members, tasks, perm, editMember, newMember, onImport }) {
  const fileInputRef = React.useRef(null);
  const [importMsg, setImportMsg] = useState('');

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
      {perm.canManageTeam && (
        <div className="flex items-center justify-end gap-2 mb-2">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          <button onClick={() => fileInputRef.current?.click()} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Upload size={14} /> Importer un fichier (CSV)</button>
          <button onClick={newMember} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Plus size={14} /> Ajouter un collaborateur</button>
        </div>
      )}
      {importMsg && <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 mb-4">{importMsg}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {members.map(m => {
          const active = tasks.filter(t => isTaskOfMine(t, m.id) && t.status !== 'termine').length;
          return (
            <div key={m.id} className="bg-white rounded-2xl border border-slate-100 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3"><Avatar name={m.name} size={40} /><div><div className="font-medium text-slate-700 text-sm">{m.name}</div><div className="text-xs text-slate-400">{m.role}</div></div></div>
                {perm.canManageTeam && <button onClick={() => editMember(m)} className="text-slate-300 hover:text-slate-500 p-1"><Pencil size={14} /></button>}
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap"><RoleTag id={m.accessLevel} />{m.email && <span className="text-xs text-slate-400 flex items-center gap-1"><Mail size={11} />{m.email}</span>}</div>
              <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-50">{active} tâche{active !== 1 ? 's' : ''} en cours</div>
            </div>
          );
        })}
      </div>
      {members.length === 0 && <EmptyState icon={Users} title="Aucun collaborateur" />}
    </div>
  );
}

function ContactsView({ contacts, perm, editContact, newContact }) {
  return (
    <div>
      {perm.canManageContacts && (
        <div className="flex items-center justify-end mb-4">
          <button onClick={newContact} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Plus size={14} /> Ajouter un contact</button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {contacts.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><Building2 size={16} /></div>
                <div><div className="font-medium text-slate-700 text-sm">{c.name}</div><div className="text-xs text-slate-400">{c.role}{c.role && c.organization ? ' · ' : ''}{c.organization}</div></div>
              </div>
              {perm.canManageContacts && <button onClick={() => editContact(c)} className="text-slate-300 hover:text-slate-500 p-1"><Pencil size={14} /></button>}
            </div>
            {c.email && <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-50 flex items-center gap-1"><Mail size={11} />{c.email}</div>}
          </div>
        ))}
      </div>
      {contacts.length === 0 && <EmptyState icon={Building2} title="Aucun contact externe" />}
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

function MonthCalendar({ year, month, dayTasks, dayAppts, onPrev, onNext, openTask, openAppt }) {
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
          const ts = iso ? (dayTasks[iso] || []) : [];
          const as = iso ? (dayAppts[iso] || []) : [];
          const today = iso === todayISO();
          return (
            <div key={i} className={`min-h-[76px] rounded-lg border p-1 ${d ? 'border-slate-100' : 'border-transparent'} ${today ? 'bg-blue-50/50 border-blue-200' : ''}`}>
              {d && <div className={`text-[10px] mb-1 ${today ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>{d.getDate()}</div>}
              <div className="space-y-0.5">
                {as.slice(0, 2).map(a => (
                  <button key={a.id} onClick={() => openAppt(a)} className="w-full text-left text-[10px] bg-blue-100 text-blue-700 rounded px-1 py-0.5 truncate block">{a.time} {a.title}</button>
                ))}
                {ts.slice(0, 2).map(t => {
                  const pr = PRIORITIES.find(p => p.id === t.priority);
                  const repeating = t.repeatUnit && t.repeatUnit !== 'aucune';
                  return (
                    <button key={t.id} onClick={() => openTask(t)} style={{ background: pr.bg, color: pr.color }} className="w-full text-left text-[10px] rounded px-1 py-0.5 truncate flex items-center gap-0.5">
                      {repeating && <Repeat size={9} className="shrink-0" />}<span className="truncate">{t.title}</span>
                    </button>
                  );
                })}
                {(ts.length + as.length) > 4 && <div className="text-[9px] text-slate-400 px-1">+{ts.length + as.length - 4}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlanningView({ members, tasks, projects, appointments, perm, currentMemberId, openTask, openAppt, newAppt }) {
  const visibleMembers = perm.isManager ? members
    : perm.isReferent ? members.filter(m => m.id === currentMemberId || teamOfProjects(myProjectIds(currentMemberId, tasks, projects), tasks, projects).has(m.id))
    : members.filter(m => m.id === currentMemberId);

  const [selected, setSelected] = useState(currentMemberId || visibleMembers[0]?.id || '');
  useEffect(() => { if (!selected) setSelected(currentMemberId || visibleMembers[0]?.id || ''); }, [members]);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const person = visibleMembers.find(m => m.id === selected);

  const mine = tasks.filter(t => isTaskOfMine(t, selected));
  const myAppts = appointments.filter(a => a.participants.includes(selected));
  const myOpenPool = tasks.filter(t => t.assignMode === 'pool' && !t.assigneeId && t.pool && t.pool.includes(selected));

  // Planning = uniquement les tâches ponctuelles (un seul jour, comme un rendez-vous) : pas de startDate,
  // ou startDate identique à l'échéance. Les tâches qui s'étalent sur plusieurs jours restent dans Tâches/Gantt.
  const punctualMine = mine.filter(t => t.deadline && (!t.startDate || t.startDate === t.deadline));

  const [exportTime, setExportTime] = useState('09:00');

  const dayTasks = {};
  punctualMine.forEach(t => {
    projectOccurrences(t).forEach(date => { (dayTasks[date] = dayTasks[date] || []).push(t); });
  });
  const dayAppts = {}; myAppts.forEach(a => (dayAppts[a.date] = dayAppts[a.date] || []).push(a));

  const handleExportIcs = () => {
    const events = [];
    punctualMine.forEach(t => {
      projectOccurrences(t).forEach(date => events.push({ title: t.title, date, time: exportTime, location: '', notes: t.description }));
    });
    myAppts.forEach(a => events.push({ title: a.title, date: a.date, time: a.time, location: a.location, notes: a.notes }));
    if (events.length === 0) return;
    downloadTextFile(`planning-${(person?.name || 'export').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`, buildICSMulti(events), 'text/calendar');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="bg-white rounded-2xl border border-slate-100 p-3 h-fit space-y-1">
        {visibleMembers.map(m => (
          <button key={m.id} onClick={() => setSelected(m.id)} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left ${selected === m.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
            <Avatar name={m.name} size={28} />
            <div className="min-w-0"><div className={`text-xs font-medium truncate ${selected === m.id ? 'text-blue-700' : 'text-slate-600'}`}>{m.name}</div><div className="text-xs text-slate-400 truncate">{m.role}</div></div>
          </button>
        ))}
        <div className="mt-2 pt-2 border-t border-slate-100">
          <div className="text-[10px] text-slate-400 px-1 mb-1">Horaire pour les tâches d'un jour</div>
          <input type="time" value={exportTime} onChange={e => setExportTime(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600 mb-1.5" />
          <button onClick={handleExportIcs} className="w-full text-xs font-medium text-slate-500 hover:text-blue-700 flex items-center justify-center gap-1.5 py-1.5">
            <Download size={13} /> Exporter (.ics)
          </button>
        </div>
      </div>
      <div className="md:col-span-3 space-y-4">
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
                  <PriorityTag id={t.priority} />
                </button>
              ))}
            </div>
          </div>
        )}
        {!person ? <EmptyState icon={CalendarDays} title="Sélectionnez un collaborateur" /> : (
          <MonthCalendar
            year={cursor.year} month={cursor.month} dayTasks={dayTasks} dayAppts={dayAppts}
            onPrev={() => setCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })}
            onNext={() => setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })}
            openTask={openTask} openAppt={openAppt}
          />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Durée des projets (ex-Gantt)                                          */
/* ---------------------------------------------------------------------- */

function GanttView({ tasks, projects, members, openTask }) {
  const [filterProject, setFilterProject] = useState('all');
  const DAY_W = 30;
  const withRange = tasks.filter(t => t.deadline).filter(t => filterProject === 'all' || t.projectId === filterProject)
    .map(t => { let start = t.startDate || t.deadline; if (dayDiff(start, t.deadline) < 0) start = t.deadline; return { ...t, start }; });

  if (withRange.length === 0) return <EmptyState icon={GanttChartSquare} title="Aucune tâche planifiable" subtitle="Renseignez une échéance sur vos tâches pour les voir apparaître ici." />;

  const rangeStart = addDays(withRange.reduce((min, t) => t.start < min ? t.start : min, withRange[0].start), -1);
  const rangeEnd = addDays(withRange.reduce((max, t) => t.deadline > max ? t.deadline : max, withRange[0].deadline), 2);
  const totalDays = dayDiff(rangeStart, rangeEnd) + 1;
  const days = Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i));
  const trackWidth = totalDays * DAY_W;
  const months = [];
  days.forEach(d => {
    const label = new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    const last = months[months.length - 1];
    if (last && last.label === label) last.span += 1; else months.push({ label, span: 1 });
  });
  const grouped = projects.map(p => ({ project: p, items: withRange.filter(t => t.projectId === p.id) })).filter(g => g.items.length > 0);
  const noProject = withRange.filter(t => !projects.some(p => p.id === t.projectId));
  if (noProject.length) grouped.push({ project: { id: '_none', name: 'Sans projet', color: '#94A3B8' }, items: noProject });
  const todayOffset = dayDiff(rangeStart, todayISO());

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <select className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="all">Tous les projets</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="text-xs text-slate-400">Barres positionnées entre le début et l'échéance de chaque tâche — les étapes de conduite de projet apparaissent avec une icône</span>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
        <div style={{ minWidth: 200 + trackWidth }}>
          <div className="flex sticky top-0 bg-white z-20">
            <div className="w-[200px] shrink-0 border-r border-b border-slate-100" />
            <div className="flex border-b border-slate-100">{months.map((mo, i) => <div key={i} style={{ width: mo.span * DAY_W }} className="text-xs font-medium text-slate-500 px-2 py-1.5 border-r border-slate-50 capitalize">{mo.label}</div>)}</div>
          </div>
          <div className="flex">
            <div className="w-[200px] shrink-0 border-r border-slate-100" />
            <div className="flex">{days.map((d, i) => { const dow = new Date(d + 'T00:00:00').getDay(); const weekend = dow === 0 || dow === 6; return <div key={i} style={{ width: DAY_W }} className={`text-[10px] text-center py-1 border-r border-slate-50 ${weekend ? 'bg-slate-50 text-slate-300' : 'text-slate-400'}`}>{new Date(d + 'T00:00:00').getDate()}</div>; })}</div>
          </div>
          {grouped.map(g => (
            <div key={g.project.id}>
              <div className="flex bg-slate-50/60">
                <div className="w-[200px] shrink-0 px-3 py-1.5 text-xs font-semibold text-slate-500 flex items-center gap-1.5 border-r border-slate-100"><span style={{ background: g.project.color }} className="w-2 h-2 rounded-full" />{g.project.name}</div>
                <div style={{ width: trackWidth }} className="border-b border-slate-50" />
              </div>
              {g.items.map(t => {
                const responsibles = responsibleIdsOf(t).map(id => members.find(m => m.id === id)).filter(Boolean);
                const offset = dayDiff(rangeStart, t.start);
                const span = Math.max(1, dayDiff(t.start, t.deadline) + 1);
                const pr = PRIORITIES.find(p => p.id === t.priority);
                return (
                  <div key={t.id} className="flex items-center border-b border-slate-50">
                    <div className="w-[200px] shrink-0 px-3 py-2 flex items-center gap-2 border-r border-slate-100">
                      {t.isGovernance ? <GovIcon id={t.governanceType} size={14} className="text-purple-500 shrink-0" /> : responsibles[0] && <Avatar name={responsibles[0].name} size={20} />}
                      <span className="text-xs text-slate-600 truncate">{t.title}</span>
                    </div>
                    <div style={{ width: trackWidth }} className="relative h-9">
                      {todayOffset >= 0 && todayOffset < totalDays && <div style={{ left: todayOffset * DAY_W + DAY_W / 2 }} className="absolute top-0 bottom-0 w-px bg-red-300 z-10" />}
                      <button onClick={() => openTask(t)} style={{ left: offset * DAY_W + 2, width: span * DAY_W - 4, background: t.isGovernance ? '#7C3AED' : pr.bar }}
                        className="absolute top-1.5 h-6 rounded-md text-white text-[10px] font-medium flex items-center px-2 truncate hover:brightness-95"
                        title={`${t.title} · ${fmtDate(t.start)} → ${fmtDate(t.deadline)}`}>{t.title}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Rôle des participants (ex-RACI)                                       */
/* ---------------------------------------------------------------------- */

function RaciView({ tasks, projects, members, perm, updateRaci }) {
  const [filterProject, setFilterProject] = useState(projects[0]?.id || 'all');
  const list = tasks.filter(t => filterProject === 'all' || t.projectId === filterProject);
  const cycle = (task, memberId) => {
    if (!perm.canEditRaci) return;
    const current = task.raci?.[memberId] || '';
    const next = RACI_CYCLE[(RACI_CYCLE.indexOf(current) + 1) % RACI_CYCLE.length];
    const raci = { ...(task.raci || {}) };
    if (next) raci[memberId] = next; else delete raci[memberId];
    updateRaci(task.id, raci);
  };
  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="all">Toutes les tâches</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="text-xs text-slate-400">Modifiable directement ici, ou depuis la fiche de chaque tâche (mode "Équipe")</div>
        <div className="flex gap-3 text-xs text-slate-400 ml-auto">{RACI_LEVELS.map(r => <div key={r.id} className="flex items-center gap-1.5"><span style={{ background: r.bg, color: r.color }} className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold">{r.id}</span>{r.label}</div>)}</div>
      </div>
      {!perm.canEditRaci && <ReadOnlyNotice />}
      {list.length === 0 ? <EmptyState icon={Grid3x3} title="Aucune tâche" /> : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead><tr className="border-b border-slate-100">
              <th className="text-left text-xs font-medium text-slate-400 px-4 py-2.5 sticky left-0 bg-white">Tâche</th>
              {members.map(m => <th key={m.id} className="px-2 py-2.5 text-center"><div className="flex flex-col items-center gap-1"><Avatar name={m.name} size={22} /><span className="text-[10px] text-slate-400 max-w-[64px] truncate">{m.name.split(' ')[0]}</span></div></th>)}
            </tr></thead>
            <tbody>
              {list.map(t => (
                <tr key={t.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 sticky left-0 bg-white text-xs font-medium text-slate-600 max-w-[220px] truncate flex items-center gap-1.5">
                    {t.isGovernance && <GovIcon id={t.governanceType} size={11} className="text-purple-500 shrink-0" />}{t.title}
                  </td>
                  {members.map(m => {
                    const v = t.raci?.[m.id] || '';
                    const lvl = RACI_LEVELS.find(r => r.id === v);
                    return (
                      <td key={m.id} className="px-2 py-2 text-center">
                        <button disabled={!perm.canEditRaci} onClick={() => cycle(t, m.id)} style={lvl ? { background: lvl.bg, color: lvl.color } : {}}
                          className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center mx-auto ${!lvl ? 'bg-slate-50 text-slate-300' : ''} ${perm.canEditRaci ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'}`}>{v || '·'}</button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Priorisation (matrice urgence × importance)                           */
/* ---------------------------------------------------------------------- */

function PriorityCard({ t, members, openTask }) {
  const responsibles = responsibleIdsOf(t).map(id => members.find(m => m.id === id)).filter(Boolean);
  return (
    <button onClick={() => openTask(t)} className="w-full text-left bg-white/70 hover:bg-white rounded-xl px-3 py-2.5 border border-slate-100">
      <div className="text-xs font-medium text-slate-700 truncate mb-1.5 flex items-center gap-1.5">
        {t.isGovernance && <GovIcon id={t.governanceType} size={11} className="text-purple-500 shrink-0" />}{t.title}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <ScopeTag id={t.scope} />
        {responsibles[0] && <span className="flex items-center gap-1 text-[10px] text-slate-400"><Avatar name={responsibles[0].name} size={16} />{responsibles[0].name.split(' ')[0]}</span>}
        <span className="ml-auto"><DeadlineBadge deadline={t.deadline} status={t.status} /></span>
      </div>
    </button>
  );
}
function Quadrant({ title, subtitle, accent, bg, list, members, openTask }) {
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
        {list.map(t => <PriorityCard key={t.id} t={t} members={members} openTask={openTask} />)}
      </div>
    </div>
  );
}
function PrioritisationView({ tasks, members, openTask }) {
  const [scopeFilter, setScopeFilter] = useState('all');
  const active = tasks.filter(t => t.status !== 'termine' && (scopeFilter === 'all' || t.scope === scopeFilter));
  const sortByDeadline = (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999');
  const q1 = active.filter(t => isUrgent(t) && isImportant(t)).sort(sortByDeadline);
  const q2 = active.filter(t => !isUrgent(t) && isImportant(t)).sort(sortByDeadline);
  const q3 = active.filter(t => isUrgent(t) && !isImportant(t)).sort(sortByDeadline);
  const q4 = active.filter(t => !isUrgent(t) && !isImportant(t)).sort(sortByDeadline);
  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 bg-white focus:outline-none" value={scopeFilter} onChange={e => setScopeFilter(e.target.value)}>
          <option value="all">Toutes les envergures</option>{SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <span className="text-xs text-slate-400">Une tâche de 2h et un projet de plusieurs mois se classent selon le même critère : urgence × importance.</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Quadrant title="Faire maintenant" subtitle="Urgent et important" accent="#B42318" bg="#FBD5D1" list={q1} members={members} openTask={openTask} />
        <Quadrant title="Planifier" subtitle="Important, pas urgent" accent="#1849A9" bg="#C9DBFD" list={q2} members={members} openTask={openTask} />
        <Quadrant title="Déléguer" subtitle="Urgent, peu important" accent="#B54708" bg="#FBE3AE" list={q3} members={members} openTask={openTask} />
        <Quadrant title="Reporter / éliminer" subtitle="Ni urgent ni important" accent="#475467" bg="#DBDFE3" list={q4} members={members} openTask={openTask} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Navigation par rôle                                                   */
/* ---------------------------------------------------------------------- */

function navFor(perm) {
  const nav = [];
  if (perm.isManager) nav.push({ id: 'dashboard', label: "Vue d'ensemble", Icon: LayoutDashboard });
  nav.push({ id: 'tasks', label: perm.isManager ? 'Tâches' : 'Mes tâches', Icon: ListChecks });
  nav.push({ id: 'planning', label: 'Planning', Icon: CalendarDays });
  nav.push({ id: 'requests', label: 'Demandes', Icon: ClipboardList });
  if (perm.isReferent) {
    nav.push({ id: 'gantt', label: 'Durée des projets', Icon: GanttChartSquare });
    nav.push({ id: 'raci', label: 'Rôle des participants', Icon: Grid3x3 });
    nav.push({ id: 'priorisation', label: 'Priorisation', Icon: Target });
  }
  if (perm.isManager) {
    nav.push({ id: 'team', label: 'Équipe et référents', Icon: Users });
    nav.push({ id: 'contacts', label: 'Contacts externes', Icon: Building2 });
  }
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
  const [view, setView] = useState('tasks');
  const [connectedAs, setConnectedAs] = useState('');
  const [taskModal, setTaskModal] = useState(null);
  const [memberModal, setMemberModal] = useState(null);
  const [projectModal, setProjectModal] = useState(null);
  const [apptModal, setApptModal] = useState(null);
  const [contactModal, setContactModal] = useState(null);
  const [requestModal, setRequestModal] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);

  const myEmail = (session?.user?.email || '').toLowerCase();

  useEffect(() => {
    (async () => {
      const data = await loadAll();
      if (Object.values(data).some(r => r.error)) { setLoadError(true); setLoading(false); return; }
      let m = data.members.items, p = data.projects.items, t = data.tasks.items, a = data.appointments.items, ec = data.externalContacts.items, tr = data.taskRequests.items;
      if (m.length === 0) { m = seedMembers(myEmail); await insertRows('members', m); }
      if (p.length === 0) { p = seedProjects(m); await insertRows('projects', p); }
      if (t.length === 0) { t = seedTasks(m, p); await insertRows('tasks', t); }
      if (ec.length === 0) { ec = seedExternalContacts(); await insertRows('externalContacts', ec); }
      if (a.length === 0) { a = seedAppointments(m, ec); await insertRows('appointments', a); }
      setMembers(m); setProjects(p); setTasks(t); setAppointments(a); setExternalContacts(ec); setTaskRequests(tr);
      const matched = m.find(x => (x.email || '').toLowerCase() === myEmail);
      if (matched) {
        setConnectedAs(matched.id);
        setView(matched.accessLevel === 'manager' ? 'dashboard' : 'tasks');
      } else { setNotRecognized(true); }
      setLoading(false);
    })();
  }, []);

  const currentMember = members.find(m => m.id === connectedAs);
  const perm = permissionsFor(currentMember?.accessLevel || 'utilisateur');
  const nav = navFor(perm);

  const saveTask = (t) => {
    const existing = tasks.find(x => x.id === t.id);
    const justCompleted = existing && existing.status !== 'termine' && t.status === 'termine';
    setTasks(prev => existing ? prev.map(x => x.id === t.id ? t : x) : [...prev, t]);
    upsertRow('tasks', t);
    if (justCompleted && t.repeatUnit && t.repeatUnit !== 'aucune') {
      const clone = { ...t, id: uid(), status: 'a_faire', createdAt: todayISO(),
        startDate: shiftByRepeat(t.startDate, t.repeatUnit, t.repeatEvery), deadline: shiftByRepeat(t.deadline, t.repeatUnit, t.repeatEvery) };
      setTasks(prev => [...prev, clone]);
      upsertRow('tasks', clone);
    }
    setTaskModal(null);
  };
  const deleteTask = (id) => { setTasks(prev => prev.filter(x => x.id !== id)); deleteRow('tasks', id); setTaskModal(null); };
  const claimTask = (taskId) => {
    const updated = { ...tasks.find(t => t.id === taskId), assigneeId: connectedAs };
    if (updated.status === 'a_faire') updated.status = 'en_cours';
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t));
    upsertRow('tasks', updated);
    setTaskModal(null);
  };
  const duplicateTask = (original) => {
    const clone = { ...original, id: uid(), title: `${original.title} (copie)`, status: 'a_faire', createdAt: todayISO() };
    setTasks(prev => [...prev, clone]);
    upsertRow('tasks', clone);
    setTaskModal({ task: clone });
  };
  const updateRaci = (taskId, raci) => {
    const updated = { ...tasks.find(t => t.id === taskId), raci };
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t));
    upsertRow('tasks', updated);
  };

  const importMembers = (newMembers) => {
    setMembers(prev => [...prev, ...newMembers]);
    insertRows('members', newMembers);
  };

  const saveMember = (m) => {
    const exists = members.some(x => x.id === m.id);
    setMembers(prev => exists ? prev.map(x => x.id === m.id ? m : x) : [...prev, m]);
    upsertRow('members', m);
    setMemberModal(null);
  };
  const deleteMember = (id) => {
    setMembers(prev => prev.filter(x => x.id !== id));
    deleteRow('members', id);

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

  const saveProject = (projectObj, governanceTasks) => {
    const exists = projects.some(p => p.id === projectObj.id);
    setProjects(prev => exists ? prev.map(p => p.id === projectObj.id ? projectObj : p) : [...prev, projectObj]);
    upsertRow('projects', projectObj);
    if (governanceTasks && governanceTasks.length) {
      setTasks(prev => [...prev, ...governanceTasks]);
      insertRows('tasks', governanceTasks);
    }
    setProjectModal(null);
  };
  const deleteProject = (id) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    deleteRow('projects', id);
    const affectedTasks = tasks.filter(t => t.projectId === id);
    if (affectedTasks.length) {
      const affectedIds = new Set(affectedTasks.map(t => t.id));
      setTasks(prev => prev.filter(t => !affectedIds.has(t.id)));
      affectedTasks.forEach(t => deleteRow('tasks', t.id));
    }
    setProjectModal(null);
  };

  const saveAppt = (a) => {
    const exists = appointments.some(x => x.id === a.id);
    setAppointments(prev => exists ? prev.map(x => x.id === a.id ? a : x) : [...prev, a]);
    upsertRow('appointments', a);
    setApptModal(null);
  };
  const deleteAppt = (id) => { setAppointments(prev => prev.filter(x => x.id !== id)); deleteRow('appointments', id); setApptModal(null); };

  const saveContact = (c) => {
    const exists = externalContacts.some(x => x.id === c.id);
    setExternalContacts(prev => exists ? prev.map(x => x.id === c.id ? c : x) : [...prev, c]);
    upsertRow('externalContacts', c);
    setContactModal(null);
  };
  const deleteContact = (id) => {
    setExternalContacts(prev => prev.filter(x => x.id !== id));
    deleteRow('externalContacts', id);
    const affectedAppts = appointments.filter(a => (a.externalParticipants || []).includes(id));
    if (affectedAppts.length) {
      const updated = affectedAppts.map(a => ({ ...a, externalParticipants: (a.externalParticipants || []).filter(p => p !== id) }));
      setAppointments(prev => prev.map(a => updated.find(u => u.id === a.id) || a));
      upsertRows('appointments', updated);
    }
    setContactModal(null);
  };

  const saveRequest = (r) => { setTaskRequests(prev => [...prev, r]); upsertRow('taskRequests', r); setRequestModal(null); };
  const approveRequest = (id) => {
    const req = taskRequests.find(r => r.id === id); if (!req) return;
    if (req.kind === 'rendez_vous') {
      const newAppt = {
        id: uid(), title: req.title, date: req.deadline || todayISO(), time: req.time || '10:00', location: req.location || '',
        participants: req.origin === 'interne' && req.requesterMemberId ? [req.requesterMemberId] : [],
        externalParticipants: req.origin === 'externe' && req.requesterContactId ? [req.requesterContactId] : [],
        notes: req.description || '',
      };
      setAppointments(prev => [...prev, newAppt]);
      upsertRow('appointments', newAppt);
    } else {
      const newTask = {
        id: uid(), title: req.title, description: req.description, projectId: req.projectId || '',
        assignMode: 'individuel', assigneeId: req.origin === 'interne' ? (req.requesterMemberId || '') : '', pool: [], raci: {},
        priority: req.priority, importance: req.importance, scope: 'courte', status: 'a_faire',
        startDate: '', deadline: req.deadline, createdAt: todayISO(), repeatUnit: 'aucune', repeatEvery: 1,
      };
      setTasks(prev => [...prev, newTask]);
      upsertRow('tasks', newTask);
    }
    const updatedReq = { ...req, status: 'approuvee' };
    setTaskRequests(prev => prev.map(r => r.id === id ? updatedReq : r));
    upsertRow('taskRequests', updatedReq);
  };
  const rejectRequest = (id, comment) => {
    const req = taskRequests.find(r => r.id === id); if (!req) return;
    const updated = { ...req, status: 'refusee', comment };
    setTaskRequests(prev => prev.map(r => r.id === id ? updated : r));
    upsertRow('taskRequests', updated);
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
      <div className="w-56 shrink-0 bg-[#0F1B33] text-white flex flex-col">
        <div className="px-5 py-5 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center font-bold text-sm" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>R</div>
          <span className="font-semibold tracking-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Mes projets</span>
        </div>
        <nav className="flex-1 px-2.5 space-y-0.5 overflow-y-auto">
          {nav.map(n => (
            <button key={n.id} onClick={() => setView(n.id)} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${view === n.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>
              <n.Icon size={16} /> {n.label}
              {n.id === 'requests' && perm.canReviewRequests && pendingRequests > 0 && <span className="ml-auto bg-amber-500 text-white text-[10px] font-semibold rounded-full w-4 h-4 flex items-center justify-center">{pendingRequests}</span>}
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-white/5">
          <div className="flex items-center gap-2 px-2 mb-2">
            {currentMember && <Avatar name={currentMember.name} size={26} />}
            <div className="min-w-0 flex-1"><div className="text-xs font-medium text-white truncate">{currentMember?.name}</div><div className="text-[10px] text-slate-400 truncate">{myEmail}</div></div>
          </div>
          <button onClick={onSignOut} className="w-full text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-2.5 py-2 flex items-center justify-center gap-1.5"><Lock size={12} /> Se déconnecter</button>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
          <h2 className="font-semibold text-slate-800 text-lg" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{nav.find(n => n.id === view)?.label}</h2>
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
          {view === 'dashboard' && <Dashboard tasks={tasks} members={members} appointments={appointments} connectedAs={connectedAs} openTask={(t) => setTaskModal({ task: t })} onClaim={claimTask} />}
          {view === 'tasks' && <TasksView tasks={tasks} members={members} projects={projects} perm={perm} currentMemberId={connectedAs} scope={perm.isManager ? 'all' : 'mine'} openTask={(t) => setTaskModal({ task: t })} newTask={() => setTaskModal({ task: null })} newProject={() => setProjectModal({ project: null })} editProject={(p) => setProjectModal({ project: p })} />}
          {view === 'planning' && <PlanningView members={members} tasks={tasks} projects={projects} appointments={appointments} perm={perm} currentMemberId={connectedAs} openTask={(t) => setTaskModal({ task: t })} openAppt={(a) => setApptModal({ appointment: a })} newAppt={() => setApptModal({ appointment: null })} />}
          {view === 'gantt' && <GanttView tasks={tasks} members={members}
            projects={perm.isManager ? projects : projects.filter(p => myProjectIds(connectedAs, tasks, projects).has(p.id))}
            openTask={(t) => setTaskModal({ task: t })} />}
          {view === 'raci' && <RaciView tasks={tasks} members={members} perm={perm}
            projects={perm.isManager ? projects : projects.filter(p => myProjectIds(connectedAs, tasks, projects).has(p.id))}
            updateRaci={updateRaci} />}
          {view === 'priorisation' && <PrioritisationView tasks={perm.isManager ? tasks : tasks.filter(t => myProjectIds(connectedAs, tasks, projects).has(t.projectId) || isTaskOfMine(t, connectedAs))} members={members} openTask={(t) => setTaskModal({ task: t })} />}
          {view === 'requests' && <RequestsView requests={perm.isManager ? taskRequests : perm.isReferent ? taskRequests.filter(r => teamOfProjects(myProjectIds(connectedAs, tasks, projects), tasks, projects).has(r.requesterMemberId)) : taskRequests.filter(r => r.requesterMemberId === connectedAs)} members={members} externalContacts={externalContacts} perm={perm} onApprove={approveRequest} onReject={rejectRequest} newRequest={() => setRequestModal({})} />}
          {view === 'team' && <TeamView members={members} tasks={tasks} perm={perm} editMember={(m) => setMemberModal({ member: m })} newMember={() => setMemberModal({ member: null })} onImport={importMembers} />}
          {view === 'contacts' && <ContactsView contacts={externalContacts} perm={perm} editContact={(c) => setContactModal({ contact: c })} newContact={() => setContactModal({ contact: null })} />}
        </div>
      </div>

      {taskModal && <TaskModal task={taskModal.task} members={members} projects={projects} perm={perm} currentMemberId={connectedAs} onSave={saveTask} onDelete={deleteTask} onClaim={claimTask} onDuplicate={duplicateTask} onClose={() => setTaskModal(null)} />}
      {memberModal && perm.canManageTeam && <MemberModal member={memberModal.member} onSave={saveMember} onDelete={deleteMember} onClose={() => setMemberModal(null)} />}
      {projectModal && perm.canCreateProject && <ProjectModal project={projectModal.project} members={members} tasks={tasks} currentMemberId={connectedAs} onSave={saveProject} onDelete={deleteProject} onClose={() => setProjectModal(null)} />}
      {apptModal && <AppointmentModal appointment={apptModal.appointment} members={members} externalContacts={externalContacts} readOnly={!perm.canManageAppointments} onSave={saveAppt} onDelete={deleteAppt} onClose={() => setApptModal(null)} />}
      {contactModal && perm.canManageContacts && <ContactModal contact={contactModal.contact} onSave={saveContact} onDelete={deleteContact} onClose={() => setContactModal(null)} />}
      {requestModal && <RequestModal members={members} externalContacts={externalContacts} projects={projects} currentMemberId={connectedAs} onSave={saveRequest} onClose={() => setRequestModal(null)} />}
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
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center font-bold text-white text-sm" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>R</div>
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

export default function AuthGate() {
  const [session, setSession] = useState(undefined);
  const [needsPassword, setNeedsPassword] = useState(() => /type=(invite|recovery)/.test(window.location.hash));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="min-h-screen flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2" size={18} /> Chargement…</div>;
  if (!session) return <Login />;
  if (needsPassword) return <SetPasswordForm onDone={() => setNeedsPassword(false)} />;
  return <ReferentApp session={session} onSignOut={() => supabase.auth.signOut()} />;
}
