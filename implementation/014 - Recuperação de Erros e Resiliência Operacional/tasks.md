# Tarefas: Recuperação de Erros e Resiliência Operacional

> **Implementação:** 014 - Recuperação de Erros e Resiliência Operacional
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 10/10 tarefas concluídas (100%) — aceite CA-001..004 pendente de verificação na stack local
> **Última atualização:** 2026-07-02

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Dead-letter no worker

- [x] **T-001:** Helper `auditJobFailure` + dead-letter no `generate_pdf`
  - **Descrição:** Criar `apps/worker/src/lib/deadLetter.ts` com `auditJobFailure(queue, reportId, err, jobId?)` inserindo `pdf_generation_failed`/`preview_failed`/`working_docx_failed` no `audit_log`. Aplicar no handler do `generate_pdf` (padrão `retryCount >= retryLimit` do `process_photo`): última tentativa → audita e NÃO relança.
  - **Arquivos envolvidos:** `apps/worker/src/lib/deadLetter.ts`, `apps/worker/src/index.ts`
  - **Critério de conclusão:** RF-001 para `generate_pdf`; falha ao auditar só loga (não mascara o erro original).
  - **Dependências:** Nenhuma
  - **Estimativa:** Média

- [x] **T-002:** Dead-letter no `build_working_docx` e `preview_pdf` + retry do preview
  - **Descrição:** Replicar o dead-letter nos handlers `build_working_docx` e `preview_pdf`; subir `PREVIEW_PDF_RETRY_LIMIT` de 1 para 2 (RF-006).
  - **Arquivos envolvidos:** `apps/worker/src/index.ts`, `apps/worker/src/jobs/previewPdf.ts`
  - **Critério de conclusão:** RF-001 completo; RF-006 (retryLimit 2).
  - **Dependências:** T-001
  - **Estimativa:** Pequena

### Fase 2: Recuperação na UI — PDF e editor

- [x] **T-003:** Detecção de falha no `getPdfStatus` (lógica pura + action)
  - **Descrição:** Extrair função pura `pdfFailureFrom(auditRows)` (o `pdf_generation_failed` mais recente é posterior ao último `pdf_enqueued`?) e usá-la no `getPdfStatus`, que passa a devolver `{ failed, failReason? }`.
  - **Arquivos envolvidos:** `apps/web/lib/actions/editor.ts`, `apps/web/lib/pdf-failure.ts` (novo, puro)
  - **Critério de conclusão:** Unit test da função pura; `getPdfStatus` reporta falha.
  - **Dependências:** T-001
  - **Estimativa:** Média

- [x] **T-004:** Action `retryGeneratePdf` + botão "Tentar gerar novamente"
  - **Descrição:** Action que exige `approved`, re-enfileira `generate_pdf` e audita `pdf_enqueued`. No `PreviewPanel`, quando `failed` (ou polling esgotado em `approved`), mostrar erro pt-BR + botão que chama a action e retoma o polling.
  - **Arquivos envolvidos:** `apps/web/lib/actions/editor.ts`, `apps/web/components/editor/PreviewPanel.tsx`
  - **Critério de conclusão:** CA-001; RF-002.
  - **Dependências:** T-003
  - **Estimativa:** Média

- [x] **T-005:** Editor distingue build falhado de build em andamento
  - **Descrição:** `getEditorUrl` consulta `working_docx_failed` posterior ao último `working_docx_enqueued` → devolve `{ error, canRetry: true }` em vez de `pending`. `CollaboraEditor` mostra o motivo e o "Tentar de novo" re-enfileira o build (nova action ou parâmetro).
  - **Arquivos envolvidos:** `apps/web/lib/actions/editor.ts`, `apps/web/components/editor/CollaboraEditor.tsx`
  - **Critério de conclusão:** CA-002; RF-003 (sem polling cego de 2 min quando já falhou).
  - **Dependências:** T-002, T-003
  - **Estimativa:** Média

### Fase 3: Descartar e reenviar planilha

- [x] **T-006:** Action `deleteReport`
  - **Descrição:** Exige `draft`/`extracted`. Remove Storage `reports/{id}/**` (list+remove recursivo tolerante a falha parcial), `report_photos`, `audit_log`, `reports`. Ver decisão §9 do spec (trail removido junto).
  - **Arquivos envolvidos:** `apps/web/lib/actions/reports.ts`
  - **Critério de conclusão:** RF-004 (lado servidor); guarda de status testada.
  - **Dependências:** Nenhuma
  - **Estimativa:** Média

