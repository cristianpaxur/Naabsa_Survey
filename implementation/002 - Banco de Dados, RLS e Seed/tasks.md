# Tarefas: Banco de Dados, RLS e Seed

> **Implementação:** 002 - Banco de Dados, RLS e Seed
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 0/9 tarefas concluídas (0%)
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

- [ ] **T-001:** Configurar Supabase CLI e vincular ao projeto hosted
  - **Descrição:** `supabase init` no repo; `supabase link --project-ref <ref>` ao projeto cloud; scripts `pnpm db:push`, `pnpm db:types` na raiz. Documentar as variáveis no `.env` (gitignored). **Ambiente local (`supabase start`) diferido para o deploy ao VPS.**
  - **Arquivos envolvidos:** `supabase/config.toml`, `package.json`, `.env` (local, não commitado)
  - **Critério de conclusão:** Repo vinculado ao projeto hosted; `supabase db push` alcança o banco.
  - **Dependências:** Nenhuma (001 concluída) · **Bloqueio:** credenciais do projeto Supabase cloud
  - **Estimativa:** Pequena

### Fase 2: Implementação Core

- [ ] **T-002:** Migration 0001 — enum e tabelas
  - **Descrição:** Criar `report_status` e as tabelas `report_types`, `report_specs`, `reports`, `report_photos`, `audit_log`, `profiles` exatamente como o DDL do PRD §6, na ordem de dependência.
  - **Arquivos envolvidos:** `packages/db/migrations/0001_schema.sql`
  - **Critério de conclusão:** Aplica em banco limpo; diff contra DDL do PRD revisado.
  - **Dependências:** T-001
  - **Estimativa:** Média

- [ ] **T-003:** Migration 0002 — habilitar RLS e políticas
  - **Descrição:** `enable row level security` em todas as tabelas + políticas da matriz da spec (§4.1 RF-005): profiles (dono+admin), reports/photos/audit (autenticado com papel), specs/types (leitura autenticada, escrita admin).
  - **Arquivos envolvidos:** `packages/db/migrations/0002_rls.sql`
  - **Critério de conclusão:** Nenhuma tabela sem RLS; políticas aplicam sem erro.
  - **Dependências:** T-002
  - **Estimativa:** Grande

- [ ] **T-004:** Migration 0003 — imutabilidade e FK circular
  - **Descrição:** Negar UPDATE em `report_specs` (política + trigger de proteção); adicionar FK `report_types.active_spec_id → report_specs.id`.
  - **Arquivos envolvidos:** `packages/db/migrations/0003_constraints.sql`
  - **Critério de conclusão:** Update em spec falha para qualquer papel (CA-004).
  - **Dependências:** T-002
  - **Estimativa:** Pequena

- [ ] **T-005:** Migration 0004 — seed dos 5 report_types
  - **Descrição:** Inserir `draft_survey` [loading, discharge], `bunker_surveyor` [loading, discharge], `msc` [], `on_off_hire` [on_hire, off_hire], `rob` [] (PRD §3.1), idempotente.
  - **Arquivos envolvidos:** `packages/db/migrations/0004_seed_report_types.sql`
  - **Critério de conclusão:** Exatamente 5 linhas com slugs/variantes corretos (CA-002).
  - **Dependências:** T-002
  - **Estimativa:** Pequena

- [ ] **T-006:** Gerar tipos TypeScript do schema
  - **Descrição:** Rodar `supabase gen types typescript` para `packages/db/types/database.ts` e exportar pelo index do package.
  - **Arquivos envolvidos:** `packages/db/types/database.ts`, `packages/db/src/index.ts`
  - **Critério de conclusão:** `pnpm typecheck` verde consumindo os tipos (CA-005).
  - **Dependências:** T-005
  - **Estimativa:** Pequena

### Fase 3: Testes e Validação

- [ ] **T-007:** Suite de testes de RLS — papéis operator/admin
  - **Descrição:** Testes de integração contra Supabase local: criar usuários de teste com cada papel e validar a matriz de acesso (leituras e escritas permitidas/negadas) de todas as tabelas.
  - **Arquivos envolvidos:** `packages/db/tests/rls.test.ts`
  - **Critério de conclusão:** Casos positivos e negativos verdes (CA-003).
  - **Dependências:** T-003, T-004, T-005
  - **Estimativa:** Grande

- [ ] **T-008:** Testes de borda — cascade, actor null, sem papel
  - **Descrição:** Validar `on delete cascade` em `report_photos`, insert no `audit_log` com `actor` null via service role e bloqueio total de usuário autenticado sem linha em `profiles`.
  - **Arquivos envolvidos:** `packages/db/tests/rls.test.ts`
  - **Critério de conclusão:** Três cenários cobertos e verdes.
  - **Dependências:** T-007
  - **Estimativa:** Média

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
| T-001  | ⬜ Pendente | — | — |
| T-002  | ⬜ Pendente | — | — |
| T-003  | ⬜ Pendente | — | — |
| T-004  | ⬜ Pendente | — | — |
| T-005  | ⬜ Pendente | — | — |
| T-006  | ⬜ Pendente | — | — |
| T-007  | ⬜ Pendente | — | — |
| T-008  | ⬜ Pendente | — | — |
| T-009  | ⬜ Pendente | — | — |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
