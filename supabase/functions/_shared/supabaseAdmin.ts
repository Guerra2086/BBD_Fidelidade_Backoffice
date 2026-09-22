import { createClient } from 'npm:@supabase/supabase-js@2';

// Cliente com a service-role key: só é usado dentro das Edge Functions, nunca no frontend.
// Bypassa RLS de propósito — a autorização é feita à mão em cada função (gate token ou JWT admin).
export function supabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}
