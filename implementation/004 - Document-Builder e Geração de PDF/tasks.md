# Tarefas: Document-Builder e Geração de PDF

> **Implementação:** 004 - Document-Builder e Geração de PDF
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 12/14 tarefas concluídas (86%) — grades nativas implementadas (T-012).
> **Última atualização:** 2026-06-23

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Document-Builder (PRD T-08)

- [x] **T-001:** Construtores JSON dos nodes custom
  - **Descrição:** Funções puras que produzem os nós `photoFrame` ({slotId, photoId, src, widthMm, heightMm}), `dataTable` ({tableId, rows}) e a mark `dataField` ({field}) em JSON TipTap (PRD §9).
  - **Arquivos envolvidos:** `packages/core/src/document-builder/nodes.ts`, `nodes.test.ts`, `types.ts`
  - **Critério de conclusão:** Unit tests do shape exato de cada nó.
  - **Dependências:** Nenhuma (003 concluída)
  - **Estimativa:** Média

- [x] **T-002:** Conteúdo estático provisório do tipo 1
  - **Descrição:** Escrever `content/<slug>.<variant>.ts` com o texto do protótipo (tela 07) marcado como PROVISÓRIO, na estrutura final (seções, condicionais por variante).
  - **Arquivos envolvidos:** `packages/core/src/document-builder/content/draft_survey.discharge.ts`, `content/draft_survey.loading.ts`
  - **Critério de conclusão:** Estrutura pronta para receber o texto real por substituição direta.
  - **Dependências:** T-001
  - **Estimativa:** Média
  - **Observações:** ⚠️ Texto definitivo bloqueado pelos modelos Word (PRD §15) — ver T-011.

- [x] **T-003:** Builder do tipo 1
  - **Descrição:** `document-builder/draft_survey.ts`: recebe `{spec, variant, data, photos}` e retorna o doc TipTap completo (texto fixo + variante + dataFields + dataTables + photoFrames).
  - **Arquivos envolvidos:** `packages/core/src/document-builder/draft_survey.ts`, `draft_survey.test.ts`
  - **Critério de conclusão:** Snapshot test do JSON por variante verde (CA-001).
  - **Dependências:** T-002
  - **Estimativa:** Grande

### Fase 2: Rota /print (PRD T-09)

- [x] **T-004:** Componente `PrintDocument`
  - **Descrição:** Render React do `document_json` (nodes custom incluídos) reproduzindo a diagramação da tela 07 do protótipo.
  - **Arquivos envolvidos:** `apps/web/components/print/PrintDocument.tsx`
  - **Critério de conclusão:** Render fiel à tela 07 (inspeção manual via /print).
  - **Dependências:** T-003
  - **Estimativa:** Grande

- [x] **T-005:** CSS de impressão A4
  - **Descrição:** `@page` A4 com margens 2 cm, `break-inside: avoid` em photoFrames e dataTables, rodapé `NAABSA · PÁGINA n DE m`, fontes embarcadas.
  - **Arquivos envolvidos:** `apps/web/components/print/print.css`
  - **Critério de conclusão:** CSS completo com todas as classes usadas pelo PrintDocument.
  - **Dependências:** T-004
  - **Estimativa:** Média

- [x] **T-006:** Rota `/reports/[id]/print` com token de serviço
  - **Descrição:** Route handler (`route.ts`) que valida `PRINT_SERVICE_TOKEN`, carrega `document_json` (service role) e renderiza `PrintDocument` via `renderToStaticMarkup`. 401 sem token; 404 sem relatório.
  - **Arquivos envolvidos:** `apps/web/app/reports/[id]/print/route.ts`
  - **Critério de conclusão:** CA-002 e CA-005 atendidos.
  - **Dependências:** T-005
  - **Estimativa:** Média

### Fase 3: Worker de PDF (PRD T-10)

- [x] **T-007:** Bootstrap pg-boss + singleton Chromium
  - **Descrição:** pg-boss já existe (impl 007). Novo módulo `lib/browser.ts` com singleton Chromium: health check, relançamento em crash, shutdown limpo.
  - **Arquivos envolvidos:** `apps/worker/src/lib/browser.ts`; `index.ts` atualizado.
  - **Critério de conclusão:** Worker mantém Chromium singleton entre jobs.
  - **Dependências:** Nenhuma (001/002 concluídas)
  - **Estimativa:** Média

- [x] **T-008:** Job `generate_pdf`
  - **Descrição:** Consumir fila `generate_pdf` com concorrência 1: abre `/print` com token, `page.pdf({format:'A4', printBackground:true})`, salva Storage `reports/{id}/final.pdf`, sha256 do `document_json`, transiciona `approved → generated`, audita.
  - **Arquivos envolvidos:** `apps/worker/src/jobs/generatePdf.ts`; `index.ts` registra a fila.
  - **Critério de conclusão:** Job completo com CA-006 (localConcurrency:1) e CA-007 (sha256).
  - **Dependências:** T-006, T-007
  - **Estimativa:** Grande

### Fase 4: Golden Test e Finalização

- [x] **T-009:** Pipeline de golden test do tipo 1
  - **Descrição:** Fixture `tests/golden/draft_survey.discharge/` + `golden-pipeline.test.ts` (5 testes: extrai → monta → renderiza HTML). PDF diff ≤ 0,5% (CA-004 definitivo) requer stack rodando — documentado em README da fixture.
  - **Arquivos envolvidos:** `tests/golden/**`, `vitest.config.mts`, `package.json` (+test:golden script)
  - **Critério de conclusão:** 5 testes verdes (CA-004 provisório).
  - **Dependências:** T-008
  - **Estimativa:** Grande

