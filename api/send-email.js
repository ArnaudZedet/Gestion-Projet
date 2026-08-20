import { supabaseAdmin, requireMember } from './_supabaseAdmin.js';
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
  const requested = Array.isArray(to) ? to.filter((e) => typeof e === 'string' && e.includes('@')) : [];
  if (!requested.length || !subject || !html) return res.status(400).json({ error: 'Paramètres manquants' });
  if (requested.length > 20) return res.status(400).json({ error: 'Trop de destinataires' });

  // N'importe quel compte authentifié peut appeler ce relais : sans ce
  // filtre, il servirait de relais d'email ouvert vers n'importe quelle
  // adresse externe (spam/phishing sous le nom de domaine du cabinet). On ne
  // relaie donc qu'aux adresses qui correspondent à un collaborateur connu.
  const { data: knownMembers } = await supabaseAdmin.from('members').select('email').not('email', 'is', null);
  const knownEmails = new Set((knownMembers || []).map((m) => (m.email || '').toLowerCase()));
  const recipients = requested.filter((e) => knownEmails.has(e.toLowerCase()));
  if (!recipients.length) return res.status(400).json({ error: 'Aucun destinataire reconnu' });

  try {
    await sendEmail({ to: recipients, subject, html });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
