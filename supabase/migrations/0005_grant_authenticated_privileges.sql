-- Segunda Vida — concede ao role authenticated os privilégios de base que faltavam.
-- Corre isto DEPOIS de 0004_remove_chatbot_add_smtp_settings.sql já ter sido aplicado.
--
-- As migrações anteriores fizeram "revoke all ... from anon, authenticated" nas
-- tabelas do backoffice e confiaram só nas políticas RLS (using (is_admin())) para as
-- proteger. Mas o Postgres exige as DUAS coisas: o privilégio de base (grant) e a
-- política RLS — sem o grant, o Postgres nega o pedido com "permission denied for
-- table X" (403) antes sequer de avaliar a RLS, mesmo para um admin autenticado.
-- Isto deixava praticamente toda a leitura/escrita direta do backoffice (Emails,
-- Definições, Categorias, listagens de Produtos/Encomendas/Movimentos) sempre a
-- falhar em produção, mesmo com sessão de admin válida. A RLS existente continua a
-- ser a única coisa que decide QUAIS linhas cada pedido vê — isto só destranca a
-- tabela para o role poder tentar.
grant select, insert, update, delete on categories to authenticated;
grant select, insert, update, delete on products to authenticated;
grant select, insert, update, delete on orders to authenticated;
grant select, insert, update, delete on order_items to authenticated;
grant select, update on site_settings to authenticated;
grant select, insert, update, delete on email_templates to authenticated;
grant select on order_events to authenticated;
grant select, insert on stock_movements to authenticated;
