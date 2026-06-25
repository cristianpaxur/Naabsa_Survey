# Deploy no EasyPanel (GitHub + Dockerfile)

> Guia de deploy do Naabsa Survey no **EasyPanel** a partir do **GitHub**, com build
> por **Dockerfile**. Complementa o [OPERACAO.md](./OPERACAO.md) (runbook geral).
> Para deploy "cru" via `docker compose` (com Caddy), ver o OPERACAO.md §3.

## Visão geral

São **dois serviços (App)** no mesmo projeto do EasyPanel, ambos buildados do mesmo
repositório (monorepo), cada um com seu Dockerfile:

| Serviço EasyPanel | Dockerfile | Domínio | Papel |
|---|---|---|---|
| **web** | `apps/web/Dockerfile` | sim (público) | Next.js — UI, API, server actions |
| **worker** | `apps/worker/Dockerfile` | **não** | pg-boss — fotos, PDF, prints, IA, retenção |

- **Supabase** (gerenciado, nuvem): Postgres (+ pg-boss), Auth, Storage. Não é serviço do EasyPanel.
- **Proxy/TLS**: o **EasyPanel cuida** (Traefik + Let's Encrypt). **Não** use o `Caddyfile`/serviço Caddy aqui — ele é só para o deploy via `docker compose`.
- **Contexto de build** dos dois Dockerfiles = **raiz do repositório** (eles copiam `pnpm-lock.yaml`, `packages/`, etc. a partir da raiz).

---

## Pré-requisitos

1. Repositório no GitHub conectado ao EasyPanel (GitHub App do EasyPanel autorizado).
2. Projeto Supabase criado, com o bucket `reports` (privado) e o schema aplicado (ver **Migrações**).
3. Um domínio/subdomínio apontando para o servidor do EasyPanel (ex.: `relatorios.suaempresa.com`).

---

## Serviço 1 — `web`

**Create Service → App.**

- **Source**: GitHub → seu repo → branch `main`. *Build Path* = `/` (raiz).
- **Build**: Method = **Dockerfile**. *Dockerfile Path* = `apps/web/Dockerfile`.
- **Environment** (aba Environment):
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
  SUPABASE_URL=https://<projeto>.supabase.co
  SUPABASE_ANON_KEY=<anon key>
  SUPABASE_SERVICE_ROLE_KEY=<service role key>
  DATABASE_URL=postgresql://postgres.<ref>:<senha-URL-encodada>@<host>:5432/postgres
  ```
  > ⚠️ **`NEXT_PUBLIC_*` são build-time.** O Next inlina essas variáveis no bundle do
  > browser **durante o build**. O `apps/web/Dockerfile` as declara como `ARG` e o
  > EasyPanel passa as env do serviço como `--build-arg`. Se o login falhar com
  > "URL/key vazias", confirme que elas estão setadas **antes do build** (e refaça o deploy).
- **Domains**: adicione o domínio → **Port `3000`**. TLS é automático.
- **Health check** (se disponível): `GET /api/health` na porta `3000`.

> A `service_role` fica só no servidor (server actions / rotas API). Nunca é exposta ao browser.

---

## Serviço 2 — `worker`

**Create Service → App.**

- **Source**: o mesmo repo/branch. *Build Path* = `/`.
- **Build**: Method = **Dockerfile**. *Dockerfile Path* = `apps/worker/Dockerfile`.
  > O build instala **LibreOffice** (Writer+Calc) — é uma imagem maior e o build leva alguns minutos.
- **Environment**:
  ```
  SUPABASE_URL=https://<projeto>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<service role key>
  DATABASE_URL=postgresql://postgres.<ref>:<senha-URL-encodada>@<host>:5432/postgres
  APP_BASE_URL=http://web:3000
  # IA (opcional — off por padrão):
  AI_ENABLED=false
  AI_PROVIDER=anthropic
  # ANTHROPIC_API_KEY=...   (se anthropic)
  # OPENAI_API_KEY=...      (se openai)
  ```
  - **`APP_BASE_URL`** = URL **interna** do serviço web. No EasyPanel, serviços do
    mesmo projeto se enxergam pelo **nome do serviço** → se o serviço web se chama
    `web`, use `http://web:3000`. (Só serve para o worker buscar o logo do PDF; se
    falhar, o PDF sai sem logo, sem quebrar.)
  - `SOFFICE_PATH` / `LO_PROFILE_DIR` **não** precisam ser setados — o Dockerfile já
    aponta o LibreOffice e define `LO_PROFILE_DIR=/tmp/naabsa-lo`.
- **Sem domínio** (é um worker de fila).
- **Recursos**: reserve **≥ 1–2 GB de RAM** (LibreOffice headless é o maior consumidor).

---

## Variáveis de ambiente — resumo

