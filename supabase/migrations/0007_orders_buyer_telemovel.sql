-- Acrescenta o telemóvel do colaborador à encomenda (pedido no formulário da caixa do frontoffice).

alter table orders add column if not exists buyer_telemovel text;

-- place_order ganha um parâmetro novo (p_buyer_telemovel) — assinatura diferente da anterior,
-- por isso a versão de 3 parâmetros (sem telemóvel) tem de ser removida explicitamente, senão
-- ficava a co-existir como uma função sobrecarregada à parte.
drop function if exists place_order(text, text, jsonb);

create or replace function place_order(
  p_buyer_nome text,
  p_buyer_email text,
  p_buyer_telemovel text,
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

  insert into orders (codigo, buyer_nome, buyer_email, buyer_telemovel, total, peso_total_kg, estado)
    values (v_codigo, p_buyer_nome, p_buyer_email, p_buyer_telemovel, v_total, v_peso, 'pendente')
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

-- A assinatura antiga (3 parâmetros) tinha grants próprios (0001, 0003) que se perdem com o
-- drop acima — a nova assinatura (4 parâmetros) precisa dos mesmos.
revoke all on function place_order(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function place_order(text, text, text, jsonb) to service_role;
grant execute on function place_order(text, text, text, jsonb) to authenticated;