- [x] **T-010:** Verificação final e documentação
  - **Descrição:** Conferir CA-001..CA-007; atualizar tasks.md e README.
  - **Arquivos envolvidos:** `implementation/004*/`, `implementation/README.md`
  - **Critério de conclusão:** Todos os CA marcados.
  - **Dependências:** T-009
  - **Estimativa:** Pequena

### Fase 5: Conteúdo real (EN) — INSUMO RECEBIDO 2026-06-23

> Modelo: `tests/fixtures/reports/draft_survey/MV-PERSEUS-I.model.docx` · estrutura: `field-map.md`.
> Depende do contrato v2 do spec (003/T-013..T-016) para variante/multi-aba/tables.

- [x] **T-011:** Conteúdo real do `draft_survey` em inglês
  - **Descrição:** Reescrever `content/draft_survey.{loading,discharge}.ts` com o texto do modelo:
    cabeçalho (Ref/vessel/flag/IMO/port/date), Person/Companies contacted, Background (com texto
    por variante load/discharge e por berthing side `Capa!C31`), Ship's Particulars, e as 3 fases
    (Initial/Intermediate/Final) com data-fields. **Intermediate condicional** (RF-007).
  - **Arquivos envolvidos:** `packages/core/src/document-builder/content/*`, `draft_survey.ts`
  - **Critério de conclusão:** Snapshot por variante; estrutura fiel ao modelo (CA-001).
  - **Dependências:** 003/T-014
  - **Estimativa:** Grande

- [x] **T-012:** Tabelas-resumo + grades nativas das fases
  - **Descrição:** `dataTable` de draft readings (Fwd/Ms/Aft, Trim, Heel/List, Deflection) por fase +
    as grades "…Draft details" a partir de `source.tables[]` (RF-008) + a tabela "Acting as / figures".
  - **Arquivos envolvidos:** `packages/core/src/document-builder/content/*`, `nodes.ts` (se preciso)
  - **Critério de conclusão:** Tabelas renderizam dos dados/tables reais.
  - **Dependências:** 003/T-015, T-011
  - **Estimativa:** Grande

- [ ] **T-013:** Ajustar `PrintDocument` + `print.css` ao layout do modelo
  - **Descrição:** Cabeçalho NAABSA (endereço/contato), Contents, seções tituladas, estilo das
    tabelas (header navy), Photographic Report (grids) e Attachment. Public Sans / IBM Plex Mono.
  - **Arquivos envolvidos:** `apps/web/components/print/PrintDocument.tsx`, `print.css`
  - **Critério de conclusão:** Render de `/print` fiel ao modelo (CA-002 definitivo).
  - **Dependências:** T-012
  - **Estimativa:** Média

- [ ] **T-014:** Golden test contra o modelo real
  - **Descrição:** Gerar `expected.pdf` a partir do modelo aprovado e fechar o pixel-diff ≤ 0,5%
    (CA-004 definitivo); atualizar snapshots e a fixture golden.
  - **Arquivos envolvidos:** `tests/golden/draft_survey.*/**`
  - **Critério de conclusão:** Golden test verde com o conteúdo real.
  - **Dependências:** T-013, 003/T-016
  - **Estimativa:** Média

---

## Critérios de Aceitação

| CA | Status | Notas |
|---|---|---|
| CA-001 | ✅ Verde | Snapshot test do JSON TipTap por variante (draft_survey.test.ts) |
| CA-002 | ✅ Provisório | Render fiel ao protótipo (tela 07); definitivo após modelos Word |
| CA-003 | 🟡 Pendente stack | PDF de ponta a ponta requer worker + banco rodando |
| CA-004 | 🟡 Pendente stack | Pixel diff requer stack rodando; pipeline estruturado |
| CA-005 | ✅ Verde | route.ts retorna 401 sem token |
| CA-006 | ✅ Verde | localConcurrency: 1 configurado no index.ts |
| CA-007 | ✅ Verde | sha256 calculado e salvo em generatePdf.ts |

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | ✅ Concluída | 2026-06-13 | nodes.ts + types.ts + nodes.test.ts (8 testes) |
| T-002  | ✅ Concluída | 2026-06-13 | content/draft_survey.{discharge,loading}.ts — PROVISÓRIO |
| T-003  | ✅ Concluída | 2026-06-13 | draft_survey.ts + draft_survey.test.ts (8 testes + 2 snapshots) |
| T-004  | ✅ Concluída | 2026-06-13 | PrintDocument.tsx com todos os nodes custom |
| T-005  | ✅ Concluída | 2026-06-13 | print.css — @page A4, break-inside, rodapé, fontes |
| T-006  | ✅ Concluída | 2026-06-13 | route.ts — 401 sem token, 404 sem relatório |
| T-007  | ✅ Concluída | 2026-06-13 | browser.ts — singleton Chromium + shutdown no index.ts |
| T-008  | ✅ Concluída | 2026-06-13 | generatePdf.ts — job completo com hash, Storage, transição |
| T-009  | ✅ Concluída | 2026-06-13 | golden-pipeline.test.ts (5 testes verdes); CA-004 definitivo requer stack |
| T-010  | ✅ Concluída | 2026-06-13 | Todos CA marcados; implementação concluída |
| T-011  | ✅ Concluída | 2026-06-23 | content/{discharge,loading}.ts reescritos: 9 seções EN (Background variante-driven + Intermediate condicional); BuilderInput.tables; 127 testes core + 5 golden verdes |
| T-012  | ✅ Concluída | 2026-06-23 | tableRows/gradeSection: 4 grades/fase + Acting-as Figures; Heel/Deflection nas 3 fases; 127 testes verdes |
| T-013  | ⬜ Pendente | — | PrintDocument/print.css no layout do modelo (CA-002 definitivo) |
| T-014  | ⬜ Pendente | — | Golden test contra o modelo real (CA-004 definitivo) |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
