import { supabaseAdmin } from './_supabaseAdmin.js';
import { sendEmail } from './_resend.js';
import { requireCron } from './_cron.js';

// Noms de projet et de collaborateur sont saisis par les utilisateurs et
// finissent tels quels dans du HTML envoyé par email — échapper avant
// interpolation évite qu'un nom contenant "<" ou "&" casse le mail, ou
// qu'un contenu malveillant s'affiche/s'exécute chez le destinataire.
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

// Le jour ouvré précédant une date donnée (weekend exclu) — pour le rappel
// de démarrage de projet, qui doit tomber sur un jour où le digest part.
function prevBusinessDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Tourne une fois par jour à 13h heure de Paris (voir vercel.json — l'heure
// UTC choisie tient compte du changement heure été/hiver à ±1h près).
// Fait quatre choses, regroupées dans le même cron pour rester dans la
// limite de 2 tâches planifiées du plan Vercel Hobby :
//
// 1. Alerte manager sur les projets en retard (une seule fois par projet,
//    tant que rien ne change — voir late_notified_at).
// 2. Rappel au(x) responsable(s) d'un projet qui démarre le prochain jour
//    ouvré (une seule fois par cycle — voir start_reminder_sent), déposé
//    dans la file d'attente pour partir dans le digest du jour même.
// 3. Rappel au(x) responsable(s) d'un projet qui se termine aujourd'hui
//    même, pour penser à le marquer "Terminé" (une seule fois par cycle —
//    voir end_reminder_sent).
// 4. Envoi groupé des notifications en attente (affectation à un projet,
//    tâche assignée, rotation de responsable, rappels...) : un seul email
//    par destinataire, listant tout ce qui s'est accumulé depuis le
//    dernier envoi, au lieu d'un email à chaque événement.
export default async function handler(req, res) {
  if (!requireCron(req)) return res.status(401).json({ error: 'Non autorisé' });

  const result = { lateProjects: 0, startReminders: 0, endReminders: 0, digestRecipients: 0, digestNotifications: 0 };

  try {
    // --- 1. Projets en retard ---
    const today = new Date().toISOString().slice(0, 10);
    const { data: lateProjects, error: projErr } = await supabaseAdmin
      .from('projects')
      .select('id, name, end_date')
      .lt('end_date', today)
      .neq('status', 'termine')
      .is('late_notified_at', null);
    if (projErr) throw new Error(projErr.message);

    if (lateProjects && lateProjects.length > 0) {
      const { data: managers, error: memErr } = await supabaseAdmin.from('members').select('email').eq('access_level', 'manager');
      if (memErr) throw new Error(memErr.message);
      const managerEmails = (managers || []).map((m) => m.email).filter(Boolean);

      if (managerEmails.length) {
        const plural = lateProjects.length > 1;
        const items = lateProjects.map((p) => `<li><strong>${escapeHtml(p.name)}</strong> — fin prévue le ${p.end_date}</li>`).join('');
        const html = `<p>${lateProjects.length} projet${plural ? 's ont dépassé' : ' a dépassé'} sa date de fin sans être marqué${plural ? 's' : ''} "Terminé" :</p><ul>${items}</ul>`;
        await sendEmail({ to: managerEmails, subject: `${lateProjects.length} projet${plural ? 's' : ''} en retard`, html });
      }
      await supabaseAdmin.from('projects').update({ late_notified_at: new Date().toISOString() }).in('id', lateProjects.map((p) => p.id));
      result.lateProjects = lateProjects.length;
    }

    // --- 2. Rappel de démarrage (veille ouvrée) ---
    const { data: startingProjects, error: startErr } = await supabaseAdmin
      .from('projects')
      .select('id, name, start_date, responsible_ids')
      .eq('status', 'en_cours')
      .eq('start_reminder_sent', false)
      .not('start_date', 'is', null);
    if (startErr) throw new Error(startErr.message);

    const dueProjects = (startingProjects || []).filter((p) => prevBusinessDay(p.start_date) === today);
    if (dueProjects.length > 0) {
      const responsibleIds = [...new Set(dueProjects.flatMap((p) => p.responsible_ids || []))];
      if (responsibleIds.length) {
        const { data: resp, error: respErr } = await supabaseAdmin.from('members').select('id, name, email').in('id', responsibleIds);
        if (respErr) throw new Error(respErr.message);
        const membersById = Object.fromEntries((resp || []).map((m) => [m.id, m]));
        const queueRows = [];
        dueProjects.forEach((p) => {
          (p.responsible_ids || []).forEach((rid) => {
            const rm = membersById[rid];
            if (rm?.email) {
              queueRows.push({
                id: crypto.randomUUID(),
                recipient_email: rm.email,
                subject: `Le projet « ${p.name} » démarre demain`,
                html: `<p>Bonjour ${escapeHtml(rm.name)},</p><p>Le projet <strong>${escapeHtml(p.name)}</strong>, dont vous êtes responsable, démarre le ${p.start_date}.</p>`,
              });
            }
          });
        });
        if (queueRows.length) {
          const { error: insErr } = await supabaseAdmin.from('notification_queue').insert(queueRows);
          if (insErr) throw new Error(insErr.message);
        }
      }
      await supabaseAdmin.from('projects').update({ start_reminder_sent: true }).in('id', dueProjects.map((p) => p.id));
      result.startReminders = dueProjects.length;
    }

    // --- 3. Rappel de fin (jour même) ---
    const { data: endingProjects, error: endErr } = await supabaseAdmin
      .from('projects')
      .select('id, name, end_date, responsible_ids')
      .eq('status', 'en_cours')
      .eq('end_reminder_sent', false)
      .eq('end_date', today);
    if (endErr) throw new Error(endErr.message);

    if (endingProjects && endingProjects.length > 0) {
      const responsibleIds = [...new Set(endingProjects.flatMap((p) => p.responsible_ids || []))];
      if (responsibleIds.length) {
        const { data: resp, error: respErr } = await supabaseAdmin.from('members').select('id, name, email').in('id', responsibleIds);
        if (respErr) throw new Error(respErr.message);
        const membersById = Object.fromEntries((resp || []).map((m) => [m.id, m]));
        const queueRows = [];
        endingProjects.forEach((p) => {
          (p.responsible_ids || []).forEach((rid) => {
            const rm = membersById[rid];
            if (rm?.email) {
              queueRows.push({
                id: crypto.randomUUID(),
                recipient_email: rm.email,
                subject: `Le projet « ${p.name} » se termine aujourd'hui`,
                html: `<p>Bonjour ${escapeHtml(rm.name)},</p><p>Le projet <strong>${escapeHtml(p.name)}</strong>, dont vous êtes responsable, arrive à échéance aujourd'hui (${p.end_date}). S'il est terminé, pensez à le marquer "Terminé".</p>`,
              });
            }
          });
        });
        if (queueRows.length) {
          const { error: insErr } = await supabaseAdmin.from('notification_queue').insert(queueRows);
          if (insErr) throw new Error(insErr.message);
        }
      }
      await supabaseAdmin.from('projects').update({ end_reminder_sent: true }).in('id', endingProjects.map((p) => p.id));
      result.endReminders = endingProjects.length;
    }

    // --- 4. Envoi groupé des notifications en attente ---
    const { data: queued, error: qErr } = await supabaseAdmin
      .from('notification_queue')
      .select('*')
      .order('created_at', { ascending: true });
    if (qErr) throw new Error(qErr.message);

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
  } catch (e) {
    await alertAdmins('cron-daily', e);
    return res.status(500).json({ error: e.message });
  }
}
