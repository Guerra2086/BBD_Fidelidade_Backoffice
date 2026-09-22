# Segunda Vida — Backoffice

Painel de gestão da loja solidária "Segunda Vida" (Fidelidade × Banco de Bens Doados). React + Vite + TypeScript,
autenticação Supabase (magic link, só admins), e dono da migração da base de dados partilhada com o frontoffice.

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local   # preenche com os valores do projeto Supabase
npm run dev
```

`VITE_DEV_BYPASS_AUTH=true` no `.env.local` permite navegar no backoffice sem a tabela `profiles`/`is_admin()`
estar ainda migrada — **nunca usar em produção**.

As funções em `api/` (`admin-set-password`, `send-test-email`, `send-order-email`) só correm mesmo com
`vercel dev` (Vercel CLI), não com `vite dev` — para as testares localmente usa `vercel dev` em vez de `npm run dev`.

## Testes

```bash
npm run test
```

Cobre sobretudo o `<TopNav>` (`src/components/TopNav/TopNav.test.tsx`): um só submenu aberto de cada vez, toggle,
fecho ao navegar, fecho ao clicar fora e no Esc com foco de volta ao trigger.

## Arquitetura: Supabase é só a base de dados

Não há Supabase Edge Functions neste projeto — de propósito. O Supabase serve **só como base de dados** (tabelas
+ Storage), acedida a partir de código nosso a correr como **funções serverless do Vercel** (pasta `api/`, uma
por ficheiro, deploy automático a cada `git push`, sem CLI nem passo extra no Supabase).

- `api/admin-set-password.ts`, `api/send-test-email.ts`, `api/send-order-email.ts`: exigem uma sessão Supabase
  Auth real de admin (o pedido reencaminha o JWT da sessão; a função confirma `is_admin()` via RPC — ver
  `api/_shared/adminAuth.ts`) e usam a `service_role` key para escrever (ver `api/_shared/supabaseAdmin.ts`).
- O resto do backoffice (Produtos, Encomendas, Colaboradores, FAQs, …) fala diretamente com a Supabase a partir do
  browser, autenticado pela sessão do admin — protegido por RLS com `is_admin()`, sem passar por `api/`.

`place_order`, `cancel_order` e `is_admin` **não são funções serverless** — são funções da própria base de dados
(Postgres/plpgsql, como um stored procedure), criadas pela migração SQL. Não têm deploy próprio; já ficam
disponíveis assim que a migração é aplicada.

## Base de dados (Supabase)

Aplica `supabase/migrations/0001_init.sql` no **SQL Editor** do dashboard da Supabase (Dashboard → SQL Editor →
New query → cola o ficheiro → Run). Não precisas do Supabase CLI para isto.

### Segredos das funções `api/` (definir no Vercel, nunca no Supabase)

Em **Project Settings → Environment Variables** do projeto Vercel do backoffice:

```
SUPABASE_SERVICE_ROLE_KEY=<service role key do projeto Supabase>
RESEND_API_KEY=<chave da Resend>
```

(`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` já lá estão, para o cliente Supabase normal do browser.)

### Arquitetura de acesso (porquê não há RLS "normal" no frontoffice)

O frontoffice não usa Supabase Auth — só uma palavra-passe única, validada no servidor (requisito do cliente).
Por isso todas as tabelas da loja (`products`, `categories`, `orders`, …) têm RLS "deny-all": sem grants para
`anon`/`authenticated`. Toda a leitura/escrita da loja passa pelas funções `api/` do **frontoffice** (não deste
repo), que usam a `service_role` key e validam um "gate token" (JWT emitido por `api/gate-login.ts` depois de
confirmar a palavra-passe). Ver o README do frontoffice.

O backoffice usa Supabase Auth normalmente (magic link) e fala diretamente com a Supabase — RLS com `is_admin()`
protege as tabelas para esse caso.

### Password do site por omissão

A seed define a palavra-passe **`segunda-vida`** (hash bcrypt em `site_settings.site_password_hash`). Muda-a assim
que possível em **Conteúdos → Configurações**, que chama `api/admin-set-password.ts`.

## Deploy (Vercel)

Projeto Vite standard — usa `vercel.json` (rewrite SPA) e define `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` +
`SUPABASE_SERVICE_ROLE_KEY`/`RESEND_API_KEY` nas variáveis de ambiente do projeto Vercel. Depois de publicado,
atualiza os "Redirect URLs" do Supabase Auth para incluir o domínio Vercel deste backoffice.
