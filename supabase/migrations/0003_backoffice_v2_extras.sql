-- Segunda Vida — pequenos extras para o novo backoffice
-- Corre isto DEPOIS de 0002_backoffice_v2.sql já ter sido aplicado.

-- Templates de email que a referência mostra mas ainda não existiam na base de dados.
insert into email_templates (key, nome, assunto, corpo_html, corpo_texto) values
  (
    'order_ready',
    'Pronta para levantamento',
    'A tua encomenda {{numero_encomenda}} está pronta!',
    '<p>Olá {{nome}},</p><p>Boas notícias: a tua encomenda {{numero_encomenda}} já está pronta.</p><p>Onde: {{local_levantamento}}<br>Horário: {{horario}}</p><p>Total a pagar no local: {{total}}</p><p>Equipa Banco de Bens Doados</p>',
    'Olá {{nome}}, a tua encomenda {{numero_encomenda}} já está pronta. {{local_levantamento}} · {{horario}}. Total: {{total}}.'
  ),
  (
    'reserve_expiring',
    'Reserva a expirar',
    'Lembrete: levanta a encomenda {{numero_encomenda}} até {{data_limite}}',
    '<p>Olá {{nome}},</p><p>A tua reserva termina a {{data_limite}}. Depois dessa data, os artigos voltam automaticamente para a loja.</p><p>{{local_levantamento}} · {{horario}}</p>',
    'Olá {{nome}}, a tua reserva termina a {{data_limite}}. {{local_levantamento}} · {{horario}}.'
  ),
  (
    'low_stock_alert',
    'Alerta de stock baixo',
    'Stock baixo: {{produto}}',
    '<p>O produto {{produto}} tem apenas {{stock}} unidade(s) disponíveis na loja.</p><p>Revê o stock no backoffice.</p>',
    'O produto {{produto}} tem apenas {{stock}} unidade(s) disponíveis. Revê o stock no backoffice.'
  )
on conflict (key) do nothing;

-- Permite que o backoffice (sessão de admin autenticado) chame diretamente place_order,
-- usado pelo botão "Simular encomenda" da topbar. A loja real continua a chamar isto só
-- através de api/place-order.ts (service role), sem passar pela sessão do admin.
grant execute on function place_order(text, text, jsonb) to authenticated;
