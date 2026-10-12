-- Texto oficial dos 7 emails do ciclo de vida da encomenda, fornecido pelo Rodrigo/
-- ENTRAJUDA. Atualiza os 4 templates já existentes (order_confirmation, order_ready,
-- reserve_expiring, order_cancelled) e cria os 3 que faltavam (order_partial,
-- order_delivered, product_availability_info — este último não é enviado
-- automaticamente, é só uma resposta-modelo para a equipa usar manualmente).

update email_templates set
  nome = 'Pedido em análise',
  assunto = 'Pedido em análise | {{numero_encomenda}} | ReCircula powered by Fidelidade',
  corpo_html = '<p>Olá, {{nome}},</p><p>O seu pedido de manifestação de interesse com a referência <strong>{{numero_encomenda}}</strong> foi registado e está a ser analisado pela nossa equipa.</p><p>Receberá um novo email com a confirmação dos artigos e horário de recolha num prazo máximo de 72h úteis.</p><p>O presente email não confirma a atribuição dos artigos nem o agendamento de recolha.</p><p>Não é necessário efetuar qualquer pagamento nesta fase.</p><p>Agradecemos o seu interesse e a participação nesta iniciativa.</p><p>Com os melhores cumprimentos,<br>ENTRAJUDA | Banco de Bens Doados<br>ReCircula powered by Fidelidade</p>',
  corpo_texto = 'Olá, {{nome}},

O seu pedido de manifestação de interesse com a referência {{numero_encomenda}} foi registado e está a ser analisado pela nossa equipa.

Receberá um novo email com a confirmação dos artigos e horário de recolha num prazo máximo de 72h úteis.

O presente email não confirma a atribuição dos artigos nem o agendamento de recolha. Não é necessário efetuar qualquer pagamento nesta fase.

Agradecemos o seu interesse e a participação nesta iniciativa.

Com os melhores cumprimentos,
ENTRAJUDA | Banco de Bens Doados
ReCircula powered by Fidelidade',
  updated_at = now()
where key = 'order_confirmation';

update email_templates set
  nome = 'Confirmação total do pedido',
  assunto = 'O seu pedido está confirmado | {{numero_encomenda}} | ReCircula powered by Fidelidade',
  corpo_html = '<p>Olá, {{nome}},</p><p>O seu pedido <strong>{{numero_encomenda}}</strong> está confirmado.</p><p><strong>Artigos:</strong><br>{{itens}}</p><p>Valor total de donativo: <strong>{{total}}</strong></p><p><strong>Informações de recolha:</strong><br>Data: {{data_limite}}<br>Horário: {{horario}}<br>Local: {{local_levantamento}}</p><p>A recolha apenas poderá ser realizada na data e no período horário acima indicados. Ao recolher o pedido, apresente a referência do pedido à nossa equipa.</p><p>Caso surja algum imprevisto, por favor informe a nossa equipa, através de <a href="mailto:campanhas.bbd@entrajuda.pt">campanhas.bbd@entrajuda.pt</a>, indicando a referência do pedido. A possibilidade de reagendamento depende da disponibilidade e não é garantida.</p><p>Agradecemos a sua participação e o contributo para dar uma segunda vida a estes artigos.</p><p>Com os melhores cumprimentos,<br>ENTRAJUDA | Banco de Bens Doados<br>ReCircula powered by Fidelidade</p>',
  corpo_texto = 'Olá, {{nome}},

O seu pedido {{numero_encomenda}} está confirmado.

Artigos:
{{itens}}

Valor total de donativo: {{total}}

Informações de recolha:
Data: {{data_limite}}
Horário: {{horario}}
Local: {{local_levantamento}}

A recolha apenas poderá ser realizada na data e no período horário acima indicados. Ao recolher o pedido, apresente a referência do pedido à nossa equipa.

Caso surja algum imprevisto, por favor informe a nossa equipa, através de campanhas.bbd@entrajuda.pt, indicando a referência do pedido. A possibilidade de reagendamento depende da disponibilidade e não é garantida.

Agradecemos a sua participação e o contributo para dar uma segunda vida a estes artigos.

Com os melhores cumprimentos,
ENTRAJUDA | Banco de Bens Doados
ReCircula powered by Fidelidade',
  updated_at = now()
where key = 'order_ready';

