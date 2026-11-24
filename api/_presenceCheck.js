// Vérification de présence des responsables de projet sur le planning Swappy
// (voir cron-daily.js, étape 6 — les lundis et mercredis uniquement) : si un
// responsable de projet en cours n'apparaît plus dans le planning de la
// semaine, on désigne à sa place un membre de l'équipe du projet qui, lui, est
// présent, on met à jour les tâches du projet qui suivaient l'ancien
// responsable, et on prévient le nouveau responsable par mail (en copie
// Caroline et Arnaud).
//
// Prudence : si Swappy ne répond pas ou renvoie un planning entièrement vide
// (semaine pas encore publiée ?), on ne touche à rien — mieux vaut ne rien
// faire que remplacer tout le monde à tort.
import { sendEmail } from './_resend.js';
import { escapeHtml, fetchSwappyPresenceAdmin, normalizeName, eligibleTeam, addDays } from './_projectRenewal.js';

export async function checkProjectResponsiblePresence({ supabaseAdmin, membersById, ccEmails, today }) {
  const out = { checked: 0, replaced: 0, unresolved: 0, skipped: false };
  const windowEnd = addDays(today, 6);
  const presentSet = await fetchSwappyPresenceAdmin(today, windowEnd);
  if (!presentSet || presentSet.size === 0) { out.skipped = true; return out; }
  const isPresent = (id) => presentSet.has(normalizeName(membersById[id]?.name));

  const { data: projects, error } = await supabaseAdmin
    .from('projects').select('*')
    .eq('status', 'en_cours').eq('pending_approval', false)
    .lte('start_date', windowEnd).gte('end_date', today);
  if (error) throw new Error(error.message);

  const unresolvedLines = [];
  for (const project of projects || []) {
    const responsibles = project.responsible_ids || [];
    if (responsibles.length === 0) continue;
    out.checked += 1;
    let newIds = [...responsibles];
    let pool = [...(project.responsible_rotation_pool || [])];
    const swaps = []; // { oldId, newId }

    for (const oldId of responsibles) {
      if (isPresent(oldId)) continue;
      const elig = eligibleTeam(project.team_ids, membersById).filter((id) => !newIds.includes(id) && isPresent(id));
      if (elig.length === 0) { unresolvedLines.push(`<li><strong>${escapeHtml(project.name)}</strong> — ${escapeHtml(membersById[oldId]?.name || 'responsable')} absent(e) du planning, aucun remplaçant présent dans l'équipe</li>`); out.unresolved += 1; continue; }
      const fromPool = pool.find((id) => elig.includes(id));
      const newId = fromPool || elig[0];
      newIds = newIds.map((id) => (id === oldId ? newId : id));
      pool = pool.filter((id) => id !== newId);
      swaps.push({ oldId, newId });
    }
    if (swaps.length === 0) continue;

    const { error: upErr } = await supabaseAdmin.from('projects')
      .update({ responsible_ids: newIds, responsible_rotation_pool: pool }).eq('id', project.id);
    if (upErr) throw new Error(upErr.message);

    // Les tâches ouvertes qui suivaient l'ancien responsable suivent le nouveau.
    const { data: tasks, error: tErr } = await supabaseAdmin.from('tasks').select('*').eq('project_id', project.id).neq('status', 'termine');
    if (tErr) throw new Error(tErr.message);
    for (const t of tasks || []) {
      for (const { oldId, newId } of swaps) {
        if (t.assign_mode === 'individuel' && t.assignee_id === oldId) {
          await supabaseAdmin.from('tasks').update({ assignee_id: newId }).eq('id', t.id);
        } else if (t.assign_mode === 'equipe' && (t.raci || {})[oldId] === 'R') {
          const raci = { ...t.raci };
          delete raci[oldId];
          raci[newId] = 'R';
          await supabaseAdmin.from('tasks').update({ raci }).eq('id', t.id);
          t.raci = raci;
        }
      }
    }

    for (const { oldId, newId } of swaps) {
      const newM = membersById[newId];
      const oldM = membersById[oldId];
      const to = newM?.email ? [newM.email] : ccEmails;
      const cc = newM?.email ? ccEmails.filter((e) => e !== newM.email) : [];
      if (!to.length) continue;
      await sendEmail({
        to, cc,
        subject: `Nouvelle attribution — projet « ${project.name} »`,
        html: `<p>Bonjour ${escapeHtml(newM?.name || '')},</p>` +
          `<p>${escapeHtml(oldM?.name || 'Le responsable précédent')} n'apparaissant plus dans le planning Swappy, vous êtes désigné(e) <strong>responsable du projet « ${escapeHtml(project.name)} »</strong> (du ${project.start_date} au ${project.end_date}).</p>` +
          `<p>Les tâches du projet qui lui étaient attribuées vous ont été transférées.</p>`,
      });
      out.replaced += 1;
    }
  }

  if (unresolvedLines.length && ccEmails.length) {
    await sendEmail({
      to: ccEmails,
      subject: 'Responsable de projet absent du planning — à réattribuer',
      html: `<p>Ces projets ont un responsable absent du planning Swappy, sans remplaçant disponible :</p><ul>${unresolvedLines.join('')}</ul>`,
    });
  }
  return out;
}
