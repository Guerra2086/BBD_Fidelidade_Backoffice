import { supabaseAdmin } from './_shared/supabaseAdmin';
import { verifyAdminRequest } from './_shared/adminAuth';
import { generatePassword } from './_shared/password';
import { sendTemplatedEmail } from './_shared/email';

export const config = { runtime: 'edge' };

// Repõe a palavra-passe de outro admin: gera uma nova, envia-a por email e marca
// a conta para trocar a palavra-passe no próximo login.
export default async function handler(req: Request): Promise<Response> {
  if (!(await verifyAdminRequest(req))) {
    return Response.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  const { userId } = (await req.json().catch(() => ({}))) as { userId?: string };
  if (!userId) {
    return Response.json({ error: 'dados_em_falta' }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: profile, error: profileError } = await admin.from('profiles').select('nome, email').eq('id', userId).single();
  if (profileError || !profile) {
    return Response.json({ error: 'utilizador_nao_encontrado' }, { status: 404 });
  }

  const password = generatePassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password });
  if (updateError) {
    return Response.json({ error: 'erro_ao_repor', message: updateError.message }, { status: 500 });
  }

  await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);
  await sendTemplatedEmail('admin_password_reset', profile.email, { nome: profile.nome, email: profile.email, password });

  return Response.json({ sent: true });
}
