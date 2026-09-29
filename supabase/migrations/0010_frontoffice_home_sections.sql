-- Suporte às novas secções da homepage do frontoffice: "Como funciona" (usa a faqs,
-- criada aqui se ainda não existir), "Contacte-nos" (tabela nova) e nome/slogan da
-- loja centralizados em site_settings (para poderem vir a ser editados no backoffice).

create table if not exists contactos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  telefone text,
  comentario text not null,
  lida boolean not null default false,
  created_at timestamptz not null default now()
);

alter table contactos enable row level security;
-- Mesma lógica da newsletter_subscribers: sem grants a anon/authenticated — a escrita
-- pública faz-se só pela Edge Function do frontoffice, com a service-role key.
revoke all on contactos from anon, authenticated;
drop policy if exists "admins leem contactos" on contactos;
create policy "admins leem contactos" on contactos for select using (is_admin());
drop policy if exists "admins atualizam contactos" on contactos;
create policy "admins atualizam contactos" on contactos for update using (is_admin()) with check (is_admin());
drop policy if exists "admins apagam contactos" on contactos;
create policy "admins apagam contactos" on contactos for delete using (is_admin());

-- faqs não existia nesta base de dados (a migração 0001 não chegou a criá-la aqui) —
-- criada agora com o mesmo esquema previsto originalmente.
create table if not exists faqs (
  id uuid primary key default gen_random_uuid(),
  pergunta text not null,
  resposta text not null,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table faqs enable row level security;
revoke all on faqs from anon, authenticated;
drop policy if exists "admins gerem faqs" on faqs;
create policy "admins gerem faqs" on faqs for all using (is_admin()) with check (is_admin());

-- Nome e slogan da loja, editáveis no backoffice (Definições) — seed com o texto atual,
-- para não haver alteração visual até serem decididos e trocados manualmente.
insert into site_settings (key, value) values
  ('loja_nome', '{"nome": "Segunda Vida"}'),
  ('loja_slogan', '{"slogan": "Loja Solidária Colaboradores Fidelidade"}')
on conflict (key) do nothing;

-- Substitui o conteúdo por completo pelas 5 FAQ provisórias da campanha (ainda por
-- validar com o cliente) — seguro de repetir mesmo que a tabela já tivesse dados.
delete from faqs;

insert into faqs (pergunta, resposta, ordem) values
  ('Quem pode fazer pedidos?', 'Esta plataforma destina-se exclusivamente aos colaboradores da Fidelidade.', 1),
  ('Como é feito o pagamento?', 'O pagamento é efetuado presencialmente, no momento da recolha.', 2),
  ('Os bens são enviados para casa?', 'Não. Todos os bens são recolhidos presencialmente, na data agendada através do email de confirmação.', 3),
  ('O meu pedido está garantido?', 'Os pedidos são manifestações de interesse e ficam sujeitos a análise e ao stock disponível. Receberás confirmação por email.', 4),
  ('Existe limite de quantidade?', 'Sim, na categoria Tecnologia existe um limite de unidades por pedido.', 5);
