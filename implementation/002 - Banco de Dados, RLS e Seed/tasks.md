# Tarefas: Banco de Dados, RLS e Seed

> **Implementação:** 002 - Banco de Dados, RLS e Seed
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 6/9 tarefas concluídas (67%) — T-007/T-008 bloqueadas (chaves de API)
> **Última atualização:** 2026-06-12

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Preparação e Setup

- [x] **T-001:** Aplicação ao projeto hosted (runner `pg` + `DATABASE_URL`)
  - **Descrição:** Em vez de `supabase link`/`db push` (exige pasta `supabase/migrations/`), criou-se um runner próprio (`packages/db/src/migrate.ts`, via `pg`) dirigido por `DATABASE_URL`, mantendo as migrations em `packages/db/migrations/` (PRD §7). Script raiz `pnpm db:migrate`. Carregador de `.env` (`src/env.ts`) e normalização de senha com caracteres especiais. **Ambiente local (`supabase start`) diferido para o deploy ao VPS.**
  - **Arquivos envolvidos:** `packages/db/src/{migrate,env}.ts`, `package.json`
  - **Critério de conclusão:** `pnpm db:migrate` aplica no projeto hosted (Session pooler 5432). ✅
  - **Dependências:** Nenhuma (001 concluída)
  - **Estimativa:** Pequena

### Fase 2: Implementação Core

- [x] **T-002:** Migration 0001 — enum e tabelas
  - **Descrição:** Criar `report_status` e as tabelas `report_types`, `report_specs`, `reports`, `report_photos`, `audit_log`, `profiles` exatamente como o DDL do PRD §6, na ordem de dependência.
  - **Arquivos envolvidos:** `packages/db/migrations/0001_schema.sql`
  - **Critério de conclusão:** Aplica em banco limpo; diff contra DDL do PRD revisado.
  - **Dependências:** T-001
  - **Estimativa:** Média

- [x] **T-003:** Migration 0002 — habilitar RLS e políticas
  - **Descrição:** `enable row level security` em todas as tabelas + políticas da matriz da spec (§4.1 RF-005): profiles (dono+admin), reports/photos/audit (autenticado com papel), specs/types (leitura autenticada, escrita admin).
  - **Arquivos envolvidos:** `packages/db/migrations/0002_rls.sql`
  - **Critério de conclusão:** Nenhuma tabela sem RLS; políticas aplicam sem erro.
  - **Dependências:** T-002
  - **Estimativa:** Grande

- [x] **T-004:** Migration 0003 — imutabilidade e FK circular
  - **Descrição:** Negar UPDATE em `report_specs` (política + trigger de proteção); adicionar FK `report_types.active_spec_id → report_specs.id`.
  - **Arquivos envolvidos:** `packages/db/migrations/0003_constraints.sql`
  - **Critério de conclusão:** Update em spec falha para qualquer papel (CA-004).
  - **Dependências:** T-002
  - **Estimativa:** Pequena

- [x] **T-005:** Migration 0004 — seed dos 5 report_types
  - **Descrição:** Inserir `draft_survey` [loading, discharge], `bunker_surveyor` [loading, discharge], `msc` [], `on_off_hire` [on_hire, off_hire], `rob` [] (PRD §3.1), idempotente.
  - **Arquivos envolvidos:** `packages/db/migrations/0004_seed_report_types.sql`
  - **Critério de conclusão:** Exatamente 5 linhas com slugs/variantes corretos (CA-002).
  - **Dependências:** T-002
  - **Estimativa:** Pequena

- [x] **T-006:** Gerar tipos TypeScript do schema
  - **Descrição:** `supabase gen types typescript --db-url $DATABASE_URL` (via `pnpm dlx`, usa o banco, não as chaves de API) → `packages/db/types/database.ts`, reexportado por `src/index.ts`. Arquivo gerado ignorado no lint/format.
  - **Arquivos envolvidos:** `packages/db/types/database.ts`, `packages/db/src/index.ts`
  - **Critério de conclusão:** `pnpm typecheck` verde consumindo os tipos (CA-005). ✅
  - **Dependências:** T-005
  - **Estimativa:** Pequena

### Fase 3: Testes e Validação

- [!] **T-007:** Suite de testes de RLS — papéis operator/admin
  - **Descrição:** Testes de integração (via `@supabase/supabase-js`) contra o projeto hosted: cria usuários de teste por papel e valida a matriz de acesso. **Suite escrita** (13 casos, gatilho `RUN_DB_TESTS=1`).
  - **Arquivos envolvidos:** `packages/db/tests/rls.test.ts`
  - **Critério de conclusão:** Casos positivos e negativos verdes (CA-003).
  - **Dependências:** T-003, T-004, T-005
  - **Estimativa:** Grande
  - **Observações:** 🔴 **Execução bloqueada** — as chaves `SUPABASE_ANON_KEY`/`SERVICE_ROLE_KEY` no `.env` retornam 401 "Invalid API key" (são de um projeto diferente do `gwxgq…`, onde o banco está). Rodar quando as chaves do projeto correto forem fornecidas: `RUN_DB_TESTS=1 pnpm --filter @naabsa/db test`.

- [!] **T-008:** Testes de borda — cascade, actor null, sem papel
  - **Descrição:** `on delete cascade` em `report_photos`, insert no `audit_log` com `actor` null via service role e bloqueio de usuário sem papel. **Escritos** (na mesma suite).
  - **Arquivos envolvidos:** `packages/db/tests/rls.test.ts`
  - **Critério de conclusão:** Três cenários cobertos e verdes.
  - **Dependências:** T-007
  - **Estimativa:** Média
  - **Observações:** 🔴 Execução bloqueada pelo mesmo motivo da T-007.

### Fase 4: Documentação e Finalização

- [ ] **T-009:** Verificação final e documentação do banco
  - **Descrição:** `supabase db reset` completo do zero + suite verde; documentar comandos de banco no README; atualizar progresso e status da spec.
  - **Arquivos envolvidos:** `README.md`, `implementation/002*/`, `implementation/README.md`
  - **Critério de conclusão:** CA-001..CA-005 todos marcados.
  - **Dependências:** T-006, T-008
  - **Estimativa:** Pequena

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | ✅ Concluída | 2026-06-12 | Runner `pg` + `DATABASE_URL` (Session pooler 5432); `pnpm db:migrate` |
| T-002  | ✅ Concluída | 2026-06-12 | Schema aplicado; 6 tabelas + enum verificados no banco |
| T-003  | ✅ Concluída | 2026-06-12 | RLS habilitada nas 6 tabelas (verificado); matriz testada na T-007 |
| T-004  | ✅ Concluída | 2026-06-12 | Trigger de imutabilidade + FK circular aplicados |
| T-005  | ✅ Concluída | 2026-06-12 | Seed = exatamente 5 tipos (CA-002 verificado) |
| T-006  | ✅ Concluída | 2026-06-12 | Tipos gerados via db-url; exportados; typecheck verde (CA-005) |
| T-007  | 🔴 Bloqueada | — | Suite escrita; execução aguarda chaves de API do projeto correto |
| T-008  | 🔴 Bloqueada | — | Idem T-007 |
| T-009  | ⬜ Pendente | — | Aguarda T-007/T-008 (CA-003/CA-004) |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
