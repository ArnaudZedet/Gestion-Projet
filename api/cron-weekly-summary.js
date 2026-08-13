import { supabaseAdmin } from './_supabaseAdmin.js';
import { sendEmail } from './_resend.js';
import { requireCron } from './_cron.js';

// Tourne tous les lundis matin (voir vercel.json) : envoie aux managers un
// récapitulatif des projets en cours (nombre de tâches ouvertes, en retard,
// à échéance dans la semaine).
export default async function handler(req, res) {
  if (!requireCron(req)) return res.status(401).json({ error: 'Non autorisé' });

  const { data: managers, error: memErr } = await supabaseAdmin.from('members').select('email').eq('access_level', 'manager');
  if (memErr) return res.status(500).json({ error: memErr.message });
  const managerEmails = (managers || []).map((m) => m.email).filter(Boolean);
  if (!managerEmails.length) return res.status(200).json({ ok: true, sent: false });

  const { data: projects, error: projErr } = await supabaseAdmin.from('projects').select('*').neq('status', 'termine');
  if (projErr) return res.status(500).json({ error: projErr.message });
  const { data: tasks, error: taskErr } = await supabaseAdmin.from('tasks').select('*').neq('status', 'termine');
  if (taskErr) return res.status(500).json({ error: taskErr.message });

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
      return `<li><strong>${p.name}</strong> — ${bits.join(', ')}</li>`;
    })
    .join('');

  const count = (projects || []).length;
  const html = `<p>Récapitulatif hebdomadaire — ${count} projet${count !== 1 ? 's' : ''} en cours :</p><ul>${rows || '<li>Aucun projet en cours.</li>'}</ul>`;

  try {
    await sendEmail({ to: managerEmails, subject: 'Récapitulatif hebdomadaire des projets', html });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
  return res.status(200).json({ ok: true, sent: true, projects: count });
}
