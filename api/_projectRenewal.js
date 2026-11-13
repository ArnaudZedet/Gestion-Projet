// Clôture automatique + renouvellement des projets récurrents non clôturés à
// temps (voir cron-daily.js, étape 1). Reprend — en version simplifiée, sans
// React ni état client — la même logique que le renouvellement déclenché
// côté appli quand un utilisateur marque un projet récurrent "Terminé" (voir
// saveProject dans src/App.jsx) : décalage des dates selon la cadence du
// projet (ou de son unique tâche récurrente), tirage équitable du prochain
// responsable et des prochains assignés de tâche ("sac tournant", en
// écartant si possible les absents de la semaine sur Swappy), copie des
// tâches avec leurs dates décalées.
//
// Simplification assumée par rapport à la version client : pas de
// répartition par charge de travail (loadFn) pour départager deux personnes
// à qui c'est également le tour — on prend la première personne éligible
// (et présente si on a l'info Swappy). L'équité du sac tournant (personne ne
// repasse avant que tout le monde soit passé) reste, elle, intacte.

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const toISODate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return toISODate(d); };
const addMonths = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setMonth(d.getMonth() + n); return toISODate(d); };
const addYears = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setFullYear(d.getFullYear() + n); return toISODate(d); };
const shiftByRepeat = (iso, unit, every) => {
  if (!iso) return iso;
  const n = Math.max(1, every || 1);
  if (unit === 'jour') return addDays(iso, n);
  if (unit === 'semaine') return addDays(iso, n * 7);
  if (unit === 'mois') return addMonths(iso, n);
  if (unit === 'an') return addYears(iso, n);
  return iso;
};
const startOfWeekISO = (iso) => { const dow = new Date(`${iso}T00:00:00`).getDay(); return addDays(iso, dow === 0 ? -6 : 1 - dow); };
const normalizeName = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[‘’ʼ'-]/g, ' ').replace(/\s+/g, ' ').trim();
const shuffleArray = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Interroge directement l'API Swappy (pas besoin de relais : ce code tourne
// déjà côté serveur, avec le jeton en variable d'env) — renvoie null (plutôt
// que de bloquer) si Swappy ne répond pas.
async function fetchSwappyPresenceAdmin(start, end) {
  const token = process.env.SWAPPY_API_TOKEN;
  if (!token || !start || !end) return null;
  try {
    const url = `https://api.planning.swappy.fr/integrations/gare_de_lyon/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const resp = await fetch(url, { headers: { Authorization: token } });
    if (!resp.ok) return null;
    const events = await resp.json();
    return new Set((events || []).map((e) => normalizeName(`${e.user_firstname} ${e.user_lastname}`)));
  } catch {
    return null;
  }
}

function eligibleTeam(team, membersById) {
  return (team || []).filter((id) => {
    const m = membersById[id];
    return !(m?.always_approver || m?.role === 'Manager');
  });
}

// "Sac tournant" : chaque membre de l'équipe passe une fois avant qu'un nom
// puisse ressortir une deuxième fois.
function nextRotatedAssignee(state, team, membersById, presentSet) {
  const elig = eligibleTeam(team, membersById);
  if (elig.length === 0) return { assigneeId: state.assigneeId || '', rotationPool: [] };
  let pool = (state.rotationPool || []).filter((id) => elig.includes(id));
  if (pool.length === 0) {
    pool = shuffleArray(elig);
    if (pool.length > 1 && pool[0] === state.assigneeId) [pool[0], pool[1]] = [pool[1], pool[0]];
  }
  const candidateIdx = pool.map((_, i) => i).filter((i) => pool[i] !== state.assigneeId);
  let searchIn = candidateIdx.length > 0 ? candidateIdx : pool.map((_, i) => i);
  if (presentSet) {
    const presentIn = searchIn.filter((i) => presentSet.has(normalizeName(membersById[pool[i]]?.name)));
    if (presentIn.length > 0) searchIn = presentIn;
  }
  const pickIdx = searchIn[0];
  const assigneeId = pool[pickIdx];
  const rest = [...pool.slice(0, pickIdx), ...pool.slice(pickIdx + 1)];
  return { assigneeId, rotationPool: rest };
}

// Même principe, mais pour désigner plusieurs responsables tournants à la fois.
function nextRotatedAssignees(prevIds, prevPool, count, team, membersById, presentSet) {
  const elig = eligibleTeam(team, membersById);
  if (elig.length === 0) return { assigneeIds: [], rotationPool: [] };
  const n = Math.max(1, Math.min(count, elig.length));
  let pool = (prevPool || []).filter((id) => elig.includes(id));
  const picked = [];
  while (picked.length < n) {
    if (pool.length === 0) pool = shuffleArray(elig.filter((id) => !picked.includes(id)));
    if (pool.length === 0) pool = shuffleArray(elig);
    let candidates = pool.filter((id) => !picked.includes(id));
    if (candidates.length === 0) { pool = []; continue; }
    if (presentSet) {
      const presentCandidates = candidates.filter((id) => presentSet.has(normalizeName(membersById[id]?.name)));
      if (presentCandidates.length > 0) candidates = presentCandidates;
    }
    const id = candidates[0];
    picked.push(id);
    pool = pool.filter((x) => x !== id);
  }
  return { assigneeIds: picked, rotationPool: pool };
}

function rotateRaciResponsible(task, team, membersById, presentSet) {
  const currentR = Object.entries(task.raci || {}).find(([, r]) => r === 'R')?.[0] || '';
  const { assigneeId, rotationPool } = nextRotatedAssignee({ assigneeId: currentR, rotationPool: task.rotationPool }, team, membersById, presentSet);
  const raci = { ...(task.raci || {}) };
  Object.keys(raci).forEach((id) => { if (raci[id] === 'R') delete raci[id]; });
  if (assigneeId) raci[assigneeId] = 'R';
  return { raci, rotationPool };
}

// Cadence effective d'un projet : la sienne propre, ou — s'il n'en a pas —
// celle de son unique tâche récurrente (même règle que côté client, voir
// "effectiveRepeat" dans saveProject). Renvoie unit:'aucune' si rien ne permet
// de le renouveler.
function effectiveRepeatOf(project, tasks) {
  if (project.repeat_unit && project.repeat_unit !== 'aucune') {
    return { unit: project.repeat_unit, every: project.repeat_every || 1, startDate: project.start_date, endDate: project.end_date };
  }
  const soleRepeating = (tasks || []).filter((t) => t.repeat_unit && t.repeat_unit !== 'aucune');
  if (soleRepeating.length === 1) {
    const t = soleRepeating[0];
    return { unit: t.repeat_unit, every: t.repeat_every || 1, startDate: project.start_date || t.start_date, endDate: project.end_date || t.deadline };
  }
  return { unit: 'aucune', every: 1, startDate: null, endDate: null };
}

// Force la clôture d'un projet en retard et lance son cycle suivant (projet +
// copie de ses tâches, dates décalées, responsable(s)/assignés qui tournent).
// Ne fait rien (renewed: false) si le projet n'a pas de cadence exploitable.
export async function autoCloseAndRenewProject({ supabaseAdmin, project, tasks, membersById }) {
  const effectiveRepeat = effectiveRepeatOf(project, tasks);
  if (effectiveRepeat.unit === 'aucune' || !effectiveRepeat.startDate || !effectiveRepeat.endDate) {
    return { renewed: false };
  }

  const nextStart = shiftByRepeat(effectiveRepeat.startDate, effectiveRepeat.unit, effectiveRepeat.every);
  const nextEnd = shiftByRepeat(effectiveRepeat.endDate, effectiveRepeat.unit, effectiveRepeat.every);
  const cycleWeekStart = startOfWeekISO(nextStart);
  const presentSet = await fetchSwappyPresenceAdmin(cycleWeekStart, addDays(cycleWeekStart, 6));

  let newResponsibleIds = project.responsible_ids || [];
  let newResponsibleRotationPool = project.responsible_rotation_pool || [];
  if (project.rotate_responsible && newResponsibleIds.length > 0) {
    const count = project.rotate_responsible_count || newResponsibleIds.length;
    const rotated = nextRotatedAssignees(newResponsibleIds, project.responsible_rotation_pool, count, project.team_ids, membersById, presentSet);
    if (rotated.assigneeIds.length > 0) {
      newResponsibleIds = rotated.assigneeIds;
      newResponsibleRotationPool = rotated.rotationPool;
    }
  }

  const newProjectId = crypto.randomUUID();
  const newProjectRow = {
    id: newProjectId, name: project.name, description: project.description, color: project.color, service: project.service,
    team_ids: project.team_ids, external_ids: project.external_ids,
    start_date: nextStart, end_date: nextEnd, status: 'en_cours',
    priority: project.priority, importance: project.importance,
    repeat_unit: effectiveRepeat.unit, repeat_every: effectiveRepeat.every,
    late_notified_at: null, start_reminder_sent: false, end_reminder_sent: false,
    responsible_ids: newResponsibleIds, rotate_responsible: project.rotate_responsible,
    rotate_responsible_count: project.rotate_responsible_count, responsible_rotation_pool: newResponsibleRotationPool,
    pending_approval: false, created_by: project.created_by,
  };
  const { error: insProjErr } = await supabaseAdmin.from('projects').insert(newProjectRow);
  if (insProjErr) throw new Error(insProjErr.message);

  // Clôt l'ancien projet et, avec lui, toutes ses tâches encore ouvertes
  // (même règle que côté client : un projet terminé ne laisse pas de tâche
  // "Programmée"/"En cours" derrière lui).
  const { error: closeProjErr } = await supabaseAdmin.from('projects').update({ status: 'termine', late_notified_at: new Date().toISOString() }).eq('id', project.id);
  if (closeProjErr) throw new Error(closeProjErr.message);
  const openTaskIds = (tasks || []).filter((t) => t.status !== 'termine').map((t) => t.id);
  if (openTaskIds.length) {
    const { error: closeTasksErr } = await supabaseAdmin.from('tasks').update({ status: 'termine' }).in('id', openTaskIds);
    if (closeTasksErr) throw new Error(closeTasksErr.message);
  }

  const clonedRows = (tasks || []).map((t) => {
    const newStart = shiftByRepeat(t.start_date, effectiveRepeat.unit, effectiveRepeat.every);
    const newDeadline = shiftByRepeat(t.deadline, effectiveRepeat.unit, effectiveRepeat.every);
    const clone = {
      id: crypto.randomUUID(), title: t.title, description: t.description, project_id: newProjectId,
      assign_mode: t.assign_mode, assignee_id: t.assignee_id, pool: t.pool, raci: t.raci,
      priority: t.priority, importance: t.importance, scope: t.scope, status: 'a_faire',
      start_date: newStart, deadline: newDeadline, time: t.time,
      repeat_unit: t.repeat_unit, repeat_every: t.repeat_every, avoid_days: t.avoid_days,
      rotate_assignee: t.rotate_assignee, rotation_pool: t.rotation_pool,
      is_governance: t.is_governance, governance_type: t.governance_type, created_at: new Date().toISOString().slice(0, 10),
    };
    if (t.rotate_assignee && t.assign_mode === 'individuel') {
      const { assigneeId, rotationPool } = nextRotatedAssignee({ assigneeId: t.assignee_id, rotationPool: t.rotation_pool }, project.team_ids, membersById, presentSet);
      clone.assignee_id = assigneeId;
      clone.rotation_pool = rotationPool;
    } else if (t.rotate_assignee && t.assign_mode === 'equipe') {
      const { raci, rotationPool } = rotateRaciResponsible({ raci: t.raci, rotationPool: t.rotation_pool }, project.team_ids, membersById, presentSet);
      clone.raci = raci;
      clone.rotation_pool = rotationPool;
    } else if (t.assign_mode === 'individuel' && newResponsibleIds[0] && t.assignee_id && (project.responsible_ids || []).includes(t.assignee_id)) {
      clone.assignee_id = newResponsibleIds[0];
    } else if (t.assign_mode === 'equipe' && newResponsibleIds[0]) {
      const currentR = Object.entries(t.raci || {}).find(([, r]) => r === 'R')?.[0] || '';
      if (currentR && (project.responsible_ids || []).includes(currentR)) {
        const raci = { ...(t.raci || {}) };
        Object.keys(raci).forEach((id) => { if (raci[id] === 'R') delete raci[id]; });
        raci[newResponsibleIds[0]] = 'R';
        clone.raci = raci;
      }
    }
    return clone;
  });
  if (clonedRows.length) {
    const { error: insTasksErr } = await supabaseAdmin.from('tasks').insert(clonedRows);
    if (insTasksErr) throw new Error(insTasksErr.message);
  }

  return { renewed: true, newProjectId, newStartDate: nextStart, newEndDate: nextEnd, newResponsibleIds, oldResponsibleIds: project.responsible_ids || [] };
}

export { escapeHtml };
