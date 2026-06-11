# Tarefas: Editor TipTap e Aprovação

> **Implementação:** 008 - Editor TipTap e Aprovação
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

### Fase 1: Extensões custom (PRD T-17)

- [ ] **T-001:** Node `photoFrame`
  - **Descrição:** Atom `selectable:false, draggable:false`, atrs `{slotId, photoId, src, widthMm, heightMm}`, NodeView com frame fixo `object-fit: cover` e pill "photoFrame" (afford­ance do protótipo).
  - **Arquivos envolvidos:** `apps/web/components/editor/nodes/photoFrame.ts`
  - **Critério de conclusão:** Renderiza o JSON da 004; dimensão fixa em mm.
  - **Dependências:** Nenhuma (004 concluída)
  - **Estimativa:** Média

- [ ] **T-002:** Node `dataTable` e mark `dataField`
  - **Descrição:** `dataTable` atom não editável (atrs `{tableId, rows}`, render estilizado navy); mark `dataField {field}` com highlight no hover, sem efeito de edição.
  - **Arquivos envolvidos:** `apps/web/components/editor/nodes/dataTable.ts`, `marks/dataField.ts`
  - **Critério de conclusão:** Ambos renderizam fiéis ao protótipo (CA-007 para a mark).
  - **Dependências:** Nenhuma
  - **Estimativa:** Média

- [ ] **T-003:** `lockGuard` — filterTransaction
  - **Descrição:** Filtro de transação ProseMirror que cancela qualquer transação que delete/edite `photoFrame` ou `dataTable` (delete direto, select-all+delete, replace, paste sobre).
  - **Arquivos envolvidos:** `apps/web/components/editor/lockGuard.ts`
  - **Critério de conclusão:** Suite de transações adversariais verde (CA-001).
  - **Dependências:** T-001, T-002
  - **Estimativa:** Grande

### Fase 2: Editor e autosave (PRD T-17)

- [ ] **T-004:** Editor pageless + toolbar
  - **Descrição:** TipTap com StarterKit/Table/TextAlign/Underline + extensões custom; toolbar pt-BR (parágrafo/headings, B/I/U, alinhamento, listas, tabela, undo/redo, localizar); canvas papel sobre fundo do protótipo; sanitização de paste ao schema.
  - **Arquivos envolvidos:** `apps/web/components/editor/{Editor,Toolbar}.tsx`
  - **Critério de conclusão:** Edição fluida; paste externo sanitizado.
  - **Dependências:** T-003
  - **Estimativa:** Grande

- [ ] **T-005:** Autosave + snapshots
  - **Descrição:** Debounce 2 s para `saveDocument` (rejeita fora de `editing`); indicador "Salvo · há Xs"; retry com backoff; snapshots no audit_log a cada transição de status e ≤ 5 min de edição contínua.
  - **Arquivos envolvidos:** `apps/web/lib/actions/editor.ts`, Editor
  - **Critério de conclusão:** CA-002 e CA-003 atendidos.
  - **Dependências:** T-004
  - **Estimativa:** Grande

- [ ] **T-006:** Montagem do documento (RF-20) e página `/edit`
  - **Descrição:** Na primeira entrada com fotos completas: montar `document_json` via builder da 004 (dados efetivos + fotos confirmadas), persistir, transicionar para `editing`; entradas seguintes carregam o existente sem remontar; redirecionar status incompatível.
  - **Arquivos envolvidos:** `apps/web/app/(app)/reports/[id]/edit/page.tsx`
  - **Critério de conclusão:** Doc montado uma única vez; teste de integração com fixture.
  - **Dependências:** T-005
  - **Estimativa:** Média

### Fase 3: Preview, aprovação e download (PRD T-18)

- [ ] **T-007:** Painel de preview pela rota `/print`
  - **Descrição:** Iframe/painel carregando `/reports/[id]/print` (a MESMA rota do worker, com auth de sessão para o operador); barra navy do protótipo.
  - **Arquivos envolvidos:** `apps/web/components/editor/PreviewPanel.tsx`
  - **Critério de conclusão:** CA-004 — preview é literalmente a rota de impressão.
  - **Dependências:** T-006
  - **Estimativa:** Média

- [ ] **T-008:** Aprovação + enfileiramento
  - **Descrição:** `approve(reportId)`: snapshot final, transição `editing→approved` (máquina de estados), enfileirar `generate_pdf`, auditar; revalidação de status contra concorrência.
  - **Arquivos envolvidos:** `apps/web/lib/actions/editor.ts`
  - **Critério de conclusão:** Job aparece na fila; transição auditada.
  - **Dependências:** T-006
  - **Estimativa:** Média

- [ ] **T-009:** Polling de status + download assinado
  - **Descrição:** Badge "Gerando PDF…" (spinner) → "PDF pronto" via polling 2–3 s com backoff; botão "Baixar PDF" habilitado em `generated` com URL assinada ≤ 10 min; erro do worker exposto com opção de re-enfileirar.
  - **Arquivos envolvidos:** `PreviewPanel.tsx`, `apps/web/lib/actions/editor.ts`
  - **Critério de conclusão:** CA-005 de ponta a ponta com worker real.
  - **Dependências:** T-008
  - **Estimativa:** Média

### Fase 4: Testes e Validação

- [ ] **T-010:** Suite de transações adversariais do lockGuard
  - **Descrição:** Testes unitários: delete direto, select-all+delete, replace por paste, undo até antes da montagem, edição interna dos atoms — doc inalterado em todos.
  - **Arquivos envolvidos:** `apps/web/components/editor/lockGuard.test.ts`
  - **Critério de conclusão:** CA-001 com bordas da spec §6.4.
  - **Dependências:** T-003
  - **Estimativa:** Média

- [ ] **T-011:** E2E — fluxo feliz completo (M2)
  - **Descrição:** Playwright: criar → upload → revisar (corrigir erro) → fotos (alocar/cropar) → editar (texto + tentar deletar photoFrame) → aprovar → polling → baixar PDF (aceite do PRD T-18).
  - **Arquivos envolvidos:** `tests/e2e/full-flow.spec.ts`
  - **Critério de conclusão:** CA-006 verde contra Supabase local + worker.
  - **Dependências:** T-009
  - **Estimativa:** Grande

### Fase 5: Documentação e Finalização

- [ ] **T-012:** Verificação final
  - **Descrição:** Conferir CA-001..CA-007; conferência visual com telas 06–07; atualizar progresso e índice — fecha o milestone M2.
  - **Arquivos envolvidos:** `implementation/008*/`, `implementation/README.md`
  - **Critério de conclusão:** Todos os CA marcados; M2 concluído.
  - **Dependências:** T-010, T-011
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
| T-010  | ⬜ Pendente | — | — |
| T-011  | ⬜ Pendente | — | — |
| T-012  | ⬜ Pendente | — | — |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
