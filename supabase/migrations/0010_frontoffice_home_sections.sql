-- Suporte às novas secções da homepage do frontoffice: "Como funciona" (usa a faqs já
-- existente), "Contacte-nos" (tabela nova) e nome/slogan da loja centralizados em
-- site_settings (para poderem vir a ser editados no backoffice).

create table contactos (
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
create policy "admins leem contactos" on contactos for select using (is_admin());
create policy "admins atualizam contactos" on contactos for update using (is_admin()) with check (is_admin());
create policy "admins apagam contactos" on contactos for delete using (is_admin());

-- Nome e slogan da loja, editáveis no backoffice (Definições) — seed com o texto atual,
-- para não haver alteração visual até serem decididos e trocados manualmente.
insert into site_settings (key, value) values
  ('loja_nome', '{"nome": "Segunda Vida"}'),
  ('loja_slogan', '{"slogan": "Loja Solidária Colaboradores Fidelidade"}')
on conflict (key) do nothing;

-- As perguntas frequentes da migração 0001 eram só um placeholder genérico — substituídas
-- pelas 5 FAQ provisórias da campanha (ainda por validar com o cliente).
delete from faqs;

insert into faqs (pergunta, resposta, ordem) values
  ('Quem pode fazer pedidos?', 'Esta plataforma destina-se exclusivamente aos colaboradores da Fidelidade.', 1),
  ('Como é feito o pagamento?', 'O pagamento é efetuado presencialmente, no momento da recolha.', 2),
  ('Os bens são enviados para casa?', 'Não. Todos os bens são recolhidos presencialmente, na data agendada através do email de confirmação.', 3),
  ('O meu pedido está garantido?', 'Os pedidos são manifestações de interesse e ficam sujeitos a análise e ao stock disponível. Receberás confirmação por email.', 4),
  ('Existe limite de quantidade?', 'Sim, na categoria Tecnologia existe um limite de unidades por pedido.', 5);
