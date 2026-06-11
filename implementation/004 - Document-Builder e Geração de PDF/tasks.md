# Tarefas: Document-Builder e Geração de PDF

> **Implementação:** 004 - Document-Builder e Geração de PDF
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 0/11 tarefas concluídas (0%)
> **Última atualização:** 2026-06-11

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Document-Builder (PRD T-08)

- [ ] **T-001:** Construtores JSON dos nodes custom
  - **Descrição:** Funções puras que produzem os nós `photoFrame` ({slotId, photoId, src, widthMm, heightMm}), `dataTable` ({tableId, rows}) e a mark `dataField` ({field}) em JSON TipTap (PRD §9).
  - **Arquivos envolvidos:** `packages/core/src/document-builder/nodes.ts`
  - **Critério de conclusão:** Unit tests do shape exato de cada nó.
  - **Dependências:** Nenhuma (003 concluída)
  - **Estimativa:** Média

- [ ] **T-002:** Conteúdo estático provisório do tipo 1
  - **Descrição:** Escrever `content/<slug>.<variant>.ts` com o texto do protótipo (tela 07) marcado como PROVISÓRIO, na estrutura final (seções, condicionais por variante).
  - **Arquivos envolvidos:** `packages/core/src/document-builder/content/*`
  - **Critério de conclusão:** Estrutura pronta para receber o texto real por substituição direta.
  - **Dependências:** T-001
  - **Estimativa:** Média
  - **Observações:** ⚠️ Texto definitivo bloqueado pelos modelos Word (PRD §15) — ver T-011.

- [ ] **T-003:** Builder do tipo 1
  - **Descrição:** `document-builder/<slug>.ts`: recebe `{spec, variant, data, photos}` e retorna o doc TipTap completo (texto fixo + variante + dataFields via `resolveFieldValue` + dataTables + photoFrames).
  - **Arquivos envolvidos:** `packages/core/src/document-builder/<slug>.ts`
  - **Critério de conclusão:** Snapshot test do JSON por variante verde (CA-001).
  - **Dependências:** T-002
  - **Estimativa:** Grande

### Fase 2: Rota /print (PRD T-09)

- [ ] **T-004:** Componente `PrintDocument`
  - **Descrição:** Render React do `document_json` (nodes custom incluídos) reproduzindo a diagramação da tela 07 do protótipo (cabeçalho NAABSA, tabelas navy, fotos `object-fit: cover`, rodapé numerado).
  - **Arquivos envolvidos:** `apps/web/components/print/PrintDocument.tsx`
  - **Critério de conclusão:** Render do snapshot da T-003 fiel à tela 07 (inspeção).
  - **Dependências:** T-003
  - **Estimativa:** Grande

- [ ] **T-005:** CSS de impressão A4
  - **Descrição:** `@page` A4 com margens 2 cm, `break-inside: avoid` em photoFrames e dataTables, rodapé `NAABSA · PÁGINA n DE m`, fontes embarcadas (Public Sans/IBM Plex Mono).
  - **Arquivos envolvidos:** `apps/web/components/print/print.css`
  - **Critério de conclusão:** Impressão do navegador pagina corretamente em doc multi-página.
  - **Dependências:** T-004
  - **Estimativa:** Média

- [ ] **T-006:** Rota `/reports/[id]/print` com token de serviço
  - **Descrição:** Page/route handler que valida `PRINT_SERVICE_TOKEN`, carrega o `document_json` (service role) e renderiza `PrintDocument`. 401 sem token; 404 sem relatório.
  - **Arquivos envolvidos:** `apps/web/app/reports/[id]/print/page.tsx`
  - **Critério de conclusão:** CA-002 e CA-005 atendidos.
  - **Dependências:** T-005
  - **Estimativa:** Média

### Fase 3: Worker de PDF (PRD T-10)

- [ ] **T-007:** Bootstrap pg-boss + singleton Chromium
  - **Descrição:** Conectar pg-boss ao `DATABASE_URL`; módulo `browser.ts` com instância única de Chromium, health check e relançamento em crash (RNF-08).
  - **Arquivos envolvidos:** `apps/worker/src/boss.ts`, `apps/worker/src/browser.ts`
  - **Critério de conclusão:** Worker sobe, registra filas e mantém um único Chromium entre jobs.
  - **Dependências:** Nenhuma (001/002 concluídas)
  - **Estimativa:** Média

- [ ] **T-008:** Job `generate_pdf`
  - **Descrição:** Consumir a fila com concorrência 1: abrir `/print` com token, `page.pdf({format:'A4', printBackground:true})`, salvar `reports/{id}/final.pdf` no Storage, gravar sha256 do `document_json`, transicionar para `generated`, auditar; retry e erro auditado em falha.
  - **Arquivos envolvidos:** `apps/worker/src/jobs/generatePdf.ts`
  - **Critério de conclusão:** PDF da fixture gerado de ponta a ponta (CA-003); CA-006 e CA-007 verdes.
  - **Dependências:** T-006, T-007
  - **Estimativa:** Grande

### Fase 4: Golden Test e Finalização

- [ ] **T-009:** Pipeline de golden test do tipo 1
  - **Descrição:** Fixture `tests/golden/<slug>.<variant>/` (input.xlsx, photos/, expected.pdf); pipeline extrai → monta → gera PDF → rasteriza ambos → diff de pixels ≤ 0,5% (PRD §11), rodando no container do worker.
  - **Arquivos envolvidos:** `tests/golden/**`, script de golden test
  - **Critério de conclusão:** CA-004 verde no CI.
  - **Dependências:** T-008
  - **Estimativa:** Grande

- [ ] **T-010:** Verificação final e documentação
  - **Descrição:** Conferir CA-001..CA-007; medir tempo de geração (< 60 s, RNF-004) e RAM; documentar o fluxo no README; atualizar progresso.
  - **Arquivos envolvidos:** `README.md`, `implementation/004*/`, `implementation/README.md`
  - **Critério de conclusão:** Todos os CA marcados (exceto os dependentes de insumo, anotados).
  - **Dependências:** T-009
  - **Estimativa:** Pequena

### Fase 5: Conteúdo real — BLOQUEADA

- [!] **T-011:** Substituir conteúdo provisório pelos modelos Word do cliente
  - **Descrição:** Transcrever o texto real (todas as variantes) para `content/<slug>.<variant>.ts`, atualizar snapshots e o `expected.pdf` do golden test.
  - **Arquivos envolvidos:** `packages/core/src/document-builder/content/*`, `tests/golden/**`
  - **Critério de conclusão:** Render fiel ao modelo Word validado com o cliente (CA-002 definitivo).
  - **Dependências:** T-009
  - **Estimativa:** Média
  - **Observações:** 🔴 Bloqueada por insumo do cliente (PRD §15: modelos Word + exemplos preenchidos).

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
| T-011  | 🔴 Bloqueada | — | Aguarda modelos Word (PRD §15) |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
