import { supabase } from './supabaseClient';

// Un plantage qui ne remonte nulle part reste invisible jusqu'à ce qu'un
// collaborateur pense à le signaler à la main. On prévient donc les
// managers par email dès qu'une erreur JS non gérée survient côté
// navigateur (voir main.jsx pour les points d'écoute).
const MAX_REPORTS_PER_SESSION = 5;
let reportCount = 0;
const reportedMessages = new Set();

export async function reportError(message, stack, context) {
  try {
    if (!message) return;
    const key = String(message).slice(0, 300);
    // Une seule alerte par message identique et un plafond par session,
    // pour éviter qu'une boucle d'erreurs (ex. un setInterval qui plante en
    // continu) ne déclenche des dizaines d'emails d'affilée.
    if (reportedMessages.has(key) || reportCount >= MAX_REPORTS_PER_SESSION) return;
    reportedMessages.add(key);
    reportCount += 1;

    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;

    await fetch('/api/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: key, stack: stack ? String(stack).slice(0, 4000) : '', url: window.location.href, context }),
    });
  } catch {
    // Le rapport d'erreur lui-même ne doit jamais faire planter l'app.
  }
}
