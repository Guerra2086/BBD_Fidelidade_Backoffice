-- Reorganiza as categorias criadas pela importação (muito específicas: "MESA ALTA",
-- "SECRETÁRIA", "TV"...) numa hierarquia de duas camadas: um pequeno número de
-- categorias-mãe (as que já existiam, mais "Mesas" e "Iluminação") e, dentro de cada
-- uma, etiquetas (subcategorias) — acordado com o cliente a partir do exemplo de
-- taxonomia que enviou. Produtos dessas categorias antigas passam a ter a
-- categoria-mãe certa + a etiqueta correspondente; as categorias antigas são apagadas
-- no fim. Seguro de correr mais do que uma vez (idempotente).

begin;

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

-- 3) Mapa: categoria antiga (específica) -> etiqueta nova + categoria-mãe de destino.
create temporary table _cat_map (
  old_nome text primary key,
  etiqueta_nome text not null,
  etiqueta_slug text not null,
  etiqueta_ordem int not null,
  parent_nome text not null
) on commit drop;

insert into _cat_map (old_nome, etiqueta_nome, etiqueta_slug, etiqueta_ordem, parent_nome) values
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
  ('FLIPCHART', 'Flipcharts', 'flipcharts', 2, 'Tecnologia');

-- 4) Para cada linha do mapa: garante a etiqueta na categoria-mãe, move para lá os
-- produtos da categoria antiga (categoria + etiqueta) e apaga a categoria antiga.
do $$
declare
  r record;
  old_cat_id uuid;
  parent_id uuid;
  new_tag_id uuid;
begin
  for r in select * from _cat_map loop
    select id into old_cat_id from categories where upper(trim(nome)) = upper(trim(r.old_nome));
    if old_cat_id is null then
      continue;
    end if;

    select id into parent_id from categories where upper(trim(nome)) = upper(trim(r.parent_nome));
    if parent_id is null then
      raise exception 'Categoria-mãe não encontrada: %', r.parent_nome;
    end if;

    insert into tags (category_id, nome, slug, ordem)
      values (parent_id, r.etiqueta_nome, r.etiqueta_slug, r.etiqueta_ordem)
      on conflict (category_id, slug) do update set nome = excluded.nome, ordem = excluded.ordem
      returning id into new_tag_id;

    update products set category_id = parent_id, tag_id = new_tag_id where category_id = old_cat_id;

    delete from categories where id = old_cat_id;
  end loop;
end $$;

commit;
