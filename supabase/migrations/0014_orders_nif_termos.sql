-- NIF do colaborador e registo da aceitação dos Termos e Condições no fecho da caixa
-- do frontoffice (o pop-up dos termos tem de ser aceite antes de escolher a recolha).

alter table orders add column if not exists buyer_nif text;
alter table orders add column if not exists termos_aceites_em timestamptz;

-- place_order ganha p_buyer_nif e p_termos_aceites (opcionais: o "simular encomenda" do
-- backoffice não os envia). Assinatura diferente, por isso a de 6 parâmetros sai.
drop function if exists place_order(text, text, text, jsonb, date, text);

create or replace function place_order(
  p_buyer_nome text,
  p_buyer_email text,
  p_buyer_telemovel text,
  p_items jsonb,
  p_recolha_data date default null,
  p_recolha_turno text default null,
  p_buyer_nif text default null,
  p_termos_aceites boolean default false
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
  v_ocupados  int;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'items_vazios';
  end if;

  if (p_recolha_data is null) <> (p_recolha_turno is null)
     or (p_recolha_turno is not null and p_recolha_turno not in ('manha', 'tarde')) then
    raise exception 'turno_invalido';
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

  -- Limite de 10 encomendas por turno. O advisory lock (um por dia+turno, libertado no fim
  -- da transação) põe em fila duas encomendas simultâneas para o mesmo turno: a segunda só
  -- conta depois de a primeira ter feito commit, por isso nunca passam as duas da 10.ª vaga.
  if p_recolha_data is not null then
    perform pg_advisory_xact_lock(hashtext('recolha:' || p_recolha_data::text || ':' || p_recolha_turno));
    select count(*) into v_ocupados from orders
      where recolha_data = p_recolha_data and recolha_turno = p_recolha_turno
        and estado not in ('cancelada', 'expirada');
    if v_ocupados >= 10 then
      raise exception 'turno_esgotado';
    end if;
  end if;

  v_codigo := 'BBD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('orders_codigo_seq')::text, 6, '0');

  select sum(p.preco * (i->>'quantidade')::int), sum(p.peso_kg * (i->>'quantidade')::int)
    into v_total, v_peso
    from jsonb_array_elements(p_items) i join products p on p.id = (i->>'product_id')::uuid;

  insert into orders (codigo, buyer_nome, buyer_email, buyer_telemovel, buyer_nif, total, peso_total_kg, estado, recolha_data, recolha_turno, termos_aceites_em)
    values (v_codigo, p_buyer_nome, p_buyer_email, p_buyer_telemovel, p_buyer_nif, v_total, v_peso, 'pendente', p_recolha_data, p_recolha_turno,
            case when p_termos_aceites then now() end)
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

revoke all on function place_order(text, text, text, jsonb, date, text, text, boolean) from public, anon, authenticated;
grant execute on function place_order(text, text, text, jsonb, date, text, text, boolean) to service_role;
grant execute on function place_order(text, text, text, jsonb, date, text, text, boolean) to authenticated;
