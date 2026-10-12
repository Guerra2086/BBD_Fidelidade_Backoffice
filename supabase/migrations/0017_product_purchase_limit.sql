-- Limite de compra por artigo (distinto do limite por categoria que já existia): quantas
-- unidades DESTE artigo um colaborador pode levar no total, somando todas as encomendas
-- que já tenha feito (identificado por email, NIF ou telemóvel — qualquer um a bater certo
-- conta como a mesma pessoa), não só o carrinho atual. Sem limite quando é null.

alter table products add column if not exists limite_compra integer check (limite_compra is null or limite_compra > 0);

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
  v_total       numeric := 0;
  v_peso        numeric := 0;
  v_order_id    uuid;
  v_codigo      text;
  v_cat         record;
  v_item        record;
  v_qty         int;
  v_ocupados    int;
  v_capacidade  int;
  v_ja_levado   int;
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

  -- limite de compra por artigo: soma o que a mesma pessoa (email, NIF ou telemóvel) já
  -- levou noutras encomendas ainda válidas, mais o que está a pedir agora.
  for v_item in
    select (i->>'product_id')::uuid product_id, (i->>'quantidade')::int quantidade, p.limite_compra, p.nome
    from jsonb_array_elements(p_items) i
    join products p on p.id = (i->>'product_id')::uuid
    where p.limite_compra is not null
  loop
    select coalesce(sum(oi.quantidade), 0) into v_ja_levado
      from order_items oi
      join orders o on o.id = oi.order_id
      where oi.product_id = v_item.product_id
        and o.estado not in ('cancelada', 'expirada')
        and (
          lower(o.buyer_email) = lower(p_buyer_email)
          or (p_buyer_nif is not null and o.buyer_nif = p_buyer_nif)
          or (p_buyer_telemovel is not null and o.buyer_telemovel = p_buyer_telemovel)
        );
    if v_ja_levado + v_item.quantidade > v_item.limite_compra then
      raise exception 'limite_artigo_excedido';
    end if;
  end loop;

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

  -- Limite de encomendas por período: 20 num dia útil (um único período, 11h-20h), 10 ao
  -- fim de semana (dois períodos, manhã/tarde). O advisory lock (um por dia+turno,
  -- libertado no fim da transação) põe em fila duas encomendas simultâneas para o mesmo
  -- período: a segunda só conta depois de a primeira ter feito commit, por isso nunca
  -- passam as duas da última vaga.
  if p_recolha_data is not null then
    perform pg_advisory_xact_lock(hashtext('recolha:' || p_recolha_data::text || ':' || p_recolha_turno));
    v_capacidade := case when extract(dow from p_recolha_data) in (0, 6) then 10 else 20 end;
    select count(*) into v_ocupados from orders
      where recolha_data = p_recolha_data and recolha_turno = p_recolha_turno
        and estado not in ('cancelada', 'expirada');
    if v_ocupados >= v_capacidade then
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

-- Mesma regra de limite de compra que o place_order aplica a sério, mas só de leitura —
-- usada no passo "Dados" do checkout para avisar logo quem já esgotou o limite de um
-- artigo, sem esperar pelo fim do fecho da caixa. Devolve só os artigos problemáticos.
create or replace function check_purchase_limits(
  p_buyer_email text,
  p_buyer_nif text,
  p_buyer_telemovel text,
  p_items jsonb
)
returns table (product_id uuid, nome text, limite int, ja_levado int, pedindo int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_ja_levado int;
begin
  for v_item in
    select (i->>'product_id')::uuid pid, (i->>'quantidade')::int quantidade, p.limite_compra, p.nome
    from jsonb_array_elements(p_items) i
    join products p on p.id = (i->>'product_id')::uuid
    where p.limite_compra is not null
  loop
    select coalesce(sum(oi.quantidade), 0) into v_ja_levado
      from order_items oi
      join orders o on o.id = oi.order_id
      where oi.product_id = v_item.pid
        and o.estado not in ('cancelada', 'expirada')
        and (
          lower(o.buyer_email) = lower(p_buyer_email)
          or (p_buyer_nif is not null and o.buyer_nif = p_buyer_nif)
          or (p_buyer_telemovel is not null and o.buyer_telemovel = p_buyer_telemovel)
        );
    if v_ja_levado + v_item.quantidade > v_item.limite_compra then
      product_id := v_item.pid;
      nome := v_item.nome;
      limite := v_item.limite_compra;
      ja_levado := v_ja_levado;
      pedindo := v_item.quantidade;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function check_purchase_limits(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function check_purchase_limits(text, text, text, jsonb) to service_role;
