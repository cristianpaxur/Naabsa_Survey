# Tarefas: Fundação do Monorepo e Infraestrutura

> **Implementação:** 001 - Fundação do Monorepo e Infraestrutura
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 1/10 tarefas concluídas (10%)
> **Última atualização:** 2026-06-11

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Preparação e Setup

- [x] **T-001:** Inicializar monorepo pnpm workspaces
  - **Descrição:** Criar `package.json` raiz, `pnpm-workspace.yaml` (apps/*, packages/*) e scripts raiz `lint`, `typecheck`, `test` que agregam todos os workspaces.
  - **Arquivos envolvidos:** `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.nvmrc`
  - **Critério de conclusão:** `pnpm install` resolve sem erros; `.env` e `node_modules` ignorados no git.
  - **Dependências:** Nenhuma
  - **Estimativa:** Pequena

- [ ] **T-002:** Configurar TypeScript estrito compartilhado
  - **Descrição:** `tsconfig.base.json` com `strict: true`, `noUncheckedIndexedAccess`, paths dos packages; tsconfigs por workspace estendendo a base.
  - **Arquivos envolvidos:** `tsconfig.base.json`, `*/tsconfig.json`
  - **Critério de conclusão:** `pnpm typecheck` roda verde no esqueleto.
  - **Dependências:** T-001
  - **Estimativa:** Pequena

- [ ] **T-003:** Configurar ESLint + Prettier com regra de isolamento do core
  - **Descrição:** Config única de lint/format; regra `no-restricted-imports` impedindo `packages/core` de importar `next`, `@supabase/*` e `apps/*` (RF-003 da spec).
  - **Arquivos envolvidos:** `eslint.config.mjs`, `.prettierrc`
  - **Critério de conclusão:** `pnpm lint` verde; import proibido no core falha o lint (testado com arquivo temporário).
  - **Dependências:** T-001
  - **Estimativa:** Média

### Fase 2: Implementação Core

- [ ] **T-004:** Criar esqueleto `packages/core` e `packages/db`
  - **Descrição:** Estrutura `packages/core/src/{extractor,spec-schema,document-builder}/` (PRD §7) com index vazio exportável; `packages/db/` com pastas `migrations/` e `types/`.
  - **Arquivos envolvidos:** `packages/core/**`, `packages/db/**`
  - **Critério de conclusão:** Workspaces buildam; estrutura idêntica ao PRD §7.
  - **Dependências:** T-002
  - **Estimativa:** Pequena

- [ ] **T-005:** Criar esqueleto `apps/web` (Next.js 15+ App Router)
  - **Descrição:** App Next.js com TS estrito, estrutura de rotas vazia do PRD §7 (`(auth)/login`, `(app)/dashboard`, `(app)/reports/[id]/{review,photos,edit,history}`, `(app)/admin/specs`, `reports/[id]/print`, `api/`), página raiz placeholder e validação de env no boot.
  - **Arquivos envolvidos:** `apps/web/**`
  - **Critério de conclusão:** `pnpm dev` no web sobe e renderiza placeholder; typecheck verde.
  - **Dependências:** T-002
  - **Estimativa:** Média

- [ ] **T-006:** Criar esqueleto `apps/worker`
  - **Descrição:** Processo Node TS com entrypoint, validação de env no boot e pastas `src/jobs/{processPhoto,generatePdf,retentionPurge,aiReview}.ts` como stubs sem lógica.
  - **Arquivos envolvidos:** `apps/worker/**`
  - **Critério de conclusão:** `pnpm start` no worker sobe, loga "worker pronto" e encerra limpo com SIGTERM.
  - **Dependências:** T-002
  - **Estimativa:** Pequena

- [ ] **T-007:** Configurar Vitest com teste-sentinela
  - **Descrição:** Vitest no `packages/core` (e config raiz agregadora); um teste trivial provando o pipeline de testes; criar `tests/golden/` e `tests/fixtures/` vazios com README curto.
  - **Arquivos envolvidos:** `vitest.config.ts`, `packages/core/src/index.test.ts`, `tests/**`
  - **Critério de conclusão:** `pnpm test` verde na raiz (CA-001).
  - **Dependências:** T-004
  - **Estimativa:** Pequena

### Fase 3: Infraestrutura Docker

- [ ] **T-008:** Dockerfiles do app e do worker
  - **Descrição:** Multi-stage builds; worker baseado em imagem Playwright com Chromium; usuário não-root; só artefatos de produção na imagem final (RNF-002).
  - **Arquivos envolvidos:** `apps/web/Dockerfile`, `apps/worker/Dockerfile`, `.dockerignore`
  - **Critério de conclusão:** `docker build` de ambas as imagens conclui localmente.
  - **Dependências:** T-005, T-006
  - **Estimativa:** Média

- [ ] **T-009:** docker-compose.yml + Caddyfile + .env.example
  - **Descrição:** Compose com serviços `app`, `worker`, `caddy`; Caddy como reverse proxy TLS; `.env.example` com TODAS as variáveis do PRD §13 sem valores.
  - **Arquivos envolvidos:** `docker-compose.yml`, `Caddyfile`, `.env.example`
  - **Critério de conclusão:** `docker compose up` sobe app e worker localmente (CA-003); app responde via caddy.
  - **Dependências:** T-008
  - **Estimativa:** Média

### Fase 4: Documentação e Finalização

- [ ] **T-010:** Verificação final e documentação de bootstrap
  - **Descrição:** Conferir CA-001..CA-006 da spec; escrever seção "Como rodar" no README raiz (install, dev, test, compose); registrar progresso.
  - **Arquivos envolvidos:** `README.md`, `implementation/001*/tasks.md`, `implementation/README.md`
  - **Critério de conclusão:** Todos os CA marcados; lint+typecheck+test verdes em máquina limpa.
  - **Dependências:** T-001..T-009
  - **Estimativa:** Pequena

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | ✅ Concluída | 2026-06-11 | pnpm 11.6.0; scripts agregadores `-r --if-present`; gate verde (exit 0) |
| T-002  | ⬜ Pendente | — | — |
| T-003  | ⬜ Pendente | — | — |
| T-004  | ⬜ Pendente | — | — |
| T-005  | ⬜ Pendente | — | — |
| T-006  | ⬜ Pendente | — | — |
| T-007  | ⬜ Pendente | — | — |
| T-008  | ⬜ Pendente | — | — |
| T-009  | ⬜ Pendente | — | — |
| T-010  | ⬜ Pendente | — | — |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
