-- A tabela tags (criada em 0011_tags.sql, depois do grant geral em
-- 0005_grant_authenticated_privileges.sql) ficou sem o GRANT de base para o role
-- authenticated — só tinha RLS. O Postgres exige as duas coisas (ver nota em 0005);
-- sem o grant, qualquer leitura/escrita a tags falha com "permission denied for
-- table tags", mesmo para um admin autenticado (ex.: dropdown de etiquetas em
-- Produtos, importação em massa).
grant select, insert, update, delete on tags to authenticated;
