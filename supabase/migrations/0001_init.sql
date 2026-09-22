-- Segunda Vida — Loja Solidária (Fidelidade x Banco de Bens Doados)
-- Migração inicial: esquema, RLS, RPCs e seed.
--
-- Nota de arquitetura: o frontoffice NÃO usa Supabase Auth (só uma palavra-passe
-- partilhada, validada por uma Edge Function). Por isso todas as tabelas da loja
-- ficam com RLS "deny-all" (sem grants para anon/authenticated) e só são lidas/
-- escritas através de Edge Functions com a service-role key. O backoffice usa
-- Supabase Auth (magic link) + is_admin() normalmente.

create extension if not exists pgcrypto;

-- ============================================================
-- PROFILES (só para admins do backoffice)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

alter table profiles enable row level security;
create policy "admins leem profiles" on profiles for select using (is_admin());
create policy "admins gerem profiles" on profiles for all using (is_admin()) with check (is_admin());

-- ============================================================
-- CATEGORIAS
-- ============================================================
create table categories (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text unique not null,
  ordem int not null default 0
);

alter table categories enable row level security;
revoke all on categories from anon, authenticated;
create policy "admins gerem categorias" on categories for all using (is_admin()) with check (is_admin());

insert into categories (nome, slug, ordem) values
  ('Cadeiras', 'cadeiras', 1),
  ('Sofás e cadeirões', 'sofas-e-cadeiroes', 2),
  ('Secretárias', 'secretarias', 3),
  ('Outras superfícies', 'outras-superficies', 4),
  ('Tecnologia', 'tecnologia', 5),
  ('Diversos', 'diversos', 6);

