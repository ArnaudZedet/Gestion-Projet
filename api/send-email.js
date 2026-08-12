import { requireMember } from './_supabaseAdmin.js';

// Relais d'envoi d'email pour les notifications applicatives (affectation à
// un projet, projet mis à jour, tâche assignée...). Nécessite un compte
// Resend (resend.com) — clé API + expéditeur vérifié en variables d'env
// RESEND_API_KEY et RESEND_FROM.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const member = await requireMember(req);
  if (!member) return res.status(401).json({ error: 'Non authentifié' });

  const { to, subject, html } = req.body || {};
  const recipients = Array.isArray(to) ? to.filter((e) => typeof e === 'string' && e.includes('@')) : [];
  if (!recipients.length || !subject || !html) return res.status(400).json({ error: 'Paramètres manquants' });
  if (recipients.length > 20) return res.status(400).json({ error: 'Trop de destinataires' });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    return res.status(500).json({ error: "Service d'email non configuré (RESEND_API_KEY / RESEND_FROM manquants)" });
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: recipients, subject, html }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    return res.status(502).json({ error: `Envoi échoué : ${text}` });
  }
  return res.status(200).json({ ok: true });
}
