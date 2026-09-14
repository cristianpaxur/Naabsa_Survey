# Operação — Sistema de Relatórios Automatizados Naabsa

> Runbook de operação e checklist de deploy (implementação 010/T-011, RNF-05).
> Fonte de verdade dos requisitos: [PRD.md](../PRD.md).

> Atualização 015: siga primeiro [CORRECOES_015.md](./CORRECOES_015.md) para migrations,
> configuração e aceite. As verificações locais não representam deploy concluído.

## 1. Arquitetura em produção

| Serviço | Imagem/origem | Papel |
|---|---|---|
| `app` | `apps/web` (Next.js standalone) | UI + rotas/API + server actions |
| `worker` | `apps/worker` (tsx) | jobs pg-boss: fotos, PDF, prints, IA, retenção |
| `caddy` | `Caddyfile` | reverse proxy + TLS automático + headers |
| `collabora` | Collabora CODE | editor Word no navegador; lê e grava via WOPI no app |
| Supabase (gerenciado) | nuvem | Postgres (+ pg-boss), Auth, Storage (bucket `reports`) |

Tudo orquestrado por `docker-compose.yml`. O worker exige **LibreOffice** (Writer+Calc)
— já instalado no `Dockerfile.worker` — para gerar o `.docx`→PDF e os prints das abas.

## 2. Variáveis de ambiente (`.env`)

Copie `.env.example` → `.env` e preencha. Nunca commitar o `.env`.
Scripts locais usam processo > `.env.local` da raiz > `.env`. Compose usa `.env`;
EasyPanel injeta variáveis no processo. Reinicie web e worker após alterações.

