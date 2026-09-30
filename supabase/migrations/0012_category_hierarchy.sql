-- Reorganiza as categorias criadas pela importação (muito específicas: "MESA ALTA",
-- "SECRETÁRIA", "TV"...) numa hierarquia de duas camadas: um pequeno número de
-- categorias-mãe (as que já existiam, mais "Mesas" e "Iluminação") e, dentro de cada
-- uma, etiquetas (subcategorias) — acordado com o cliente a partir do exemplo de
-- taxonomia que enviou. Produtos dessas categorias antigas passam a ter a
-- categoria-mãe certa + a etiqueta correspondente; as categorias antigas são apagadas
-- no fim. Seguro de correr mais do que uma vez (idempotente).
--
-- Sem do$$/plpgsql: o executor de SQL usado corta o script em instruções e não lida
-- bem com blocos plpgsql nem com estado partilhado entre instruções (tabelas
-- temporárias, variáveis). Tudo abaixo é SQL simples — cada instrução é independente
-- e pode inclusive ser corrida sozinha.

-- 1) Renomeia as categorias-mãe que já existiam para o nome acordado.
update categories set nome = 'Secretárias e mesas de reunião', slug = 'secretarias-e-mesas-de-reuniao'
  where upper(trim(nome)) = upper(trim('Secretárias'));

update categories set nome = 'Cadeirões e sofás', slug = 'cadeiroes-e-sofas'
  where upper(trim(nome)) = upper(trim('Sofás e cadeirões'));

-- 2) Cria as categorias-mãe que ainda não existem.
insert into categories (nome, slug, ordem)
  select 'Mesas', 'mesas', (select coalesce(max(ordem), 0) + 1 from categories)
  where not exists (select 1 from categories where upper(trim(nome)) = 'MESAS');

insert into categories (nome, slug, ordem)
  select 'Iluminação', 'iluminacao', (select coalesce(max(ordem), 0) + 1 from categories)
  where not exists (select 1 from categories where upper(trim(nome)) = upper('Iluminação'));

-- 3) Cria (ou atualiza) a etiqueta de destino de cada categoria antiga, já dentro da
-- categoria-mãe certa.
insert into tags (category_id, nome, slug, ordem)
select c.id, t.etiqueta_nome, t.etiqueta_slug, t.etiqueta_ordem
from (values
  ('SECRETÁRIA', 'Secretárias individuais', 'secretarias-individuais', 1, 'Secretárias e mesas de reunião'),
  ('SECRETÁRIAS CONJUNTO', 'Secretárias em conjunto', 'secretarias-em-conjunto', 2, 'Secretárias e mesas de reunião'),
  ('MESA REUNIAO', 'Mesas de reunião', 'mesas-de-reuniao', 3, 'Secretárias e mesas de reunião'),
  ('MESA', 'Mesas', 'mesas', 1, 'Mesas'),
  ('MESA ALTA', 'Mesas altas', 'mesas-altas', 2, 'Mesas'),
  ('MESA BAIXA', 'Mesas baixas', 'mesas-baixas', 3, 'Mesas'),
  ('MESA PATIO', 'Mesas de pátio', 'mesas-de-patio', 4, 'Mesas'),
  ('MESA FORMACAO', 'Mesas de formação', 'mesas-de-formacao', 5, 'Mesas'),
  ('ARMÁRIO', 'Armários', 'armarios', 1, 'Outras superfícies'),
  ('ESTANTES', 'Estantes', 'estantes', 2, 'Outras superfícies'),
  ('CACIFOS', 'Cacifos', 'cacifos', 3, 'Outras superfícies'),
  ('CADEIRA', 'Normais', 'normais', 1, 'Cadeiras'),
  ('CADEIRA ALTA', 'Altas', 'altas', 2, 'Cadeiras'),
  ('SOFÁ', 'Sofás', 'sofas', 1, 'Cadeirões e sofás'),
  ('BENGALEIRO', 'Bengaleiros', 'bengaleiros', 1, 'Diversos'),
  ('GAVETAS', 'Gavetas', 'gavetas', 2, 'Diversos'),
  ('QUADRO', 'Quadros', 'quadros', 3, 'Diversos'),
  ('CANDEEIRO DE MESA', 'Candeeiro de mesa', 'candeeiro-de-mesa', 1, 'Iluminação'),
  ('TV', 'Televisões', 'televisoes', 1, 'Tecnologia'),
  ('FLIPCHART', 'Flipcharts', 'flipcharts', 2, 'Tecnologia')
) as t(old_nome, etiqueta_nome, etiqueta_slug, etiqueta_ordem, parent_nome)
join categories c on upper(trim(c.nome)) = upper(trim(t.parent_nome))
on conflict (category_id, slug) do update set nome = excluded.nome, ordem = excluded.ordem;

