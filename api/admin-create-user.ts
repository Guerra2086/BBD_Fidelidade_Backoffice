import { supabaseAdmin } from './_shared/supabaseAdmin.js';
import { verifyAdminRequest } from './_shared/adminAuth.js';
import { generatePassword } from './_shared/password.js';
import { sendTemplatedEmail } from './_shared/email.js';

export const config = { runtime: 'edge' };

// Cria uma nova conta de admin do backoffice: só pode ser chamada por quem já é admin.
// A palavra-passe é gerada aqui (nunca é escolhida pelo criador) e enviada por email;
// a conta fica marcada para trocar a palavra-passe no primeiro login.
export default async function handler(req: Request): Promise<Response> {
  if (!(await verifyAdminRequest(req))) {
    return Response.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  const { nome, email } = (await req.json().catch(() => ({}))) as { nome?: string; email?: string };

  if (!nome || !email) {
    return Response.json({ error: 'dados_invalidos', message: 'Preenche o nome e o email.' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const password = generatePassword();

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
    must_change_password: true,
  });

  if (profileError) {
    // A conta de autenticação já foi criada; sem o profile fica sem acesso, por isso desfazemos.
    await admin.auth.admin.deleteUser(created.user.id);
    return Response.json({ error: 'erro_ao_criar_perfil', message: profileError.message }, { status: 500 });
  }

  await sendTemplatedEmail('admin_account_created', email, { nome, email, password });

  return Response.json({ created: true });
}
