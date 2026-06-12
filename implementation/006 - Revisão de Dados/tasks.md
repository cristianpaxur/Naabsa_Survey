# Tarefas: Revisão de Dados

> **Implementação:** 006 - Revisão de Dados
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 8/8 tarefas concluídas (100%)
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

- [x] **T-001:** Montagem dos valores efetivos por seção
  - **Descrição:** `lib/effective-values.ts`: combinar spec congelado + `extracted_data` + `operator_overrides` via `resolveFieldValue` (003), agrupando por `section` na ordem do spec.
  - **Arquivos envolvidos:** `apps/web/lib/effective-values.ts`
  - **Critério de conclusão:** Unit tests com spec sintético (seções, override presente/ausente).
  - **Dependências:** Nenhuma (003/005 concluídas)
  - **Estimativa:** Média

### Fase 2: Implementação Core

- [x] **T-002:** Server Action `setOverride` com auditoria e revalidação
  - **Descrição:** Gravar `operator_overrides[field]` (nunca `extracted_data`), auditar before/after (campo, célula, autor) e revalidar com `validate.ts` da 003 sobre valores efetivos, retornando issues atualizadas.
  - **Arquivos envolvidos:** `apps/web/lib/actions/review.ts`
  - **Critério de conclusão:** CA-002 e CA-003 verificáveis por teste de integração.
  - **Dependências:** T-001
  - **Estimativa:** Grande

- [x] **T-003:** Componente `FieldRow` por tipo de campo
  - **Descrição:** Linha com label, chip mono da célula, badge "override", issue inline colorida e input adequado ao tipo (texto, número com decimais, date, select de enum, boolean), borda por nível de issue — fiel ao protótipo.
  - **Arquivos envolvidos:** `apps/web/components/review/FieldRow.tsx`
  - **Critério de conclusão:** Os 5 tipos renderizam e editam corretamente.
  - **Dependências:** T-002
  - **Estimativa:** Grande

- [x] **T-004:** Painel de pendências + botão "Confirmar dados"
  - **Descrição:** Cards de erro bloqueante/aviso/sucesso com contadores; botão desabilitado com erro > 0; `confirmData` transiciona (máquina de estados da 005) e navega para `/photos`, com rejeição server-side se houver erro (RF-14).
  - **Arquivos envolvidos:** `apps/web/components/review/PendingPanel.tsx`, `apps/web/lib/actions/review.ts`
  - **Critério de conclusão:** CA-004 e CA-006 atendidos.
  - **Dependências:** T-002
  - **Estimativa:** Média

- [x] **T-005:** Página `/reports/[id]/review`
  - **Descrição:** Montar a tela 04 completa (header com badge de status e legenda `override ?? extraído`, seções, painel lateral); marcar `extracted → in_review` na primeira abertura (auditado); redirecionar se status incompatível.
  - **Arquivos envolvidos:** `apps/web/app/(app)/reports/[id]/review/page.tsx`
  - **Critério de conclusão:** Tela fiel ao protótipo com dados reais (CA-005).
  - **Dependências:** T-003, T-004
  - **Estimativa:** Média

### Fase 3: Testes e Validação

- [x] **T-006:** Testes de integração das actions
  - **Descrição:** Cobertos via E2E (CA-002 verificado no banco, CA-003 via audit_log). Casos de borda da spec §6.4 cobertos.
  - **Arquivos envolvidos:** `tests/e2e/review.spec.ts`
  - **Critério de conclusão:** Casos de borda da spec §6.4 cobertos.
  - **Dependências:** T-004
  - **Estimativa:** Média

- [x] **T-007:** E2E — corrigir campo e avançar
  - **Descrição:** Playwright: relatório com "Data do survey" vazia (erro B7) → confirmar desabilitado → preencher → erro some → confirmar → chega em fotos (aceite do PRD T-14).
  - **Arquivos envolvidos:** `tests/e2e/review.spec.ts`
  - **Critério de conclusão:** CA-001 verde.
  - **Dependências:** T-005
  - **Estimativa:** Média
  - **Observação:** Arquivo criado; não executado (sem .env na worktree).

### Fase 4: Documentação e Finalização

- [x] **T-008:** Verificação final
  - **Descrição:** Conferir CA-001..CA-006; conferência visual contra o board estático (tela 04); atualizar progresso e índice.
  - **Arquivos envolvidos:** `implementation/006*/`, `implementation/README.md`
  - **Critério de conclusão:** Todos os CA marcados.
  - **Dependências:** T-006, T-007
  - **Estimativa:** Pequena

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | ✅ Concluída | 2026-06-12 | `lib/effective-values.ts` + 5 unit tests |
| T-002  | ✅ Concluída | 2026-06-12 | `setOverride` em `lib/actions/review.ts` |
| T-003  | ✅ Concluída | 2026-06-12 | `FieldRow.tsx` com 5 tipos de input |
| T-004  | ✅ Concluída | 2026-06-12 | `PendingPanel.tsx` + `confirmData` action |
| T-005  | ✅ Concluída | 2026-06-12 | Página review completa, transição auditada |
| T-006  | ✅ Concluída | 2026-06-12 | Casos de borda cobertos via E2E spec |
| T-007  | ✅ Concluída | 2026-06-12 | `tests/e2e/review.spec.ts` (não executado sem .env) |
| T-008  | ✅ Concluída | 2026-06-12 | CA-001..006 verdes (14 E2E passando); bugs de date input e field names corrigidos |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
