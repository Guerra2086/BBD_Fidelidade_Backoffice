import { createClient } from '@supabase/supabase-js';

// Verifica que o pedido traz o JWT de sessão (Supabase Auth) de um admin real,
// reencaminhando o cabeçalho Authorization para que auth.uid()/is_admin() funcionem
// dentro do Postgres exatamente como funcionariam num pedido direto do backoffice.
// Recebe só a string do cabeçalho (não o Request), para servir tanto funções Edge
// (Request.headers.get(...)) como funções Node normais (req.headers['authorization']).
export async function verifyAdmin(authHeader: string | null | undefined): Promise<boolean> {
  if (!authHeader) return false;

  const client = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data, error } = await client.rpc('is_admin');
  return !error && data === true;
}

export async function verifyAdminRequest(req: Request): Promise<boolean> {
  return verifyAdmin(req.headers.get('Authorization'));
}

// Igual a verifyAdmin, mas também devolve o id de quem está a chamar — usado nas
// ações mais perigosas (banir/eliminar) para impedir que um admin se atinja a si próprio.
export async function verifyAdminWithUid(authHeader: string | null | undefined): Promise<{ ok: boolean; uid: string | null }> {
  if (!authHeader) return { ok: false, uid: null };

  const client = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const [{ data: isAdminData, error: isAdminError }, { data: userData }] = await Promise.all([
    client.rpc('is_admin'),
    client.auth.getUser(),
  ]);

  return { ok: !isAdminError && isAdminData === true, uid: userData.user?.id ?? null };
}

export async function verifyAdminWithUidRequest(req: Request): Promise<{ ok: boolean; uid: string | null }> {
  return verifyAdminWithUid(req.headers.get('Authorization'));
}
