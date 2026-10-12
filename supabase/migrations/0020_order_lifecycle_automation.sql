-- Fecha o ciclo de vida da encomenda: aceitação parcial pelo admin, lembrete automático
-- no dia anterior à recolha, e cancelamento automático de quem não compareceu. Chamado
-- por um cron diário (ver api/cron-daily.ts) com a service-role key — por isso estas RPCs
-- não exigem is_admin(), só o grant de execução.

-- Local de recolha real (estava com texto TODO desde a 0002).
update site_settings set value = jsonb_set(value, '{place}', '"R. José da Felicidade Alves 10, Lisboa"')
  where key = 'pickup_info';

-- Evita reenviar o lembrete de recolha todos os dias para a mesma encomenda.
alter table orders add column if not exists lembrete_enviado boolean not null default false;

-- ============================================================
-- RPC: confirm_order_partial — admin aceita só parte dos artigos/quantidades de uma
-- encomenda pendente. Repõe o stock da diferença, recalcula total/peso, e deixa a
-- encomenda pronta para levantamento (tal como uma aceitação total). Se nenhum artigo
-- ficar confirmado, a encomenda é cancelada em vez de ficar vazia.
-- ============================================================
create or replace function confirm_order_partial(p_order_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_admin_nome text;
  v_item jsonb;
  v_order_item record;
  v_nova_qtd int;
  v_delta int;
  v_total numeric := 0;
  v_peso numeric := 0;
begin
  if not is_admin() then
    raise exception 'not_authorized';
  end if;

  select estado into v_estado from orders where id = p_order_id for update;
  if v_estado is null then raise exception 'order_not_found'; end if;
  if v_estado <> 'pendente' then raise exception 'estado_invalido'; end if;

  select nome into v_admin_nome from profiles where id = auth.uid();

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_order_item from order_items where id = (v_item->>'item_id')::uuid and order_id = p_order_id;
    if v_order_item is null then continue; end if;

    v_nova_qtd := greatest(0, (v_item->>'quantidade')::int);
    v_delta := v_order_item.quantidade - v_nova_qtd;

    if v_delta > 0 and v_order_item.product_id is not null then
      update products set stock = stock + v_delta, updated_at = now() where id = v_order_item.product_id;
      insert into stock_movements (product_id, delta, motivo, ref_order_id, user_label, resulting_stock)
        select v_order_item.product_id, v_delta, 'Aceitação parcial — stock reposto', p_order_id, coalesce(v_admin_nome, 'Sistema'), stock
        from products where id = v_order_item.product_id;
    end if;

    if v_nova_qtd <= 0 then
      delete from order_items where id = v_order_item.id;
    else
      update order_items set quantidade = v_nova_qtd where id = v_order_item.id;
    end if;
  end loop;

  select coalesce(sum(oi.quantidade * oi.preco_unitario), 0), coalesce(sum(oi.quantidade * coalesce(p.peso_kg, 0)), 0)
    into v_total, v_peso
    from order_items oi left join products p on p.id = oi.product_id
    where oi.order_id = p_order_id;

  if v_total = 0 then
    update orders set estado = 'cancelada', total = 0, peso_total_kg = 0, updated_at = now() where id = p_order_id;
    insert into order_events (order_id, texto) values (p_order_id, 'Todos os artigos recusados na revisão — encomenda cancelada automaticamente');
    return;
  end if;

  update orders set estado = 'pronta_levantamento', total = v_total, peso_total_kg = v_peso, updated_at = now() where id = p_order_id;
  insert into order_events (order_id, texto) values (p_order_id, 'Pedido parcialmente aceite — quantidades ajustadas, stock reposto');
end;
$$;

revoke all on function confirm_order_partial(uuid, jsonb) from public, anon;
grant execute on function confirm_order_partial(uuid, jsonb) to authenticated;

-- ============================================================
-- RPC: orders_needing_reminder / mark_reminder_sent — encomendas prontas a levantar cuja
-- recolha é amanhã e ainda não receberam o lembrete (o envio do email é feito em JS pelo
-- cron, que depois chama mark_reminder_sent para não repetir no dia seguinte).
-- ============================================================
create or replace function orders_needing_reminder()
returns setof orders
language sql
security definer
set search_path = public
as $$
  select * from orders
  where estado = 'pronta_levantamento'
    and recolha_data = (current_date + 1)
    and lembrete_enviado = false;
$$;

create or replace function mark_reminder_sent(p_order_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update orders set lembrete_enviado = true where id = p_order_id;
$$;

revoke all on function orders_needing_reminder() from public, anon;
grant execute on function orders_needing_reminder() to authenticated;
revoke all on function mark_reminder_sent(uuid) from public, anon;
grant execute on function mark_reminder_sent(uuid) to authenticated;

-- ============================================================
-- RPC: cancel_unclaimed_pickups — cancela e repõe o stock das encomendas prontas a
-- levantar cuja data de recolha já passou sem o pagamento ter sido registado. Devolve as
-- encomendas canceladas para o cron (em JS) poder enviar o email "não recolhido" a cada
-- uma. Respeita o interruptor "auto_expire_enabled" já existente nas Definições.
-- ============================================================
create or replace function cancel_unclaimed_pickups()
returns setof orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_order record;
begin
  select (value->>'enabled')::boolean into v_enabled from site_settings where key = 'auto_expire_enabled';
  if not coalesce(v_enabled, true) then
    return;
  end if;

  for v_order in
    select * from orders
    where estado = 'pronta_levantamento' and recolha_data < current_date
    for update
  loop
    update products p set stock = p.stock + oi.quantidade, updated_at = now()
      from order_items oi where oi.order_id = v_order.id and oi.product_id = p.id;

    insert into stock_movements (product_id, delta, motivo, ref_order_id, user_label, resulting_stock)
      select p.id, oi.quantidade, 'Encomenda não recolhida — stock reposto automaticamente', v_order.id, 'Sistema', p.stock
      from order_items oi join products p on p.id = oi.product_id
      where oi.order_id = v_order.id;

    update orders set estado = 'cancelada', updated_at = now() where id = v_order.id;
    insert into order_events (order_id, texto) values (v_order.id, 'Cancelada automaticamente — artigos não recolhidos na data marcada, stock reposto');

    return next v_order;
  end loop;
end;
$$;

revoke all on function cancel_unclaimed_pickups() from public, anon;
grant execute on function cancel_unclaimed_pickups() to authenticated;
