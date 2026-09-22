import { createClient } from '@supabase/supabase-js';

// Verifica que o pedido traz o JWT de sessão (Supabase Auth) de um admin real,
// reencaminhando o cabeçalho Authorization para que auth.uid()/is_admin() funcionem
// dentro do Postgres exatamente como funcionariam num pedido direto do backoffice.
export async function verifyAdminRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return false;

  const client = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data, error } = await client.rpc('is_admin');
  return !error && data === true;
}
