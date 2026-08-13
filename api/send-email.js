import { requireMember } from './_supabaseAdmin.js';
import { sendEmail } from './_resend.js';

// Relais d'envoi d'email pour les notifications applicatives (affectation à
// un projet, tâche assignée...). Nécessite un compte Resend (resend.com) —
// clé API + expéditeur vérifié en variables d'env RESEND_API_KEY et
// RESEND_FROM.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const member = await requireMember(req);
  if (!member) return res.status(401).json({ error: 'Non authentifié' });

  const { to, subject, html } = req.body || {};
  const recipients = Array.isArray(to) ? to.filter((e) => typeof e === 'string' && e.includes('@')) : [];
  if (!recipients.length || !subject || !html) return res.status(400).json({ error: 'Paramètres manquants' });
  if (recipients.length > 20) return res.status(400).json({ error: 'Trop de destinataires' });

  try {
    await sendEmail({ to: recipients, subject, html });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
