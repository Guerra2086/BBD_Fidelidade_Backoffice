import { supabaseAdmin } from './_shared/supabaseAdmin.js';
import { verifyAdminRequest } from './_shared/adminAuth.js';

export const config = { runtime: 'edge' };

// Cria uma nova conta de admin do backoffice: só pode ser chamada por quem já é admin.
// Usa a service-role key (supabase.auth.admin.createUser) porque isto não é possível
// com a anon key a partir do browser.
export default async function handler(req: Request): Promise<Response> {
  if (!(await verifyAdminRequest(req))) {
    return Response.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  const { nome, email, password } = (await req.json().catch(() => ({}))) as {
    nome?: string;
    email?: string;
    password?: string;
  };

  if (!nome || !email || !password || password.length < 6) {
    return Response.json(
      { error: 'dados_invalidos', message: 'Preenche o nome, o email e uma palavra-passe com pelo menos 6 caracteres.' },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return Response.json(
      { error: 'erro_ao_criar_conta', message: createError?.message ?? 'Não foi possível criar a conta.' },
      { status: 400 },
    );
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    nome,
    email,
    role: 'admin',
  });

  if (profileError) {
    // A conta de autenticação já foi criada; sem o profile fica sem acesso, por isso desfazemos.
    await admin.auth.admin.deleteUser(created.user.id);
    return Response.json({ error: 'erro_ao_criar_perfil', message: profileError.message }, { status: 500 });
  }

  return Response.json({ created: true });
}
