// Envoi d'email via Resend (resend.com) — clé API + expéditeur vérifié en
// variables d'env RESEND_API_KEY et RESEND_FROM. Utilisé par le relais
// d'envoi applicatif (send-email.js) et par les tâches planifiées (cron).
export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) throw new Error("Service d'email non configuré (RESEND_API_KEY / RESEND_FROM manquants)");

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!resp.ok) throw new Error(`Envoi échoué : ${await resp.text()}`);
}
