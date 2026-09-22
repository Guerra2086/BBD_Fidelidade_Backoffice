import { createClient } from 'npm:@supabase/supabase-js@2';

// Verifica que o pedido traz o JWT de sessão (Supabase Auth) de um admin real,
// reencaminhando o cabeçalho Authorization para que auth.uid()/is_admin() funcionem
// dentro do Postgres exatamente como funcionariam num pedido direto do backoffice.
export async function verifyAdminRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return false;

  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data, error } = await client.rpc('is_admin');
  return !error && data === true;
}