-- 4) Move os produtos das categorias antigas para a categoria-mãe + etiqueta corretas.
update products p
set category_id = x.parent_id, tag_id = x.tag_id
from (
  select oldc.id as old_id, parent.id as parent_id, tg.id as tag_id
  from (values
    ('SECRETÁRIA', 'secretarias-individuais', 'Secretárias e mesas de reunião'),
    ('SECRETÁRIAS CONJUNTO', 'secretarias-em-conjunto', 'Secretárias e mesas de reunião'),
    ('MESA REUNIAO', 'mesas-de-reuniao', 'Secretárias e mesas de reunião'),
    ('MESA', 'mesas', 'Mesas'),
    ('MESA ALTA', 'mesas-altas', 'Mesas'),
    ('MESA BAIXA', 'mesas-baixas', 'Mesas'),
    ('MESA PATIO', 'mesas-de-patio', 'Mesas'),
    ('MESA FORMACAO', 'mesas-de-formacao', 'Mesas'),
    ('ARMÁRIO', 'armarios', 'Outras superfícies'),
    ('ESTANTES', 'estantes', 'Outras superfícies'),
    ('CACIFOS', 'cacifos', 'Outras superfícies'),
    ('CADEIRA', 'normais', 'Cadeiras'),
    ('CADEIRA ALTA', 'altas', 'Cadeiras'),
    ('SOFÁ', 'sofas', 'Cadeirões e sofás'),
    ('BENGALEIRO', 'bengaleiros', 'Diversos'),
    ('GAVETAS', 'gavetas', 'Diversos'),
    ('QUADRO', 'quadros', 'Diversos'),
    ('CANDEEIRO DE MESA', 'candeeiro-de-mesa', 'Iluminação'),
    ('TV', 'televisoes', 'Tecnologia'),
    ('FLIPCHART', 'flipcharts', 'Tecnologia')
  ) as t(old_nome, etiqueta_slug, parent_nome)
  join categories oldc on upper(trim(oldc.nome)) = upper(trim(t.old_nome))
  join categories parent on upper(trim(parent.nome)) = upper(trim(t.parent_nome))
  join tags tg on tg.category_id = parent.id and tg.slug = t.etiqueta_slug
) x
where p.category_id = x.old_id;

-- 5) Apaga as categorias antigas, agora sem produtos.
delete from categories c
where upper(trim(c.nome)) in (
  'SECRETÁRIA', 'SECRETÁRIAS CONJUNTO', 'MESA REUNIAO', 'MESA', 'MESA ALTA', 'MESA BAIXA',
  'MESA PATIO', 'MESA FORMACAO', 'ARMÁRIO', 'ESTANTES', 'CACIFOS', 'CADEIRA', 'CADEIRA ALTA',
  'SOFÁ', 'BENGALEIRO', 'GAVETAS', 'QUADRO', 'CANDEEIRO DE MESA', 'TV', 'FLIPCHART'
)
and not exists (select 1 from products p where p.category_id = c.id);
