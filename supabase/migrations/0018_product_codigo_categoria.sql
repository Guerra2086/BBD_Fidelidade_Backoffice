-- Código curto por categoria (1ª letra da categoria + nº sequencial, ex.: CADEIRAS -> C1,
-- C2, ..., MESAS -> M1, M2, ...), atribuído pela ordem de aparição no Excel na importação
-- em massa, ou pelo lado do Backoffice (lib/categories.ts) ao criar um produto manualmente.
-- É só uma referência visual para a equipa, sem garantia de unicidade a nível da base de dados.

alter table products add column if not exists codigo_categoria text;
