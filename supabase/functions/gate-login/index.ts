import bcrypt from 'npm:bcryptjs@2';
import { handleOptions, json } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { signGateToken } from '../_shared/gate.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { password } = await req.json();
    if (!password || typeof password !== 'string') {
      return json({ error: 'password_em_falta' }, 400);
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('site_settings')
      .select('value')
      .eq('key', 'site_password_hash')
      .maybeSingle();

    if (error || !data) {
      console.error('site_password_hash não configurado:', error);
      return json({ error: 'servidor_nao_configurado' }, 500);
    }

    const hash = (data.value as { hash?: string })?.hash;
    if (!hash || !bcrypt.compareSync(password, hash)) {
      return json({ error: 'password_incorreta' }, 401);
    }

    const token = await signGateToken();
    return json({ token });
  } catch (e) {
    console.error(e);
    return json({ error: 'pedido_invalido' }, 400);
  }
});
