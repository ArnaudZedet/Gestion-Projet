import { requireMember } from './_supabaseAdmin.js';

// Relais vers l'API planning Swappy (Gare de Lyon) : le jeton reste ici,
// côté serveur, et ne part jamais vers le navigateur. Renvoie juste les noms
// des personnes ayant au moins un créneau posé sur la période — utilisé pour
// écarter du tirage au sort (responsable de projet/tâche) une personne
// absente cette semaine-là.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

  const member = await requireMember(req);
  if (!member) return res.status(401).json({ error: 'Non authentifié' });

  const { start, end } = req.query || {};
  if (!start || !end) return res.status(400).json({ error: 'Paramètres start/end manquants' });

  const token = process.env.SWAPPY_API_TOKEN;
  if (!token) return res.status(500).json({ error: "Intégration Swappy non configurée (SWAPPY_API_TOKEN manquant)" });

  try {
    const url = `https://api.planning.swappy.fr/integrations/gare_de_lyon/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const resp = await fetch(url, { headers: { Authorization: token } });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return res.status(resp.status).json({ error: `Swappy a répondu ${resp.status}${body ? ` : ${body.slice(0, 200)}` : ''}` });
    }
    const events = await resp.json();
    const names = [...new Set((events || []).map((e) => `${e.user_firstname} ${e.user_lastname}`))];
    return res.status(200).json({ names });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
