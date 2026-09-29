-- Etiquetas: subdivisão dentro de cada categoria, usada na Montra do frontoffice como
-- filtro secundário (quadrado de categoria "abre" e mostra as etiquetas dessa categoria,
-- tal como uma pasta mostra subpastas). Cada etiqueta pertence a uma única categoria;
-- cada produto tem no máximo uma etiqueta.

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  nome text not null,
  slug text not null,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists tags_category_id_slug_key on tags(category_id, slug);

alter table tags enable row level security;
revoke all on tags from anon, authenticated;
drop policy if exists "admins gerem tags" on tags;
create policy "admins gerem tags" on tags for all using (is_admin()) with check (is_admin());

alter table products add column if not exists tag_id uuid references tags(id) on delete set null;
