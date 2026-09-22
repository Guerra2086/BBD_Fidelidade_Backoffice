import { handleOptions, json } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { verifyGateToken } from '../_shared/gate.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (!(await verifyGateToken(req))) {
    return json({ error: 'nao_autorizado' }, 401);
  }

  const { email } = await req.json().catch(() => ({ email: null }));
  if (!email || typeof email !== 'string') {
    return json({ error: 'email_invalido' }, 400);
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from('newsletter_subscribers').upsert({ email }, { onConflict: 'email' });
  if (error) {
    console.error(error);
    return json({ error: 'erro_ao_subscrever' }, 500);
  }

  return json({ subscribed: true });
});
