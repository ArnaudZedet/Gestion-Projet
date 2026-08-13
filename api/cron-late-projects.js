import { supabaseAdmin } from './_supabaseAdmin.js';
import { sendEmail } from './_resend.js';
import { requireCron } from './_cron.js';

// Tourne une fois par jour (voir vercel.json) : repère les projets dont la
// date de fin est dépassée sans être marqués "Terminé", et prévient les
// managers — une seule fois par projet (late_notified_at), pour ne pas
// spammer tous les jours tant que ce n'est pas corrigé.
export default async function handler(req, res) {
  if (!requireCron(req)) return res.status(401).json({ error: 'Non autorisé' });

  const today = new Date().toISOString().slice(0, 10);
  const { data: lateProjects, error: projErr } = await supabaseAdmin
    .from('projects')
    .select('id, name, end_date')
    .lt('end_date', today)
    .neq('status', 'termine')
    .is('late_notified_at', null);
  if (projErr) return res.status(500).json({ error: projErr.message });
  if (!lateProjects || lateProjects.length === 0) return res.status(200).json({ ok: true, notified: 0 });

  const { data: managers, error: memErr } = await supabaseAdmin.from('members').select('email').eq('access_level', 'manager');
  if (memErr) return res.status(500).json({ error: memErr.message });
  const managerEmails = (managers || []).map((m) => m.email).filter(Boolean);

  if (managerEmails.length) {
    const plural = lateProjects.length > 1;
    const items = lateProjects.map((p) => `<li><strong>${p.name}</strong> — fin prévue le ${p.end_date}</li>`).join('');
    const html = `<p>${lateProjects.length} projet${plural ? 's ont dépassé' : ' a dépassé'} sa date de fin sans être marqué${plural ? 's' : ''} "Terminé" :</p><ul>${items}</ul>`;
    try {
      await sendEmail({ to: managerEmails, subject: `${lateProjects.length} projet${plural ? 's' : ''} en retard`, html });
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  }

  await supabaseAdmin.from('projects').update({ late_notified_at: new Date().toISOString() }).in('id', lateProjects.map((p) => p.id));
  return res.status(200).json({ ok: true, notified: lateProjects.length });
}