update email_templates set
  nome = 'Lembrete de recolha',
  assunto = 'O levantamento do seu pedido é amanhã | {{numero_encomenda}} | ReCircula powered by Fidelidade',
  corpo_html = '<p>Olá, {{nome}},</p><p>Recordamos que a recolha do seu pedido <strong>{{numero_encomenda}}</strong> está agendada para amanhã.</p><p><strong>Informações de recolha:</strong><br>Data: {{data_limite}}<br>Horário: {{horario}}<br>Local: {{local_levantamento}}</p><p>Deverá comparecer apenas na data e no período horário indicados. Apresente a referência do pedido à equipa responsável pela entrega.</p><p>Relembramos algumas informações importantes a considerar antes de efetuar a sua recolha:</p><p><strong>Entrega de donativo:</strong> o valor total de donativo — <strong>{{total}}</strong> — é pago no ato de recolha, após a verificação dos artigos, por Multibanco, MB WAY ou dinheiro.<br><strong>Carga e transporte:</strong> são da sua responsabilidade. Assegure a viatura e os meios necessários para recolher os artigos.</p><p>Consulte os <a href="https://bbd-recircula.pt/termos">Termos e Condições</a>. A leitura integral é obrigatória antes da entrega do donativo.</p><p>Caso surja algum imprevisto, por favor informe a nossa equipa, através de <a href="mailto:campanhas.bbd@entrajuda.pt">campanhas.bbd@entrajuda.pt</a>, indicando a referência do pedido. A possibilidade de reagendamento depende da disponibilidade e não é garantida.</p><p>O não comparecimento implica o cancelamento da reserva dos artigos.</p><p>Agradecemos a sua participação!</p><p>Com os melhores cumprimentos,<br>ENTRAJUDA | Banco de Bens Doados<br>ReCircula powered by Fidelidade</p>',
  corpo_texto = 'Olá, {{nome}},

Recordamos que a recolha do seu pedido {{numero_encomenda}} está agendada para amanhã.

Informações de recolha:
Data: {{data_limite}}
Horário: {{horario}}
Local: {{local_levantamento}}

Deverá comparecer apenas na data e no período horário indicados. Apresente a referência do pedido à equipa responsável pela entrega.

Relembramos algumas informações importantes a considerar antes de efetuar a sua recolha:
Entrega de donativo: o valor total de donativo - {{total}} - é pago no ato de recolha, após a verificação dos artigos, por Multibanco, MB WAY ou dinheiro.
Carga e transporte: são da sua responsabilidade. Assegure a viatura e os meios necessários para recolher os artigos.

Consulte os Termos e Condições em https://bbd-recircula.pt/termos. A leitura integral é obrigatória antes da entrega do donativo.

Caso surja algum imprevisto, por favor informe a nossa equipa, através de campanhas.bbd@entrajuda.pt, indicando a referência do pedido. A possibilidade de reagendamento depende da disponibilidade e não é garantida.

O não comparecimento implica o cancelamento da reserva dos artigos.

Agradecemos a sua participação!

Com os melhores cumprimentos,
ENTRAJUDA | Banco de Bens Doados
ReCircula powered by Fidelidade',
  updated_at = now()
where key = 'reserve_expiring';

update email_templates set
  nome = 'Pedido não recolhido',
  assunto = 'Pedido cancelado por falta de recolha | {{numero_encomenda}} | ReCircula powered by Fidelidade',
  corpo_html = '<p>Olá, {{nome}},</p><p>Não registámos a recolha do seu pedido <strong>{{numero_encomenda}}</strong>, agendada para {{data_limite}}, no horário {{horario}}.</p><p>Conforme consta nos Termos e Condições, o seu pedido foi cancelado. Não será possível realizar um novo agendamento, uma vez que os artigos serão encaminhados para doação a organizações sociais.</p><p>Não é devido qualquer donativo ou pagamento relativo a este pedido.</p><p>Agradecemos o seu interesse na iniciativa.</p><p>Com os melhores cumprimentos,<br>ENTRAJUDA | Banco de Bens Doados<br>ReCircula powered by Fidelidade</p>',
  corpo_texto = 'Olá, {{nome}},

Não registámos a recolha do seu pedido {{numero_encomenda}}, agendada para {{data_limite}}, no horário {{horario}}.

Conforme consta nos Termos e Condições, o seu pedido foi cancelado. Não será possível realizar um novo agendamento, uma vez que os artigos serão encaminhados para doação a organizações sociais.

Não é devido qualquer donativo ou pagamento relativo a este pedido.

Agradecemos o seu interesse na iniciativa.

Com os melhores cumprimentos,
ENTRAJUDA | Banco de Bens Doados
ReCircula powered by Fidelidade',
  updated_at = now()
where key = 'order_cancelled';

