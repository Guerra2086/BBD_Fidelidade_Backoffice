import bcrypt from 'npm:bcryptjs@2';
import { handleOptions, json } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { verifyAdminRequest } from '../_shared/adminAuth.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (!(await verifyAdminRequest(req))) {
    return json({ error: 'nao_autorizado' }, 401);
  }

  const { password } = await req.json().catch(() => ({ password: null }));
  if (!password || typeof password !== 'string' || password.length < 6) {
    return json({ error: 'password_invalida', message: 'A palavra-passe deve ter pelo menos 6 caracteres.' }, 400);
  }

  const hash = bcrypt.hashSync(password, 10);
  const admin = supabaseAdmin();
  const { error } = await admin
    .from('site_settings')
    .update({ value: { hash }, updated_at: new Date().toISOString() })
    .eq('key', 'site_password_hash');

  if (error) {
    console.error(error);
    return json({ error: 'erro_ao_guardar' }, 500);
  }

  return json({ updated: true });
});
