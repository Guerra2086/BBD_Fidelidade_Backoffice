import bcrypt from 'bcryptjs';
import { supabaseAdmin } from './_shared/supabaseAdmin';
import { verifyAdminRequest } from './_shared/adminAuth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (!(await verifyAdminRequest(req))) {
    return Response.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  const { password } = await req.json().catch(() => ({ password: null }));
  if (!password || typeof password !== 'string' || password.length < 6) {
    return Response.json({ error: 'password_invalida', message: 'A palavra-passe deve ter pelo menos 6 caracteres.' }, { status: 400 });
  }

  const hash = bcrypt.hashSync(password, 10);
  const admin = supabaseAdmin();
  const { error } = await admin
    .from('site_settings')
    .update({ value: { hash }, updated_at: new Date().toISOString() })
    .eq('key', 'site_password_hash');

  if (error) {
    console.error(error);
    return Response.json({ error: 'erro_ao_guardar' }, { status: 500 });
  }

  return Response.json({ updated: true });
}
