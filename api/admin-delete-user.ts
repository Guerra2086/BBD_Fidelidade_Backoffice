import { supabaseAdmin } from './_shared/supabaseAdmin';
import { verifyAdminWithUidRequest } from './_shared/adminAuth';

export const config = { runtime: 'edge' };

// Elimina a conta de autenticação; o profile vai atrás por causa do
// "on delete cascade" na referência a auth.users. Ninguém pode eliminar-se a si próprio.
export default async function handler(req: Request): Promise<Response> {
  const { ok, uid } = await verifyAdminWithUidRequest(req);
  if (!ok) {
    return Response.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  const { userId } = (await req.json().catch(() => ({}))) as { userId?: string };
  if (!userId) {
    return Response.json({ error: 'dados_em_falta' }, { status: 400 });
  }
  if (userId === uid) {
    return Response.json({ error: 'nao_podes_eliminar_te_a_ti_mesmo' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return Response.json({ error: 'erro_ao_eliminar', message: error.message }, { status: 500 });
  }

  return Response.json({ deleted: true });
}