- [x] **T-007:** Botão "Descartar" no dashboard com confirmação
  - **Descrição:** Nas linhas em `draft`/`extracted`, ação "Descartar" com confirmação exibindo o nome do navio; sucesso remove a linha (refresh).
  - **Arquivos envolvidos:** `apps/web/app/(app)/dashboard/page.tsx`, componente de linha do dashboard
  - **Critério de conclusão:** CA-003.
  - **Dependências:** T-006
  - **Estimativa:** Média

- [x] **T-008:** Action `resetToDraft` + botão "Enviar nova planilha" + upload em `draft`
  - **Descrição:** Action: `extracted`/`in_review` → `draft` via `transition` (auditada), limpa `operator_overrides` e `working_docx_path`, remove `working.docx`/`preview.pdf`/`sheets/*` do Storage, audita `report_reset`. Na revisão, botão com confirmação; em `draft`, a tela de revisão renderiza o passo de upload (reuso do `UploadStep` em modo reenvio — mesmo `POST /api/reports/[id]/spreadsheet`).
  - **Arquivos envolvidos:** `apps/web/lib/actions/reports.ts`, `apps/web/app/(app)/reports/[id]/review/page.tsx`, `apps/web/components/wizard/UploadStep.tsx`
  - **Critério de conclusão:** CA-004; RF-005 (fotos preservadas).
  - **Dependências:** T-006 (padrões de action), nenhuma técnica dura
  - **Estimativa:** Grande

### Fase 4: Testes e documentação

- [x] **T-009:** Testes unitários e de integração
  - **Descrição:** `auditJobFailure` (action por fila); handler na última tentativa audita e não relança (mock de job); `pdfFailureFrom` (ordenações); guardas de `deleteReport`/`resetToDraft`. `pnpm lint` + `pnpm test` verdes.
  - **Arquivos envolvidos:** `apps/worker/src/lib/deadLetter.test.ts`, `apps/web/lib/pdf-failure.test.ts`
  - **Critério de conclusão:** CA-005, CA-006.
  - **Dependências:** T-001..T-008
  - **Estimativa:** Média

- [x] **T-010:** Atualizar documentação e índice
  - **Descrição:** Atualizar este `tasks.md`, o `spec.md` (status/CAs) e o `implementation/README.md` (linha da 014).
  - **Arquivos envolvidos:** `implementation/014 - Recuperação de Erros e Resiliência Operacional/*`, `implementation/README.md`
  - **Critério de conclusão:** Índice e progresso refletem a realidade.
  - **Dependências:** T-009
  - **Estimativa:** Pequena

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | ✅ Concluída | 2026-07-02 | `lib/deadLetter.ts` + handler generate_pdf (última tentativa audita, não relança) |
| T-002  | ✅ Concluída | 2026-07-02 | handlers build_working_docx/preview_pdf + PREVIEW_PDF_RETRY_LIMIT 1→2 |
| T-003  | ✅ Concluída | 2026-07-02 | `lib/job-failure.ts` (puro) + getPdfStatus com {failed, failReason} |
| T-004  | ✅ Concluída | 2026-07-02 | action retryGeneratePdf + PreviewPanel com badge/botão de retentativa |
| T-005  | ✅ Concluída | 2026-07-02 | getEditorUrl distingue falha (canRetry) + retryBuildWorkingDocx (enqueue sem dedupe) |
| T-006  | ✅ Concluída | 2026-07-02 | deleteReport (draft/extracted; Storage+fotos+audit+linha) |
| T-007  | ✅ Concluída | 2026-07-02 | DiscardReportButton no dashboard (confirmação com navio) |
| T-008  | ✅ Concluída | 2026-07-02 | resetToDraft (limpa overrides/artefatos, audita report_reset) + ResetToDraftButton + ReuploadPanel (corrige beco do draft na revisão) |
| T-009  | ✅ Concluída | 2026-07-02 | deadLetter.test (4) + job-failure.test (6); monorepo 238 testes verdes, lint/typecheck ok |
| T-010  | ✅ Concluída | 2026-07-02 | tasks/spec/README atualizados |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
