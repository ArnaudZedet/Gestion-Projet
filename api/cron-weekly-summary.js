import { supabaseAdmin } from './_supabaseAdmin.js';
import { sendEmail } from './_resend.js';
import { requireCron } from './_cron.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Un cron qui échoue silencieusement (webhook cassé, quota dépassé, erreur
// Supabase...) ne prévient personne — c'est exactement ce qui s'est produit
// une fois cette année avec le déploiement Vercel. On alerte donc les
// managers par email si ce cron plante, en plus de faire remonter l'erreur
// dans la réponse HTTP (que Vercel journalise).
async function alertAdmins(context, error) {
  try {
    const { data: managers } = await supabaseAdmin.from('members').select('email').eq('access_level', 'manager');
    const managerEmails = (managers || []).map((m) => m.email).filter(Boolean);
    if (!managerEmails.length) return;
    await sendEmail({
      to: managerEmails,
      subject: `Échec du cron ${context}`,
      html: `<p>Le cron <strong>${escapeHtml(context)}</strong> a échoué :</p><pre style="white-space:pre-wrap;font-size:12px;background:#f1f2f4;padding:8px;border-radius:6px;">${escapeHtml(error?.message || String(error))}</pre>`,
    });
  } catch (e) {
    console.error('Échec envoi alerte admin', e.message);
  }
}

// Tourne tous les lundis matin (voir vercel.json) : envoie aux managers un
// récapitulatif des projets en cours (nombre de tâches ouvertes, en retard,
// à échéance dans la semaine).
export default async function handler(req, res) {
  if (!requireCron(req)) return res.status(401).json({ error: 'Non autorisé' });

  try {
    const { data: managers, error: memErr } = await supabaseAdmin.from('members').select('email').eq('access_level', 'manager');
    if (memErr) throw new Error(memErr.message);
    const managerEmails = (managers || []).map((m) => m.email).filter(Boolean);
    if (!managerEmails.length) return res.status(200).json({ ok: true, sent: false });

    const { data: projects, error: projErr } = await supabaseAdmin.from('projects').select('*').neq('status', 'termine');
    if (projErr) throw new Error(projErr.message);
    const { data: tasks, error: taskErr } = await supabaseAdmin.from('tasks').select('*').neq('status', 'termine');
    if (taskErr) throw new Error(taskErr.message);

    const today = new Date().toISOString().slice(0, 10);
    const weekEndDate = new Date();
    weekEndDate.setDate(weekEndDate.getDate() + 7);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);

    const rows = (projects || [])
      .map((p) => {
        const projTasks = (tasks || []).filter((t) => t.project_id === p.id);
        const overdue = projTasks.filter((t) => t.deadline && t.deadline < today).length;
        const dueSoon = projTasks.filter((t) => t.deadline && t.deadline >= today && t.deadline <= weekEnd).length;
        const bits = [`${projTasks.length} tâche${projTasks.length !== 1 ? 's' : ''} ouverte${projTasks.length !== 1 ? 's' : ''}`];
        if (overdue) bits.push(`${overdue} en retard`);
        if (dueSoon) bits.push(`${dueSoon} à échéance cette semaine`);
        return `<li><strong>${escapeHtml(p.name)}</strong> — ${bits.join(', ')}</li>`;
      })
      .join('');

    const count = (projects || []).length;
    const html = `<p>Récapitulatif hebdomadaire — ${count} projet${count !== 1 ? 's' : ''} en cours :</p><ul>${rows || '<li>Aucun projet en cours.</li>'}</ul>`;

    await sendEmail({ to: managerEmails, subject: 'Récapitulatif hebdomadaire des projets', html });
    return res.status(200).json({ ok: true, sent: true, projects: count });
  } catch (e) {
    await alertAdmins('cron-weekly-summary', e);
    return res.status(500).json({ error: e.message });
  }
}
