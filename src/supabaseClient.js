import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Variables d'environnement manquantes : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies (fichier .env en local, ou variables d'environnement sur Vercel)."
  );
}

// Flux "implicite" plutôt que PKCE (le défaut) : les liens d'invitation et de
// réinitialisation sont envoyés par email et ouverts dans un navigateur qui
// n'a jamais initié la demande (l'invitation part du serveur, pas du
// navigateur de la personne invitée) — PKCE exigerait une correspondance de
// code que ce navigateur n'a jamais eue, et échouerait silencieusement.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'implicit' },
});