| Variável | web | worker | Quando | Observação |
|---|:---:|:---:|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | — | **build** + runtime | inlinada no bundle do browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | — | **build** + runtime | idem |
| `SUPABASE_URL` | ✅ | ✅ | runtime | |
| `SUPABASE_ANON_KEY` | ✅ | — | runtime | supabase server-side |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | runtime | admin; nunca no browser |
| `DATABASE_URL` | ✅ | ✅ | runtime | pg-boss; ver **pooler/senha** abaixo |
| `APP_BASE_URL` | — | ✅ | runtime | URL interna do `web` (logo) |
| `AI_ENABLED`/`AI_PROVIDER`/`AI_MODEL` | — | ✅ | runtime | IA atrás de flag (off por padrão) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | — | ✅ | runtime | conforme o provedor, se IA on |

`NODE_ENV=production` já é definido pelos Dockerfiles.

### `DATABASE_URL` — pooler e senha (atenção)

- Use o **Session Pooler** do Supabase (**porta `5432`**), não o transaction pooler (`6543`)
  — o pg-boss mantém conexões/notificações.
- O pooler de sessão limita a ~**15 conexões**. Os pools já estão dimensionados:
  worker `max: 8`, web `max: 2`.
- **Senha com `#`, `@`, `$`, `/` deve ser URL-encodada** na string (ex.: `#`→`%23`).
  Senão o `pg-boss` quebra com `ERR_INVALID_URL` e **nenhum job roda**.

---

## Migrações e seed (uma vez, contra o banco de produção)

O EasyPanel não roda migração sozinho. Aplique o schema e o spec **antes do 1º uso**,
de uma máquina com o repo e o `DATABASE_URL` de produção:

```bash
# na raiz do repo, com DATABASE_URL apontando para a produção:
DATABASE_URL="postgresql://...:5432/postgres" pnpm --filter @naabsa/db migrate
DATABASE_URL="postgresql://...:5432/postgres" pnpm --filter @naabsa/db seed:real-spec
```

> O spec ativo fica versionado e imutável em `report_specs`. Reaplique `migrate` a cada
> deploy que traga novas migrações (idempotente).

---

## Deploy e atualização

1. Faça **push** na branch `main` (ou clique **Deploy** no serviço).
2. O EasyPanel builda a imagem e sobe o container. Acompanhe em **Deployments → Logs**.
3. Faça o deploy dos **dois** serviços (web e worker).

Para **re-render das planilhas** de relatórios já existentes (ex.: após o fix dos 4
blocos), reenvie a planilha no relatório — o job `render_sheets` regrava os PNGs.

---

## Checklist do 1º deploy

- [ ] Migrações + `seed:real-spec` aplicados no banco de produção.
- [ ] `web`: env (inclui `NEXT_PUBLIC_*`) preenchidas **antes do build**; deploy verde.
- [ ] `worker`: deploy verde; logs mostram `worker pronto` e o cron `retention_purge` agendado.
- [ ] Domínio do `web` com **TLS válido** (cadeado) e `GET /api/health` → `{"status":"ok"}`.
- [ ] `APP_BASE_URL` aponta para o `web` interno (PDF sai **com** logo).
- [ ] **Login** funciona (confirma que as `NEXT_PUBLIC_*` foram inlinadas no build).
- [ ] Fluxo feliz E2E: criar → upload planilha → revisar → fotos → aprovar → **PDF gerado e baixável**.
- [ ] (Se IA on) `ai_call` registrado no `audit_log`; com IA off, fluxo idêntico.

---

## Troubleshooting

### `COPY ... "/pnpm-lock.yaml": not found` (ou `packages/...`, `apps/...`) no build

O **contexto de build está errado** — apontando para `apps/web` em vez da raiz. Confirme
na última linha do log: o argumento final do `docker buildx build` (o contexto) deve
terminar em `.../code` (raiz), **não** em `.../code/apps/web`.

**Causa:** o **Path** (subpasta do app) do serviço foi setado como `apps/web` — isso vira
o contexto. Os Dockerfiles são de **monorepo** e copiam `pnpm-lock.yaml`/`packages/` da raiz.

**Correção:** no serviço → **Source → Path = vazio/`/`** (raiz) e **Build → Dockerfile Path =
`apps/web/Dockerfile`** (caminho completo a partir da raiz). Idem worker: `apps/worker/Dockerfile`.

### Login falha / Supabase "vazio" no browser depois do build

As `NEXT_PUBLIC_*` não chegaram ao **build**. Garanta que estejam definidas **antes** do
build. No log do build, confira se aparece `--build-arg NEXT_PUBLIC_SUPABASE_URL=...` (além
do `GIT_SHA`). Se o EasyPanel não estiver repassando as env do serviço como build-arg, use o
campo de **Build Args / variáveis de build** do serviço para informá-las explicitamente.
Refaça o deploy (rebuild) após ajustar — não basta reiniciar.

## Por que **não** usar o Caddy aqui

O `Caddyfile` e o serviço `caddy` do `docker-compose.yml` existem para o deploy **manual**
via `docker compose` num VPS. No EasyPanel, o **Traefik** já faz reverse proxy + TLS +
headers de borda. Os headers de segurança da aplicação continuam vindo do `next.config.ts`
(CSP/HSTS em produção). Subir o Caddy junto causaria conflito de proxy.
