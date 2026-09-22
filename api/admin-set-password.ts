import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from './_shared/supabaseAdmin.js';
import { verifyAdmin } from './_shared/adminAuth.js';

// Runtime Node normal (não Edge): bcryptjs usa o módulo `crypto` do Node,
// que o Edge Runtime do Vercel não suporta.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await verifyAdmin(req.headers.authorization))) {
    return res.status(401).json({ error: 'nao_autorizado' });
  }

  const { password } = (req.body ?? {}) as { password?: string | null };
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'password_invalida', message: 'A palavra-passe deve ter pelo menos 6 caracteres.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const admin = supabaseAdmin();
  const { error } = await admin
    .from('site_settings')
    .update({ value: { hash }, updated_at: new Date().toISOString() })
    .eq('key', 'site_password_hash');

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'erro_ao_guardar' });
  }

  return res.status(200).json({ updated: true });
}