-- ============================================================
-- PRODUTOS
-- ============================================================
create table products (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text unique not null,
  category_id uuid references categories(id),
  descricao text,
  preco numeric(10,2) not null check (preco >= 0),
  estado text not null check (estado in ('Novo','Como novo','Bom')),
  icone text not null,
  imagem_url text,
  peso_kg numeric(6,2) not null default 0,
  stock int not null default 0 check (stock >= 0),
  stock_inicial int not null default 0,
  destaque_novo boolean not null default false,
  ativo boolean not null default true,
  codigo_passaporte text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table products enable row level security;
revoke all on products from anon, authenticated;
create policy "admins gerem produtos" on products for all using (is_admin()) with check (is_admin());

-- ============================================================
-- ENCOMENDAS (sem user_id, sem morada — ver overrides do brief)
-- ============================================================
create sequence orders_codigo_seq;

create table orders (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  buyer_nome text not null,
  buyer_email text not null,
  total numeric(10,2) not null,
  peso_total_kg numeric(8,2) not null default 0,
  estado text not null default 'pendente'
    check (estado in ('pendente','confirmada','pronta_levantamento','entregue','cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_buyer_email_idx on orders (lower(buyer_email));

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_nome_snapshot text not null,
  quantidade int not null check (quantidade > 0),
  preco_unitario numeric(10,2) not null
);

alter table orders enable row level security;
alter table order_items enable row level security;
revoke all on orders, order_items from anon, authenticated;
create policy "admins gerem encomendas" on orders for all using (is_admin()) with check (is_admin());
create policy "admins gerem itens de encomenda" on order_items for all using (is_admin()) with check (is_admin());

-- ============================================================
-- CONTEÚDOS (impacto, newsletter, faqs)
-- ============================================================
create table site_stats (
  key text primary key,
  label text not null,
  value text not null,
  ordem int not null default 0,
  updated_at timestamptz not null default now()
);

alter table site_stats enable row level security;
revoke all on site_stats from anon, authenticated;
create policy "admins gerem site_stats" on site_stats for all using (is_admin()) with check (is_admin());

insert into site_stats (key, label, value, ordem) values
  ('objetos_doados', 'objetos doados pela Fidelidade', '4200', 1),
  ('colaboradores_compraram', 'colaboradores Fidelidade já compraram', '1350', 2),
  ('instituicoes_apoiadas', 'instituições de solidariedade apoiadas', '85', 3);

create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);

alter table newsletter_subscribers enable row level security;
revoke all on newsletter_subscribers from anon, authenticated;
create policy "admins leem newsletter" on newsletter_subscribers for select using (is_admin());
create policy "admins apagam newsletter" on newsletter_subscribers for delete using (is_admin());

create table faqs (
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
create policy "admins gerem faqs" on faqs for all using (is_admin()) with check (is_admin());

insert into faqs (pergunta, resposta, ordem) values
  ('Como funciona a loja?', 'A Fidelidade doou objetos ao Banco de Bens Doados. Os colaboradores da Fidelidade podem comprá-los a preços solidários e o valor reverte para o Banco de Bens Doados.', 1),
  ('Onde levanto a minha encomenda?', 'TODO(Rodrigo): confirmar local, horário e processo de levantamento.', 2),
  ('Como pago a minha encomenda?', 'O pagamento é feito presencialmente no levantamento — não há pagamento online.', 3),
  ('Para onde vai o dinheiro das compras?', 'O valor de cada compra reverte para a missão do Banco de Bens Doados, apoiando instituições de solidariedade.', 4);

-- ============================================================
-- CHAT (sem user_id — sessão anónima do browser)
-- ============================================================
create table chat_conversations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  conteudo text not null,
  created_at timestamptz not null default now()
);

alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;
revoke all on chat_conversations, chat_messages from anon, authenticated;
create policy "admins leem conversas" on chat_conversations for select using (is_admin());
create policy "admins leem mensagens" on chat_messages for select using (is_admin());

-- ============================================================
-- CONFIGURAÇÕES (overrides 1, 3, 5 do brief)
-- ============================================================
create table site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table site_settings enable row level security;
revoke all on site_settings from anon, authenticated;
create policy "admins leem settings" on site_settings for select using (is_admin());
create policy "admins gerem settings" on site_settings for update using (is_admin()) with check (is_admin());

-- Password por omissão: "segunda-vida" (TODO(Rodrigo): mudar via backoffice assim que possível).
-- Hash bcrypt real, gerado offline com bcryptjs (custo 10); a Edge Function gate-login
-- compara com bcrypt.compare(). Confirmado: bcrypt.compareSync('segunda-vida', hash) === true.
insert into site_settings (key, value) values
  ('site_password_hash', '{"hash":"$2b$10$tvnQJ0xL6nXmK7N41kZfQew58fBHZaHpvUPzz0Gp2tLrE7pFCXDqG"}'),
  ('tecnologia_qty_limit', '{"limit": 2}'),
  ('email_sender_address', '{"address": "campanhas.bbd@entrajuda.pt"}');

create table email_templates (
  key text primary key,
  nome text not null,
  assunto text not null,
  corpo_html text not null,
  corpo_texto text,
  ativo boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table email_templates enable row level security;
revoke all on email_templates from anon, authenticated;
create policy "admins gerem templates" on email_templates for all using (is_admin()) with check (is_admin());

insert into email_templates (key, nome, assunto, corpo_html, corpo_texto) values
  (
    'order_confirmation',
    'Confirmação de encomenda',
    'A tua encomenda {{numero_encomenda}} foi recebida',
    '<p>Olá {{nome}},</p><p>Recebemos a tua encomenda <strong>{{numero_encomenda}}</strong>.</p><p>{{itens}}</p><p>Total: <strong>{{total}}</strong></p><p>O pagamento é feito presencialmente no levantamento. TODO(Rodrigo): confirmar local/horário de levantamento.</p>',
    'Olá {{nome}}, recebemos a tua encomenda {{numero_encomenda}}. {{itens}} Total: {{total}}. O pagamento é feito presencialmente no levantamento.'
  ),
  (
    'order_cancelled',
    'Encomenda cancelada',
    'A tua encomenda {{numero_encomenda}} foi cancelada',
    '<p>Olá {{nome}},</p><p>A tua encomenda <strong>{{numero_encomenda}}</strong> foi cancelada.</p><p>TODO(Rodrigo): confirmar texto/contacto de apoio.</p>',
    'Olá {{nome}}, a tua encomenda {{numero_encomenda}} foi cancelada.'
  );

-- ============================================================
-- RPC: place_order — chamada só pela Edge Function place-order (service role)
-- ============================================================
create or replace function place_order(
  p_buyer_nome text,
  p_buyer_email text,
  p_items jsonb -- [{ "product_id": "uuid", "quantidade": 2 }, ...]
)
returns table (order_id uuid, codigo text, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tec_limit int;
  v_tec_qty   int;
  v_total     numeric := 0;
  v_peso      numeric := 0;
  v_order_id  uuid;
  v_codigo    text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'items_vazios';
  end if;

  -- Bloqueia as linhas de produto envolvidas para evitar venda a mais em concorrência.
  perform 1 from products
    where id in (select (i->>'product_id')::uuid from jsonb_array_elements(p_items) i)
    for update;

  if exists (
    select 1 from jsonb_array_elements(p_items) i
    join products p on p.id = (i->>'product_id')::uuid
    where not p.ativo or p.stock < (i->>'quantidade')::int
  ) then
    raise exception 'stock_insuficiente';
  end if;

  select (value->>'limit')::int into v_tec_limit
    from site_settings where key = 'tecnologia_qty_limit';

  select coalesce(sum((i->>'quantidade')::int), 0) into v_tec_qty
    from jsonb_array_elements(p_items) i
    join products p on p.id = (i->>'product_id')::uuid
    join categories c on c.id = p.category_id
    where c.slug = 'tecnologia';

  if v_tec_limit is not null and v_tec_qty > v_tec_limit then
    raise exception 'limite_tecnologia_excedido';
  end if;

  v_codigo := 'BBD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('orders_codigo_seq')::text, 6, '0');

  select sum(p.preco * (i->>'quantidade')::int), sum(p.peso_kg * (i->>'quantidade')::int)
    into v_total, v_peso
    from jsonb_array_elements(p_items) i join products p on p.id = (i->>'product_id')::uuid;

  insert into orders (codigo, buyer_nome, buyer_email, total, peso_total_kg, estado)
    values (v_codigo, p_buyer_nome, p_buyer_email, v_total, v_peso, 'pendente')
    returning id into v_order_id;

  insert into order_items (order_id, product_id, product_nome_snapshot, quantidade, preco_unitario)
    select v_order_id, p.id, p.nome, (i->>'quantidade')::int, p.preco
    from jsonb_array_elements(p_items) i join products p on p.id = (i->>'product_id')::uuid;

  update products p set stock = p.stock - x.qty, updated_at = now()
    from (
      select (i->>'product_id')::uuid pid, (i->>'quantidade')::int qty
      from jsonb_array_elements(p_items) i
    ) x
    where p.id = x.pid;

  return query select v_order_id, v_codigo, v_total;
end;
$$;

revoke all on function place_order(text, text, jsonb) from public, anon, authenticated;
grant execute on function place_order(text, text, jsonb) to service_role;

-- ============================================================
-- RPC: cancel_order — chamada pelo backoffice com o JWT real do admin
-- ============================================================
create or replace function cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not is_admin() then
    raise exception 'not_authorized';
  end if;

  select estado into v_estado from orders where id = p_order_id for update;
  if v_estado is null then
    raise exception 'order_not_found';
  end if;
  if v_estado = 'cancelada' then
    return;
  end if;
  if v_estado = 'entregue' then
    raise exception 'cannot_cancel_delivered';
  end if;

  update orders set estado = 'cancelada', updated_at = now() where id = p_order_id;

  update products p set stock = p.stock + oi.quantidade, updated_at = now()
    from order_items oi
    where oi.order_id = p_order_id and oi.product_id = p.id;
end;
$$;

revoke all on function cancel_order(uuid) from public, anon;
grant execute on function cancel_order(uuid) to authenticated;

-- ============================================================
-- SEED DE PRODUTOS (12 produtos, mesmos ícones/preços/pesos da referência visual,
-- redistribuídos pelas 6 categorias exigidas pelo brief-override)
-- ============================================================
insert into products (nome, slug, category_id, descricao, preco, estado, icone, peso_kg, stock, stock_inicial, destaque_novo, ativo, codigo_passaporte)
select v.nome, v.slug, c.id, v.descricao, v.preco, v.estado, v.icone, v.peso_kg, v.stock, v.stock, v.destaque_novo, true, v.codigo
from (values
  ('Candeeiro de mesa', 'candeeiro-de-mesa', 'diversos', 'Doado pela Fidelidade ao Banco de Bens Doados.', 12, 'Novo', 'candeeiro', 1.4, 8, true, 'BBD-2026-00731'),
  ('Cadeira de madeira', 'cadeira-de-madeira', 'cadeiras', 'Doado pela Fidelidade ao Banco de Bens Doados.', 25, 'Como novo', 'cadeira', 5, 4, false, 'BBD-2026-01462'),
  ('Chaleira elétrica', 'chaleira-eletrica', 'tecnologia', 'Doado pela Fidelidade ao Banco de Bens Doados.', 15, 'Novo', 'chaleira', 1.1, 15, true, 'BBD-2026-02193'),
  ('Sofá de 2 lugares', 'sofa-de-2-lugares', 'sofas-e-cadeiroes', 'Doado pela Fidelidade ao Banco de Bens Doados.', 120, 'Bom', 'sofa', 38, 1, false, 'BBD-2026-02924'),
  ('Casaco impermeável', 'casaco-impermeavel', 'diversos', 'Doado pela Fidelidade ao Banco de Bens Doados.', 18, 'Novo', 'casaco', 0.9, 12, false, 'BBD-2026-03655'),
  ('Peluche urso', 'peluche-urso', 'diversos', 'Doado pela Fidelidade ao Banco de Bens Doados.', 6, 'Novo', 'urso', 0.4, 30, true, 'BBD-2026-04386'),
  ('Secretária compacta', 'secretaria-compacta', 'secretarias', 'Doado pela Fidelidade ao Banco de Bens Doados.', 45, 'Como novo', 'secretaria', 18, 3, false, 'BBD-2026-05117'),
  ('Micro-ondas 20L', 'micro-ondas-20l', 'tecnologia', 'Doado pela Fidelidade ao Banco de Bens Doados.', 35, 'Como novo', 'micro', 11, 0, false, 'BBD-2026-05848'),
  ('Estante de 3 prateleiras', 'estante-de-3-prateleiras', 'outras-superficies', 'Doado pela Fidelidade ao Banco de Bens Doados.', 30, 'Bom', 'estante', 14, 5, false, 'BBD-2026-06579'),
  ('Serviço de loiça (6 p.)', 'servico-de-loica-6p', 'diversos', 'Doado pela Fidelidade ao Banco de Bens Doados.', 22, 'Novo', 'loica', 4.5, 6, false, 'BBD-2026-07310'),
  ('Cadeira de escritório', 'cadeira-de-escritorio', 'cadeiras', 'Doado pela Fidelidade ao Banco de Bens Doados.', 40, 'Como novo', 'cadeiraesc', 12, 9, false, 'BBD-2026-08041'),
  ('Manta de lã', 'manta-de-la', 'diversos', 'Doado pela Fidelidade ao Banco de Bens Doados.', 14, 'Novo', 'manta', 1.2, 20, true, 'BBD-2026-08772')
) as v(nome, slug, cat_slug, descricao, preco, estado, icone, peso_kg, stock, destaque_novo, codigo)
join categories c on c.slug = v.cat_slug;

-- ============================================================
-- STORAGE: bucket de imagens de produto (leitura pública, escrita só admins)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "leitura publica de imagens de produto"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "admins escrevem imagens de produto"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and is_admin());

create policy "admins atualizam imagens de produto"
  on storage.objects for update
  using (bucket_id = 'product-images' and is_admin());

create policy "admins apagam imagens de produto"
  on storage.objects for delete
  using (bucket_id = 'product-images' and is_admin());
