import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Vérifie le token envoyé par le client et retourne la fiche "member"
// correspondante (ou null si le token est invalide ou l'email non reconnu).
export async function requireMember(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.email) return null;

  const { data: member } = await supabaseAdmin
    .from('members')
    .select('*')
    .ilike('email', data.user.email)
    .maybeSingle();

  return member || null;
}
