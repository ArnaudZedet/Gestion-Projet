import { supabaseAdmin } from './_supabaseAdmin.js';
import { sendEmail } from './_resend.js';
import { requireCron } from './_cron.js';

// Tourne une fois par jour à 13h heure de Paris (voir vercel.json — l'heure
// UTC choisie tient compte du changement heure été/hiver à ±1h près).
// Fait deux choses, regroupées dans le même cron pour rester dans la limite
// de 2 tâches planifiées du plan Vercel Hobby :
//
// 1. Alerte manager sur les projets en retard (une seule fois par projet,
//    tant que rien ne change — voir late_notified_at).
// 2. Envoi groupé des notifications en attente (affectation à un projet,
//    tâche assignée, rotation de responsable...) : un seul email par
//    destinataire, listant tout ce qui s'est accumulé depuis le dernier
//    envoi, au lieu d'un email à chaque événement.
export default async function handler(req, res) {
  if (!requireCron(req)) return res.status(401).json({ error: 'Non autorisé' });

  const result = { lateProjects: 0, digestRecipients: 0, digestNotifications: 0 };

  // --- 1. Projets en retard ---
  const today = new Date().toISOString().slice(0, 10);
  const { data: lateProjects, error: projErr } = await supabaseAdmin
    .from('projects')
    .select('id, name, end_date')
    .lt('end_date', today)
    .neq('status', 'termine')
    .is('late_notified_at', null);
  if (projErr) return res.status(500).json({ error: projErr.message });

  if (lateProjects && lateProjects.length > 0) {
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
    result.lateProjects = lateProjects.length;
  }

  // --- 2. Envoi groupé des notifications en attente ---
  const { data: queued, error: qErr } = await supabaseAdmin
    .from('notification_queue')
    .select('*')
    .order('created_at', { ascending: true });
  if (qErr) return res.status(500).json({ error: qErr.message });

  if (queued && queued.length > 0) {
    const byRecipient = {};
    queued.forEach((r) => { (byRecipient[r.recipient_email] = byRecipient[r.recipient_email] || []).push(r); });

    for (const [email, items] of Object.entries(byRecipient)) {
      const html = `<p>Voici ce qui s'est passé aujourd'hui :</p><ul>${items.map((i) => `<li><strong>${i.subject}</strong><br/>${i.html}</li>`).join('')}</ul>`;
      try {
        await sendEmail({ to: [email], subject: `Récapitulatif du jour (${items.length} notification${items.length > 1 ? 's' : ''})`, html });
        result.digestRecipients += 1;
      } catch (e) {
        console.error('Échec envoi digest', email, e.message);
      }
    }
    await supabaseAdmin.from('notification_queue').delete().in('id', queued.map((r) => r.id));
    result.digestNotifications = queued.length;
  }

  return res.status(200).json({ ok: true, ...result });
}
