import { supabaseAdmin } from './_shared/supabaseAdmin';
import { verifyAdminWithUidRequest } from './_shared/adminAuth';

export const config = { runtime: 'edge' };

// Banir impede o login ao nível do Supabase Auth (mais forte que "bloquear", que só
// desliga o is_admin() para essa conta). Ninguém pode banir a própria conta.
export default async function handler(req: Request): Promise<Response> {
  const { ok, uid } = await verifyAdminWithUidRequest(req);
  if (!ok) {
    return Response.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  const { userId, banned } = (await req.json().catch(() => ({}))) as { userId?: string; banned?: boolean };
  if (!userId || typeof banned !== 'boolean') {
    return Response.json({ error: 'dados_em_falta' }, { status: 400 });
  }
  if (userId === uid) {
    return Response.json({ error: 'nao_podes_banir_te_a_ti_mesmo' }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? '876000h' : 'none',
  });
  if (authError) {
    return Response.json({ error: 'erro_ao_atualizar', message: authError.message }, { status: 500 });
  }

  const { error: profileError } = await admin.from('profiles').update({ banned }).eq('id', userId);
  if (profileError) {
    return Response.json({ error: 'erro_ao_atualizar', message: profileError.message }, { status: 500 });
  }

  return Response.json({ updated: true });
}
