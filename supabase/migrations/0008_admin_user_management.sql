-- Gestão de administradores: bloquear, banir, obrigar a trocar a palavra-passe
-- no primeiro login (ou depois de o admin repor a palavra-passe de outra conta).

alter table profiles add column if not exists blocked boolean not null default false;
alter table profiles add column if not exists banned boolean not null default false;
alter table profiles add column if not exists must_change_password boolean not null default false;

-- Uma conta bloqueada ou banida deixa de contar como admin (perde acesso de imediato,
-- mesmo com uma sessão válida) — quem a bloqueou/baniu continua a poder reverter,
-- porque a policy de profiles usa is_admin() do lado de quem faz o pedido.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and not blocked and not banned);
$$;

insert into email_templates (key, nome, assunto, corpo_html, corpo_texto) values
  (
    'admin_account_created',
    'Conta de administrador criada',
    'A tua conta no backoffice Segunda Vida foi criada',
    '<p>Olá {{nome}},</p><p>Foi criada uma conta de administrador para ti no backoffice da Segunda Vida.</p><p>Email: <strong>{{email}}</strong><br>Palavra-passe: <strong>{{password}}</strong></p><p>Ao entrares pela primeira vez vai ser-te pedido para definires uma nova palavra-passe.</p>',
    'Olá {{nome}}, foi criada uma conta de administrador para ti no backoffice da Segunda Vida. Email: {{email}} · Palavra-passe: {{password}}. Ao entrares pela primeira vez vais definir uma nova palavra-passe.'
  ),
  (
    'admin_password_reset',
    'Palavra-passe reposta',
    'A tua palavra-passe do backoffice foi reposta',
    '<p>Olá {{nome}},</p><p>A tua palavra-passe de acesso ao backoffice da Segunda Vida foi reposta por outro administrador.</p><p>Palavra-passe temporária: <strong>{{password}}</strong></p><p>Ao entrares vai ser-te pedido para definires uma nova palavra-passe.</p>',
    'Olá {{nome}}, a tua palavra-passe foi reposta. Palavra-passe temporária: {{password}}. Ao entrares vais definir uma nova.'
  )
on conflict (key) do nothing;
