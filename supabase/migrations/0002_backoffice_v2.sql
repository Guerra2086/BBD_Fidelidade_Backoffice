-- Segunda Vida — extensão do esquema para o novo backoffice (referência backoffice-segunda-vida.html)
-- Corre isto DEPOIS de 0001_init.sql já ter sido aplicado.

-- ============================================================
-- CATEGORIAS: limite generalizado (substitui o site_settings.tecnologia_qty_limit fixo)
-- ============================================================
alter table categories add column if not exists limite_unidades int null check (limite_unidades is null or limite_unidades >= 1);

update categories set limite_unidades = (select (value->>'limit')::int from site_settings where key = 'tecnologia_qty_limit')
where slug = 'tecnologia';

-- ============================================================
-- PRODUTOS: várias fotografias (até 6, a primeira é a capa)
-- ============================================================
alter table products add column if not exists fotos text[] not null default '{}';
alter table products drop column if exists imagem_url;

-- ============================================================
-- ENCOMENDAS: novo estado "expirada" + método de pagamento
-- ============================================================
alter table orders drop constraint if exists orders_estado_check;
alter table orders add constraint orders_estado_check
  check (estado in ('pendente','confirmada','pronta_levantamento','entregue','cancelada','expirada'));

alter table orders add column if not exists payment_method text null
  check (payment_method is null or payment_method in ('Numerário','Multibanco','MB WAY'));

-- ============================================================
-- HISTÓRICO DA ENCOMENDA (timeline mostrada no backoffice)
-- ============================================================
create table if not exists order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  texto text not null,
  created_at timestamptz not null default now()
);
alter table order_events enable row level security;
revoke all on order_events from anon, authenticated;
create policy "admins leem eventos" on order_events for select using (is_admin());

-- ============================================================
-- MOVIMENTOS DE STOCK (registo automático de todas as entradas/saídas)
-- ============================================================
create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,
  delta int not null,
  motivo text not null,
  ref_order_id uuid references orders(id) on delete set null,
  user_label text not null default 'Sistema',
  resulting_stock int not null,
  created_at timestamptz not null default now()
);
alter table stock_movements enable row level security;
revoke all on stock_movements from anon, authenticated;
create policy "admins leem movimentos" on stock_movements for select using (is_admin());
create policy "admins criam movimentos" on stock_movements for insert with check (is_admin());

-- ============================================================
-- CONFIGURAÇÕES NOVAS (reservas, alerta de stock, levantamento)
-- ============================================================
insert into site_settings (key, value) values
  ('reserve_days', '{"days": 7}'),
  ('low_stock_threshold', '{"units": 3}'),
  ('alert_email', '{"address": "armazem@entrajuda.pt"}'),
  ('auto_expire_enabled', '{"enabled": true}'),
  ('pickup_info', '{"place": "TODO(Rodrigo): confirmar local de levantamento", "hours": "TODO(Rodrigo): confirmar horário"}'),
  ('sender_name', '{"name": "Banco de Bens Doados"}')
on conflict (key) do nothing;