| Variável | Onde | Obrigatória | Notas |
|---|---|---|---|
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | app+worker | sim | URL do projeto |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app | sim | cliente (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | app(server)+worker | sim | admin; **nunca** ao browser |
| `DATABASE_URL` | app+worker | sim | Postgres do Supabase (pg-boss). **Senha com `#@$` deve ser URL-encodada** |
| `APP_BASE_URL` | worker | não | fallback do logo; o logo padrão é empacotado no worker |
| `SOFFICE_PATH` | worker | não | default detecta `soffice` no SO |
| `LO_PROFILE_DIR` | worker | não | perfil do LibreOffice; container usa `/tmp/naabsa-lo` |
| `AI_ENABLED` | worker | não | `false` por padrão; `true` liga a IA |
| `AI_PROVIDER` | worker | não | `anthropic` (default) ou `openai` |
| `AI_MODEL` | worker | não | override; default por provedor (anthropic `claude-sonnet-4-6`, openai `gpt-4o`) |
| `ANTHROPIC_API_KEY` | worker | se `AI_PROVIDER=anthropic` | chave da API Anthropic |
| `OPENAI_API_KEY` | worker | se `AI_PROVIDER=openai` | chave da API OpenAI |
| `APP_DOMAIN` | caddy | prod | vazio = HTTP `:80` (local); domínio = TLS automático |
| `CADDY_HTTP_PORT` / `CADDY_HTTPS_PORT` | caddy | não | portas publicadas no host |
| `COLLABORA_URL` | app | sim | URL para discovery do editor |
| `WOPI_PUBLIC_URL` | app | sim | endereço do app alcançável pelo Collabora |
| `WOPI_TOKEN_SECRET` | app | sim | segredo aleatório, mínimo 32 caracteres em produção |
| `COLLABORA_ALIASGROUP` | Collabora | sim | URL WOPI autorizada |

## 3. Deploy

> **EasyPanel (GitHub + Dockerfile):** caminho recomendado — ver
> [DEPLOY_EASYPANEL.md](./DEPLOY_EASYPANEL.md) (web, worker e Collabora, sem Caddy; o EasyPanel
> cuida do proxy/TLS). O passo a passo abaixo é o deploy **manual** via `docker compose`
> (com Caddy) num VPS.

```bash
# no VPS, na raiz do projeto, com .env preenchido:
docker compose build
docker compose up -d
docker compose ps        # app, worker, caddy "Up"
docker compose logs -f   # acompanhar boot
```

Antes de iniciar a versão nova, aplique `pnpm db:migrate` no ambiente identificado,
com web/worker antigos parados e backup disponível. O runner usa transação e ledger
de checksums. O spec ativo é versionado em `report_specs` (imutável).

## 4. Filas e jobs (pg-boss)

Consumidos pelo `worker` (ver `apps/worker/src/index.ts`):

| Fila | Gatilho | Concorrência |
|---|---|---|
| `process_photo` | upload de fotos | 4 |
| `build_working_docx` | avanço para edição | 1 |
| `generate_pdf` | aprovação | 1 (LibreOffice) |
| `preview_pdf` | botão Preview | 1 (LibreOffice) |
| `render_sheets` | upload de planilha | 1 (LibreOffice) |
| `ai_review` | pós-extração (no-op se IA off) | 2 |
| `classify_photos` | pós-processamento de fotos (IA on) | 1 |
| `retention_purge` | **cron diário 03:00** | 1 |

> As chamadas ao LibreOffice são serializadas por um mutex em processo
> (`lib/soffice.ts`) — perfil de macro compartilhado.

## 5. Logs e diagnóstico

```bash
docker compose logs -f worker   # jobs (process_photo, generate_pdf, ai_*, retention_purge)
docker compose logs -f app      # requisições/erros do Next
docker compose logs -f caddy    # TLS/proxy
```

Trilha de auditoria por relatório: tela **Histórico** (`/reports/[id]/history`) ou tabela
`audit_log` (inclui `ai_call`, `pdf_generated`, `retention_purged`, transições, overrides).

`pnpm --filter @naabsa/worker diagnose` confere configuração sem revelar chaves.
`/api/health` é liveness; `/api/health/ready`, para administrador ativo autenticado,
verifica worker/fila, bucket e discovery do Collabora. Não chama o provedor de IA.

## 6. Backup e restauração

- **Banco (Postgres/Supabase):** backups automáticos do plano Supabase (verificar retenção
  no painel). Para um dump manual: `pg_dump "$DATABASE_URL" > backup.sql`.
- **Storage (bucket `reports`):** contém planilhas, fotos e PDFs. A política de retenção
  (010/T-001) apaga aos 30 dias **fotos/planilha/prints**, preservando os **PDFs finais**
  (novos arquivos `final-v{n}-r{revision}.pdf`) e o `.docx`. Versões Word e snapshots
  aprovados são preservados; monitore seu crescimento. Para backup do Storage, usar a CLI do Supabase ou snapshot
  do bucket conforme o plano.
- **Restauração:** restaurar o dump no Postgres + repovoar o bucket; reiniciar `docker compose`.

## 7. Rotação de segredos

1. Gerar nova chave no painel (Supabase service role / Anthropic).
2. Atualizar o `.env`.
3. `docker compose up -d --force-recreate app worker`.
4. Revogar a chave antiga.

## 8. Hardening aplicado (010/T-010)

- **Headers de segurança**: `next.config.ts` (CSP/HSTS em produção, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) + reforço no `Caddyfile`.
- **Rate limit** de upload (planilha 10/min, fotos 20/min por usuário) → `429` em pt-BR;
  o cliente de fotos respeita `Retry-After` e retoma o lote.
- **Segredos** só via env; `service_role` nunca exposta ao browser; bucket privado (URLs
  assinadas ≤ 10 min).

## 9. Checklist de deploy (CA-007 — executar no VPS)

- [ ] `.env` completo e validado (sem segredos no git).
- [ ] `docker compose build` sem erros.
- [ ] `docker compose up -d`; `app`/`worker`/`caddy`/`collabora` "Up".
- [ ] Migrações aplicadas; spec ativo presente em `report_specs`.
- [ ] TLS válido para `APP_DOMAIN` (cadeado no navegador).
- [ ] Headers de segurança presentes (`curl -I https://<domínio>`).
- [ ] Fluxo feliz E2E no ambiente: criar → upload → revisar → fotos → aprovar → **PDF gerado e baixável**.
- [ ] Worker gera PDF (LibreOffice ok) e o cron `retention_purge` aparece agendado nos logs.
- [ ] RAM/CPU sob carga dentro do orçamento do VPS (observar durante um lote real).
- [ ] (Se IA on) `ai_call` registrado no `audit_log`; com IA off, fluxo idêntico.
