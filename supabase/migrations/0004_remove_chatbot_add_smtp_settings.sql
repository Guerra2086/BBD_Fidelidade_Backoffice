-- Segunda Vida — remove o chatbot (FAQs/conversas, frontoffice e backoffice deixam de o usar)
-- e acrescenta os campos de "servidor de envio" que a referência mostra em Definições/Emails.
-- Corre isto DEPOIS de 0003_backoffice_v2_extras.sql já ter sido aplicado.

-- O chat nunca chegou a ser pedido como requisito de negócio — foi removido a pedido do
-- Rodrigo. Junto com as tabelas caem as FAQs (chat_messages depende de chat_conversations).
drop table if exists chat_messages;
drop table if exists chat_conversations;
drop table if exists faqs;

-- Campos adicionais do remetente/servidor de envio, tal como aparecem em
-- Definições → Remetente dos emails. O envio real continua a ser feito pela API da Resend
-- (RESEND_API_KEY no Vercel) — os campos "smtp_*" são só para o ecrã bater certo com a
-- referência; a palavra-passe nunca é guardada aqui (nem sequer é enviada pelo browser).
insert into site_settings (key, value) values
  ('reply_to_address', '{"address": "campanhas.bbd@entrajuda.pt"}'),
  ('smtp_config', '{"host": "smtp.resend.com", "port": 465, "secure": "SSL/TLS", "user": "campanhas.bbd@entrajuda.pt"}')
on conflict (key) do nothing;
