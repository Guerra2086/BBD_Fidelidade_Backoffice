-- Segunda Vida — importação de produtos por pasta + galeria com múltiplas versões de imagem.
-- Corre isto DEPOIS de 0005_grant_authenticated_privileges.sql já ter sido aplicado.

-- ============================================================
-- CATEGORIAS: assinala as criadas automaticamente pela importação
-- ============================================================
alter table categories add column if not exists created_by_import boolean not null default false;

-- ============================================================
-- PRODUTOS: campos do inventário (importação) + motivo de não publicado
-- ============================================================
alter table products add column if not exists external_id text unique;
alter table products add column if not exists medidas text;
alter table products add column if not exists formato text;
alter table products add column if not exists edificios text;
alter table products add column if not exists grade text;
alter table products add column if not exists destinos text[];
alter table products add column if not exists codigo_slide text;
alter table products add column if not exists review_status text;
-- "ativo" já é o conceito de "publicado" (storefront-data.ts filtra por ele) — não se
-- cria nenhuma coluna nova para isso, só se reutiliza a existente.

-- O preço sugerido do inventário pode vir vazio (produto ainda por avaliar) — deixa de
-- ser obrigatório; sem preço, o produto nunca fica publicado (ver regra em Importar.tsx).
alter table products alter column preco drop not null;

-- ============================================================
-- FOTOGRAFIAS: substitui products.fotos (uma URL por foto) por uma tabela com as 3
-- versões geradas pelo tratamento automático (large/medium/thumb), sempre com o
-- objeto inteiro e enquadrado — nunca cortado.
-- ============================================================
create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  posicao int not null default 0,
  capa boolean not null default false,
  original_path text not null,
  large_path text not null,
  medium_path text not null,
  thumb_path text not null,
  largura int,
  altura int,
  quality_flags jsonb not null default '{}',
  enquadramento jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table product_images enable row level security;
revoke all on product_images from anon, authenticated;
create policy "admins gerem fotos de produto" on product_images for all using (is_admin()) with check (is_admin());
grant select, insert, update, delete on product_images to authenticated;

create index product_images_product_id_idx on product_images (product_id, posicao);

-- Backfill não destrutivo: cada foto que já exista em products.fotos passa a uma linha
-- em product_images, com o mesmo URL nos 4 campos de path (ainda sem tratamento) e
-- marcada para reprocessamento — o botão "Reprocessar todas as imagens" trata delas.
insert into product_images (product_id, posicao, capa, original_path, large_path, medium_path, thumb_path, quality_flags)
select p.id, f.ord - 1, f.ord = 1, f.url, f.url, f.url, f.url, '{"needs_reprocessing": true}'::jsonb
from products p
cross join lateral unnest(p.fotos) with ordinality as f(url, ord)
where p.fotos is not null and array_length(p.fotos, 1) > 0;

alter table products drop column if exists fotos;

-- ============================================================
-- HISTÓRICO DE IMPORTAÇÕES
-- ============================================================
create table if not exists import_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  summary jsonb not null default '{}'
);

alter table import_logs enable row level security;
revoke all on import_logs from anon, authenticated;
create policy "admins gerem import_logs" on import_logs for all using (is_admin()) with check (is_admin());
grant select, insert on import_logs to authenticated;
