# Segunda Vida — Backoffice

Painel de gestão da loja solidária "Segunda Vida" (Fidelidade × Banco de Bens Doados). React + Vite + TypeScript,
autenticação Supabase (magic link, só admins), e dono das migrações/Edge Functions partilhadas com o frontoffice.

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local   # preenche com os valores do projeto Supabase
npm run dev
```

`VITE_DEV_BYPASS_AUTH=true` no `.env.local` permite navegar no backoffice sem a tabela `profiles`/`is_admin()`
estar ainda migrada — **nunca usar em produção**.

## Testes

```bash
npm run test
```

Cobre sobretudo o `<TopNav>` (`src/components/TopNav/TopNav.test.tsx`): um só submenu aberto de cada vez, toggle,
fecho ao navegar, fecho ao clicar fora e no Esc com foco de volta ao trigger.

## Base de dados (Supabase)

Este repositório é o dono de `supabase/` (migrações, seed e Edge Functions), mesmo servindo também o frontoffice —
é o repo "de operações". Passos para aplicar a um projeto Supabase real (precisa do [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push                 # aplica supabase/migrations/0001_init.sql
supabase functions deploy        # publica todas as funções em supabase/functions/
```

Segredos que as Edge Functions precisam (nunca no frontend):

```bash
supabase secrets set GATE_SESSION_SECRET=<uma-string-aleatoria-longa>
supabase secrets set RESEND_API_KEY=<chave-da-resend>
supabase secrets set ANTHROPIC_API_KEY=<chave-da-anthropic>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente pelo runtime das
Edge Functions — não precisam de ser definidos à mão.

### Arquitetura de acesso (porquê não há RLS "normal" no frontoffice)

O frontoffice não usa Supabase Auth — só uma palavra-passe única, validada no servidor (requisito do cliente).
Por isso todas as tabelas da loja (`products`, `categories`, `orders`, …) têm RLS "deny-all": sem grants para
`anon`/`authenticated`. Toda a leitura/escrita da loja passa por Edge Functions que usam a `service_role` key e
validam um "gate token" (JWT emitido por `gate-login` depois de confirmar a palavra-passe). Ver
`supabase/functions/_shared/gate.ts`.

O backoffice usa Supabase Auth normalmente (magic link) e fala diretamente com a Supabase — RLS com `is_admin()`
protege as tabelas para esse caso.

### Password do site por omissão

A seed define a palavra-passe **`segunda-vida`** (hash bcrypt em `site_settings.site_password_hash`). Muda-a assim
que possível em **Conteúdos → Configurações**, que chama a Edge Function `admin-set-password`.

## Deploy (Vercel)

Projeto Vite standard — usa `vercel.json` (rewrite SPA) e define `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` nas
variáveis de ambiente do projeto Vercel. Depois de publicado, atualiza os "Redirect URLs" do Supabase Auth para
incluir o domínio Vercel deste backoffice.
