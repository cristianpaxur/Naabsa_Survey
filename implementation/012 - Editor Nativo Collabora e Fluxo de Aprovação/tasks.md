# Tarefas: Editor Nativo Collabora e Fluxo de Aprovação

> **Implementação:** 012 - Editor Nativo Collabora e Fluxo de Aprovação
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 4/10 tarefas concluídas (40%)
> **Última atualização:** 2026-06-26

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Montagem do working.docx

- [x] **T-001:** Extrair `buildWorkingDocx` do `renderReportPdf`
  - **Descrição:** Refatorar `generatePdf.ts` separando a parte que **monta o `.docx`** (dados+fotos+sheets+buildDocx, 1º/2º passe) da parte que **converte para PDF**. Expor `buildWorkingDocx(svc, reportId, row): Promise<Buffer>`.
  - **Arquivos envolvidos:** `apps/worker/src/jobs/generatePdf.ts`
  - **Critério de conclusão:** Função reutilizável; testes existentes da 004 seguem verdes.
  - **Dependências:** Nenhuma (011 em paralelo)
  - **Estimativa:** Média

- [x] **T-002:** Job `build_working_docx`
  - **Descrição:** `jobs/buildWorkingDocx.ts` que chama `buildWorkingDocx`, sobe `working.docx` ao Storage e grava `reports.working_docx_path`. Registrar a fila no `index.ts` (concorrência 1) e `enqueueBuildWorkingDocx` no `web/lib/queue.ts`.
  - **Arquivos envolvidos:** `apps/worker/src/jobs/buildWorkingDocx.ts`, `apps/worker/src/index.ts`, `apps/web/lib/queue.ts`
  - **Critério de conclusão:** Enfileirar gera o `working.docx` no Storage e popula a coluna.
  - **Dependências:** T-001, 011/T-003
  - **Estimativa:** Média

### Fase 2: Editor embutido

- [ ] **T-003:** Componente `<CollaboraEditor>`
  - **Descrição:** Monta o iframe via discovery+WOPISrc+token (011), em `editing` com `canWrite=true`; `approved`/`generated` em leitura. Mantém a chrome (header, badge de status, botões Preview/Aprovar).
  - **Arquivos envolvidos:** `apps/web/components/editor/CollaboraEditor.tsx`
  - **Critério de conclusão:** O documento abre e edita dentro do app (CA-001/002).
  - **Dependências:** 011/T-006, 011/T-007
  - **Estimativa:** Média

- [ ] **T-004:** Reescrever a entrada `/reports/[id]/edit`
  - **Descrição:** Substituir a montagem do `document_json`/`EditorClient` por: se `working_docx_path` nulo → `enqueueBuildWorkingDocx` + aguardar (polling); renderizar `<CollaboraEditor>`. Manter o roteamento por status.
  - **Arquivos envolvidos:** `apps/web/app/(app)/reports/[id]/edit/page.tsx`
  - **Critério de conclusão:** Entrada em `editing` monta e abre o editor; entradas seguintes não remontam.
  - **Dependências:** T-002, T-003
  - **Estimativa:** Média

### Fase 3: Preview e Aprovação a partir do working.docx

- [x] **T-005:** `preview_pdf` converte o `working.docx`
  - **Descrição:** Ajustar `previewPdf.ts` para baixar o `working.docx` e `convertDocxToPdf` (sem reconstruir dos dados). Atualizar índices/TOC na conversão.
  - **Arquivos envolvidos:** `apps/worker/src/jobs/previewPdf.ts`
  - **Critério de conclusão:** Preview reflete a edição do operador (CA-003).
  - **Dependências:** T-001
  - **Estimativa:** Média

- [x] **T-006:** `generate_pdf` converte o `working.docx`
  - **Descrição:** Ajustar `generatePdf.ts` (caminho de aprovação): converter o `working.docx` editado → `final-v{n}.pdf` + `final.docx`; manter versionamento, `document_hash` (agora sobre o docx) e auditoria.
  - **Arquivos envolvidos:** `apps/worker/src/jobs/generatePdf.ts`
  - **Critério de conclusão:** Uma edição manual aparece no PDF final (CA-004); versionamento ok (CA-005).
  - **Dependências:** T-001
  - **Estimativa:** Média

- [ ] **T-007:** Ajustar actions de aprovação/preview/snapshot
  - **Descrição:** `actions/editor.ts`: `approve` sem `document_json`; snapshot = cópia do `working.docx` no Storage; preview/download inalterados em assinatura. Regeneração reabre o `working.docx`.
  - **Arquivos envolvidos:** `apps/web/lib/actions/editor.ts`, `apps/web/lib/actions/regenerate.ts`
  - **Critério de conclusão:** Aprovar/regenerar funcionam com o novo modelo; auditoria preservada.
  - **Dependências:** T-006
  - **Estimativa:** Média

### Fase 4: Deprecação, testes e E2E

- [ ] **T-008:** Deprecar o TipTap do fluxo `/edit`
  - **Descrição:** Remover o uso de `EditorClient`/nodes/marks TipTap na rota de edição (arquivos permanecem até limpeza dedicada). Garantir que `document_json` não é mais lido/escrito.
  - **Arquivos envolvidos:** `apps/web/components/editor/*` (referências), `edit/page.tsx`
  - **Critério de conclusão:** Nenhum caminho de produção depende do TipTap; build limpo.
  - **Dependências:** T-004
  - **Estimativa:** Pequena

- [ ] **T-009:** Testes unitários e de integração
  - **Descrição:** `buildWorkingDocx`; `generatePdf`/`previewPdf` convertendo o `working.docx`; integração entrada→working.docx e aprovação refletindo edição (CA-004). `pnpm lint`/`pnpm test` verdes.
  - **Arquivos envolvidos:** `apps/worker/src/jobs/*.test.ts`, `apps/web/lib/actions/*.test.ts`
  - **Critério de conclusão:** Suítes 6.1/6.2 passam; lint limpo.
  - **Dependências:** T-005, T-006, T-007
  - **Estimativa:** Média

- [ ] **T-010:** E2E do fluxo feliz com Collabora
  - **Descrição:** Atualizar/criar o E2E: criar → upload → revisar → fotos → **editar no Collabora** → aprovar → baixar PDF (CA-007). Substitui a parte do editor no `full-flow` da 008.
  - **Arquivos envolvidos:** `tests/e2e/full-flow.spec.ts`
  - **Critério de conclusão:** E2E verde contra os serviços locais (inclui Collabora).
  - **Dependências:** T-004, T-007
  - **Estimativa:** Grande

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | ✅ Concluída | 2026-06-26 | `buildWorkingDocx` extraído; `renderReportPdf` reusa; worker typecheck + 3 testes verdes (comportamento preservado) |
| T-002  | ✅ Concluída | 2026-06-26 | job `build_working_docx` + fila registrada (conc. 1) + `enqueueBuildWorkingDocx` |
| T-003  | ⬜ Pendente | — | — |
| T-004  | ⬜ Pendente | — | — |
| T-005  | ✅ Concluída | 2026-06-26 | `convertWorkingDocxToPdf` (download+convert, fallback build); `preview_pdf` usa |
| T-006  | ✅ Concluída | 2026-06-26 | `generate_pdf` converte o `working.docx` editado; docHash = sha256 do .docx; worker typecheck+36 testes verdes |
| T-007  | ⬜ Pendente | — | — |
| T-008  | ⬜ Pendente | — | — |
| T-009  | ⬜ Pendente | — | — |
| T-010  | ⬜ Pendente | — | — |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
