// Vérifie que l'appel vient bien du planificateur Vercel (qui signe ses
// requêtes avec la variable d'env CRON_SECRET que vous définissez) et pas
// de n'importe qui sur internet appelant l'URL au hasard.
export function requireCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}