insert into email_templates (key, nome, assunto, corpo_html, corpo_texto) values
  (
    'order_partial',
    'Pedido parcialmente aceite',
    'O seu pedido foi parcialmente aceite | {{numero_encomenda}} | ReCircula powered by Fidelidade',
    '<p>Olá, {{nome}},</p><p>O seu pedido <strong>{{numero_encomenda}}</strong> foi parcialmente aceite.</p><p>Confirmamos a reserva dos artigos e quantidades indicados abaixo. Os restantes artigos ou quantidades solicitadas não foram atribuídos por falta de stock.</p><p><strong>Artigos e quantidades confirmados:</strong><br>{{itens}}</p><p>Valor total de donativo: <strong>{{total}}</strong></p><p>Este valor corresponde apenas aos artigos confirmados. O donativo deverá ser efetuado no levantamento, após a verificação dos artigos.</p><p><strong>Informações de recolha:</strong><br>Data: {{data_limite}}<br>Horário: {{horario}}<br>Local: {{local_levantamento}}</p><p>A recolha apenas poderá ser realizada na data e no período horário acima indicados. Ao recolher os artigos, apresente a referência do pedido à equipa responsável pela entrega.</p><p>Caso surja algum imprevisto, por favor informe a nossa equipa, através de <a href="mailto:campanhas.bbd@entrajuda.pt">campanhas.bbd@entrajuda.pt</a>, indicando a referência do pedido. A possibilidade de reagendamento depende da disponibilidade e não é garantida.</p><p>Agradecemos a sua participação e o contributo para dar uma segunda vida a estes artigos.</p><p>Com os melhores cumprimentos,<br>ENTRAJUDA | Banco de Bens Doados<br>ReCircula powered by Fidelidade</p>',
    'Olá, {{nome}},

O seu pedido {{numero_encomenda}} foi parcialmente aceite.

Confirmamos a reserva dos artigos e quantidades indicados abaixo. Os restantes artigos ou quantidades solicitadas não foram atribuídos por falta de stock.

Artigos e quantidades confirmados:
{{itens}}

Valor total de donativo: {{total}}

Este valor corresponde apenas aos artigos confirmados. O donativo deverá ser efetuado no levantamento, após a verificação dos artigos.

Informações de recolha:
Data: {{data_limite}}
Horário: {{horario}}
Local: {{local_levantamento}}

A recolha apenas poderá ser realizada na data e no período horário acima indicados. Ao recolher os artigos, apresente a referência do pedido à equipa responsável pela entrega.

Caso surja algum imprevisto, por favor informe a nossa equipa, através de campanhas.bbd@entrajuda.pt, indicando a referência do pedido. A possibilidade de reagendamento depende da disponibilidade e não é garantida.

Agradecemos a sua participação e o contributo para dar uma segunda vida a estes artigos.

Com os melhores cumprimentos,
ENTRAJUDA | Banco de Bens Doados
ReCircula powered by Fidelidade'
  ),
  (
    'order_delivered',
    'Recolha concluída',
    'Recolha concluída | {{numero_encomenda}} | ReCircula powered by Fidelidade',
    '<p>Olá, {{nome}},</p><p>Confirmamos que os artigos do seu pedido <strong>{{numero_encomenda}}</strong> foram recolhidos.</p><p>Agradecemos a sua participação na iniciativa ReCircula powered by Fidelidade e o seu contributo para a missão da ENTRAJUDA.</p><p>Ao dar uma segunda vida a estes artigos promove a economia circular e o apoio ao setor social.</p><p>Com os melhores cumprimentos,<br>ENTRAJUDA | Banco de Bens Doados<br>ReCircula powered by Fidelidade</p>',
    'Olá, {{nome}},

Confirmamos que os artigos do seu pedido {{numero_encomenda}} foram recolhidos.

Agradecemos a sua participação na iniciativa ReCircula powered by Fidelidade e o seu contributo para a missão da ENTRAJUDA.

Ao dar uma segunda vida a estes artigos promove a economia circular e o apoio ao setor social.

Com os melhores cumprimentos,
ENTRAJUDA | Banco de Bens Doados
ReCircula powered by Fidelidade'
  ),
  (
    'product_availability_info',
    'Disponibilidade de artigos (resposta manual)',
    'Disponibilidade de artigos | ReCircula powered by Fidelidade',
    '<p>Olá,</p><p>Obrigado pelo seu contacto e pelo interesse na iniciativa ReCircula powered by Fidelidade.</p><p>Nem todos os artigos dos antigos escritórios da Fidelidade foram integrados nesta iniciativa, como é o caso do artigo que refere.</p><p>Consulte os artigos disponíveis na Loja Online. Os pedidos devem ser submetidos e ficam sujeitos a análise e confirmação de stock pela nossa equipa.</p><p>Com os melhores cumprimentos,<br>ENTRAJUDA | Banco de Bens Doados<br>ReCircula powered by Fidelidade</p>',
    'Olá,

Obrigado pelo seu contacto e pelo interesse na iniciativa ReCircula powered by Fidelidade.

Nem todos os artigos dos antigos escritórios da Fidelidade foram integrados nesta iniciativa, como é o caso do artigo que refere.

Consulte os artigos disponíveis na Loja Online. Os pedidos devem ser submetidos e ficam sujeitos a análise e confirmação de stock pela nossa equipa.

Com os melhores cumprimentos,
ENTRAJUDA | Banco de Bens Doados
ReCircula powered by Fidelidade'
  )
on conflict (key) do update set
  nome = excluded.nome,
  assunto = excluded.assunto,
  corpo_html = excluded.corpo_html,
  corpo_texto = excluded.corpo_texto,
  updated_at = now();
