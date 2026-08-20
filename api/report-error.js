import { supabaseAdmin } from './_supabaseAdmin.js';
import { sendEmail } from './_resend.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Reçoit un rapport de plantage envoyé par le navigateur (voir
// src/main.jsx : erreur de rendu React, erreur JS non attrapée, ou promesse
// rejetée non gérée) et prévient les managers par email pour qu'ils
// sachent qu'il y a un bug à corriger, sans attendre qu'un collaborateur
// pense à le signaler.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  // On exige un jeton Supabase valide (même si l'email ne correspond à
  // aucune fiche "member") pour éviter que ce point d'entrée serve à
  // n'importe qui sur internet à déclencher des emails à volonté — mais on
  // n'exige pas une fiche member résolue : un plantage peut survenir avant
  // que l'app ait fini de charger le profil.
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Non authentifié' });
  const reporterEmail = userData.user.email || 'inconnu';

  const { message, stack, url, context } = req.body || {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Paramètres manquants' });

  const { data: managers } = await supabaseAdmin.from('members').select('email').eq('access_level', 'manager');
  const managerEmails = (managers || []).map((m) => m.email).filter(Boolean);
  if (!managerEmails.length) return res.status(200).json({ ok: true, sent: false });

  const html = `
    <p>Une erreur s'est produite dans l'application, signalée automatiquement par le navigateur.</p>
    <p><strong>Message :</strong> ${escapeHtml(message).slice(0, 2000)}</p>
    ${context ? `<p><strong>Contexte :</strong> ${escapeHtml(String(context)).slice(0, 500)}</p>` : ''}
    ${url ? `<p><strong>Page :</strong> ${escapeHtml(String(url)).slice(0, 500)}</p>` : ''}
    <p><strong>Utilisateur :</strong> ${escapeHtml(reporterEmail)}</p>
    ${stack ? `<p><strong>Détail technique :</strong></p><pre style="white-space:pre-wrap;font-size:12px;background:#f1f2f4;padding:8px;border-radius:6px;">${escapeHtml(String(stack)).slice(0, 4000)}</pre>` : ''}
  `;

  try {
    await sendEmail({ to: managerEmails, subject: `Erreur dans l'application : ${message.slice(0, 100)}`, html });
  } catch (e) {
    console.error('Échec envoi alerte erreur', e.message);
    return res.status(502).json({ error: e.message });
  }
  return res.status(200).json({ ok: true, sent: true });
}