-- ============================================================
-- RPC: place_order — atualizado para limite por categoria genérico + regista movimento + evento
-- ============================================================
create or replace function place_order(
  p_buyer_nome text,
  p_buyer_email text,
  p_items jsonb
)
returns table (order_id uuid, codigo text, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total     numeric := 0;
  v_peso      numeric := 0;
  v_order_id  uuid;
  v_codigo    text;
  v_cat       record;
  v_qty       int;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'items_vazios';
  end if;

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

  -- limite por categoria (qualquer categoria com limite_unidades definido, não só Tecnologia)
  for v_cat in
    select c.id, c.nome, c.limite_unidades from categories c where c.limite_unidades is not null
  loop
    select coalesce(sum((i->>'quantidade')::int), 0) into v_qty
      from jsonb_array_elements(p_items) i
      join products p on p.id = (i->>'product_id')::uuid
      where p.category_id = v_cat.id;
    if v_qty > v_cat.limite_unidades then
      raise exception 'limite_categoria_excedido';
    end if;
  end loop;

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
    from (select (i->>'product_id')::uuid pid, (i->>'quantidade')::int qty from jsonb_array_elements(p_items) i) x
    where p.id = x.pid;

  insert into stock_movements (product_id, delta, motivo, ref_order_id, user_label, resulting_stock)
    select p.id, -(i->>'quantidade')::int, 'Encomenda na loja', v_order_id, 'Sistema', p.stock
    from jsonb_array_elements(p_items) i join products p on p.id = (i->>'product_id')::uuid;

  insert into order_events (order_id, texto) values (v_order_id, 'Encomenda feita na loja');

  return query select v_order_id, v_codigo, v_total;
end;
$$;

-- ============================================================
-- RPC: cancel_order — atualizado para repor stock com log + evento
-- ============================================================
create or replace function cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_admin_nome text;
begin
  if not is_admin() then
    raise exception 'not_authorized';
  end if;

  select estado into v_estado from orders where id = p_order_id for update;
  if v_estado is null then raise exception 'order_not_found'; end if;
  if v_estado = 'cancelada' then return; end if;
  if v_estado = 'entregue' then raise exception 'cannot_cancel_delivered'; end if;

  select nome into v_admin_nome from profiles where id = auth.uid();

  update orders set estado = 'cancelada', updated_at = now() where id = p_order_id;

  update products p set stock = p.stock + oi.quantidade, updated_at = now()
    from order_items oi where oi.order_id = p_order_id and oi.product_id = p.id;

  insert into stock_movements (product_id, delta, motivo, ref_order_id, user_label, resulting_stock)
    select p.id, oi.quantidade, 'Cancelamento — reposição automática', p_order_id, coalesce(v_admin_nome, 'Sistema'), p.stock
    from order_items oi join products p on p.id = oi.product_id
    where oi.order_id = p_order_id;

  insert into order_events (order_id, texto) values (p_order_id, 'Cancelada — stock reposto');
end;
$$;

-- ============================================================
-- RPC: adjust_stock — entrada/ajuste manual de stock (admin, backoffice)
-- ============================================================
create or replace function adjust_stock(p_product_id uuid, p_delta int, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_nome text;
  v_stock int;
  v_ini int;
begin
  if not is_admin() then raise exception 'not_authorized'; end if;

  select stock, stock_inicial into v_stock, v_ini from products where id = p_product_id for update;
  if v_stock is null then raise exception 'product_not_found'; end if;
  if v_stock + p_delta < 0 then raise exception 'stock_insuficiente'; end if;

  select nome into v_admin_nome from profiles where id = auth.uid();

  update products
    set stock = stock + p_delta,
        stock_inicial = case when p_delta > 0 and stock + p_delta > stock_inicial then stock + p_delta else stock_inicial end,
        updated_at = now()
    where id = p_product_id;

  insert into stock_movements (product_id, delta, motivo, user_label, resulting_stock)
    select p_product_id, p_delta, p_motivo, coalesce(v_admin_nome, 'Admin'), stock from products where id = p_product_id;
end;
$$;

-- ============================================================
-- RPC: mark_order_ready / register_order_payment — transições de estado com evento
-- ============================================================
create or replace function mark_order_ready(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  update orders set estado = 'pronta_levantamento', updated_at = now()
    where id = p_order_id and estado = 'pendente';
  if not found then raise exception 'invalid_transition'; end if;
  insert into order_events (order_id, texto) values (p_order_id, 'Marcada como pronta para levantamento');
end;
$$;

create or replace function register_order_payment(p_order_id uuid, p_metodo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  if p_metodo not in ('Numerário','Multibanco','MB WAY') then raise exception 'metodo_invalido'; end if;
  update orders set estado = 'entregue', payment_method = p_metodo, updated_at = now()
    where id = p_order_id and estado in ('pendente','pronta_levantamento');
  if not found then raise exception 'invalid_transition'; end if;
  insert into order_events (order_id, texto) values (p_order_id, 'Paga (' || p_metodo || ') e entregue');
end;
$$;

-- ============================================================
-- RPC: expire_old_orders — cancela reservas expiradas e repõe stock (chamada por um cron)
-- ============================================================
create or replace function expire_old_orders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserve_days int;
  v_enabled boolean;
  v_order record;
  v_count int := 0;
begin
  select (value->>'enabled')::boolean into v_enabled from site_settings where key = 'auto_expire_enabled';
  if not coalesce(v_enabled, true) then return 0; end if;

  select (value->>'days')::int into v_reserve_days from site_settings where key = 'reserve_days';
  v_reserve_days := coalesce(v_reserve_days, 7);

  for v_order in
    select id from orders
    where estado = 'pendente' and created_at < now() - (v_reserve_days || ' days')::interval
    for update
  loop
    update orders set estado = 'expirada', updated_at = now() where id = v_order.id;

    update products p set stock = p.stock + oi.quantidade, updated_at = now()
      from order_items oi where oi.order_id = v_order.id and oi.product_id = p.id;

    insert into stock_movements (product_id, delta, motivo, ref_order_id, user_label, resulting_stock)
      select p.id, oi.quantidade, 'Reserva expirada — stock reposto automaticamente', v_order.id, 'Sistema', p.stock
      from order_items oi join products p on p.id = oi.product_id
      where oi.order_id = v_order.id;

    insert into order_events (order_id, texto) values (v_order.id, 'Reserva expirada — stock reposto automaticamente');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function adjust_stock(uuid, int, text) from public, anon;
grant execute on function adjust_stock(uuid, int, text) to authenticated;
revoke all on function mark_order_ready(uuid) from public, anon;
grant execute on function mark_order_ready(uuid) to authenticated;
revoke all on function register_order_payment(uuid, text) from public, anon;
grant execute on function register_order_payment(uuid, text) to authenticated;
revoke all on function expire_old_orders() from public, anon, authenticated;
grant execute on function expire_old_orders() to service_role;
