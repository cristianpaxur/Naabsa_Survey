# Tarefas: Demais Relatórios e Admin de Specs

> **Implementação:** 009 - Demais Relatórios e Admin de Specs
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 0/12 tarefas concluídas (0%)
> **Última atualização:** 2026-06-11

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Admin de Specs (PRD T-23 — não bloqueada)

- [ ] **T-001:** Actions `createSpecVersion` e `activateSpec`
  - **Descrição:** Admin-only: validar JSON com `validateSpec` (003) antes de salvar (erros pt-BR), incrementar versão por tipo, inserir imutável; ativação atualiza `report_types.active_spec_id`, auditada; rejeitar spec de tipo divergente.
  - **Arquivos envolvidos:** `apps/web/lib/actions/specs.ts`
  - **Critério de conclusão:** Inválido rejeita com mensagens; válido versiona; ativação audita.
  - **Dependências:** Nenhuma (003/005 concluídas)
  - **Estimativa:** Média

- [ ] **T-002:** Tela 09 — listagem e editor JSON
  - **Descrição:** `/admin/specs` fiel ao protótipo: lista lateral de tipos (badge "vN ativa", contagem de versões), editor JSON dark com highlighting, indicador "JSON válido"/erros inline, botão "Salvar & ativar"; rota negada a operator.
  - **Arquivos envolvidos:** `apps/web/app/(app)/admin/specs/page.tsx`, `components/admin/SpecEditor.tsx`
  - **Critério de conclusão:** CA-003 e CA-006 atendidos.
  - **Dependências:** T-001
  - **Estimativa:** Grande

- [ ] **T-003:** Teste — relatório antigo intacto após nova versão
  - **Descrição:** Criar relatório com spec v1, ativar v2, verificar `spec_id` e comportamento inalterados (RF-05); E2E curto do admin (inválido→erro; válido→ativar).
  - **Arquivos envolvidos:** `tests/e2e/admin-specs.spec.ts`
  - **Critério de conclusão:** CA-004 verde (aceite do PRD T-23).
  - **Dependências:** T-002
  - **Estimativa:** Média

### Fase 2: Tipos restantes (PRD T-19..T-22) — BLOQUEADAS por insumo

> Padrão por tipo (4×): spec real → fixture de planilha real → extração limpa → content
> dos modelos Word → builder fino → snapshot → golden test. **Diff não pode tocar
> `packages/core` fora de `content/` e specs (CA-002).**

- [!] **T-004:** Tipo 2 — spec + fixture + extração limpa
  - **Descrição:** Escrever spec v1 do tipo, validar, versionar planilha real como fixture, extração sem issues inesperadas.
  - **Arquivos envolvidos:** `tests/fixtures/specs/*`, `tests/fixtures/planilhas/*`
  - **Critério de conclusão:** Extração limpa da planilha real.
  - **Dependências:** T-001
  - **Estimativa:** Média
  - **Observações:** 🔴 Aguarda planilha real + modelo Word (PRD §15).

- [!] **T-005:** Tipo 2 — content + builder + golden test
  - **Descrição:** `content/{slug}.{variant}.ts` dos modelos Word, builder fino, snapshot por variante, fixture golden completa com `expected.pdf`.
  - **Arquivos envolvidos:** `packages/core/src/document-builder/*`, `tests/golden/*`
  - **Critério de conclusão:** Golden do tipo 2 verde; diff respeitando CA-002.
  - **Dependências:** T-004
  - **Estimativa:** Grande
  - **Observações:** 🔴 Mesmo insumo da T-004.

- [!] **T-006:** Tipo 3 — spec + fixture + extração limpa
  - **Descrição:** Idem T-004 para o terceiro tipo.
  - **Arquivos envolvidos:** fixtures
  - **Critério de conclusão:** Extração limpa.
  - **Dependências:** T-001
  - **Estimativa:** Média
  - **Observações:** 🔴 Bloqueada por insumo.

- [!] **T-007:** Tipo 3 — content + builder + golden test
  - **Descrição:** Idem T-005 para o terceiro tipo.
  - **Arquivos envolvidos:** builder/content/golden
  - **Critério de conclusão:** Golden verde; CA-002.
  - **Dependências:** T-006
  - **Estimativa:** Grande
  - **Observações:** 🔴 Bloqueada por insumo.

- [!] **T-008:** Tipo 4 — spec + fixture + extração limpa
  - **Descrição:** Idem T-004 para o quarto tipo.
  - **Arquivos envolvidos:** fixtures
  - **Critério de conclusão:** Extração limpa.
  - **Dependências:** T-001
  - **Estimativa:** Média
  - **Observações:** 🔴 Bloqueada por insumo.

- [!] **T-009:** Tipo 4 — content + builder + golden test
  - **Descrição:** Idem T-005 para o quarto tipo.
  - **Arquivos envolvidos:** builder/content/golden
  - **Critério de conclusão:** Golden verde; CA-002.
  - **Dependências:** T-008
  - **Estimativa:** Grande
  - **Observações:** 🔴 Bloqueada por insumo.

- [!] **T-010:** Tipo 5 (on/off-hire se restante) — spec com `by_variant` + fixtures das 2 variantes
  - **Descrição:** Caso crítico de variante que muda mapeamento de dados (delivery_date vs redelivery_date): spec com `by_variant`, fixtures e extração limpa das DUAS variantes (CA-005).
  - **Arquivos envolvidos:** fixtures
  - **Critério de conclusão:** Extração correta por variante.
  - **Dependências:** T-001
  - **Estimativa:** Grande
  - **Observações:** 🔴 Bloqueada por insumo. Se on_off_hire for o tipo 1 (003/004), aplicar este cuidado ao tipo restante mais complexo.

- [!] **T-011:** Tipo 5 — content por variante + builder + golden tests
  - **Descrição:** Content distinto por variante, builder com condicionais, golden de ambas as variantes.
  - **Arquivos envolvidos:** builder/content/golden
  - **Critério de conclusão:** Goldens verdes; CA-005 completo.
  - **Dependências:** T-010
  - **Estimativa:** Grande
  - **Observações:** 🔴 Bloqueada por insumo.

### Fase 3: Finalização

- [ ] **T-012:** Verificação do M3
  - **Descrição:** Matriz golden dos 5 tipos × variantes verde no CI (CA-001); auditoria de diffs (CA-002); atualizar progresso e índice.
  - **Arquivos envolvidos:** CI, `implementation/009*/`, `implementation/README.md`
  - **Critério de conclusão:** Todos os CA marcados — M3 concluído.
  - **Dependências:** T-003, T-005, T-007, T-009, T-011
  - **Estimativa:** Pequena

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | ⬜ Pendente | — | — |
| T-002  | ⬜ Pendente | — | — |
| T-003  | ⬜ Pendente | — | — |
| T-004  | 🔴 Bloqueada | — | Aguarda planilhas reais + modelos Word (PRD §15) |
| T-005  | 🔴 Bloqueada | — | Idem |
| T-006  | 🔴 Bloqueada | — | Idem |
| T-007  | 🔴 Bloqueada | — | Idem |
| T-008  | 🔴 Bloqueada | — | Idem |
| T-009  | 🔴 Bloqueada | — | Idem |
| T-010  | 🔴 Bloqueada | — | Idem |
| T-011  | 🔴 Bloqueada | — | Idem |
| T-012  | ⬜ Pendente | — | — |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
