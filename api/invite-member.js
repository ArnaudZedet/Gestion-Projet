import { supabaseAdmin, requireMember } from './_supabaseAdmin.js';

// Envoie l'email d'invitation Supabase (compte + mot de passe) dès qu'un
// manager saisit/modifie l'email d'un collaborateur dans l'app — plus besoin
// de le refaire à la main dans le dashboard Supabase.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const member = await requireMember(req);
  if (!member) return res.status(401).json({ error: 'Non authentifié' });
  if (member.access_level !== 'manager') return res.status(403).json({ error: 'Réservé aux managers' });

  const email = (req.body?.email || '').trim();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Email invalide' });

  const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: siteUrl });

  if (error) {
    const alreadyRegistered = /already registered|already exists/i.test(error.message || '');
    if (alreadyRegistered) return res.status(200).json({ ok: true, alreadyRegistered: true });
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ ok: true });
}
