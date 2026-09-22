import { createClient } from '@supabase/supabase-js';

// Cliente com a service-role key: só corre no servidor (funções em /api). Bypassa RLS
// de propósito — a autorização é feita à mão em cada função (ver adminAuth.ts).
export function supabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}
