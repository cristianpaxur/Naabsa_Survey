# Tarefas: Editor TipTap e Aprovação

> **Implementação:** 008 - Editor TipTap e Aprovação
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 12/12 tarefas concluídas (100%) — **Milestone M2 concluído** 🎉
> **Última atualização:** 2026-06-14

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Extensões custom (PRD T-17)

- [x] **T-001:** Node `photoFrame`
  - **Descrição:** Atom `selectable:false, draggable:false`, atrs `{slotId, photoId, src, widthMm, heightMm}`, NodeView com frame fixo `object-fit: cover` e pill "photoFrame" (affordance do protótipo).
  - **Arquivos envolvidos:** `apps/web/components/editor/nodes/photoFrame.ts`, `nodes/PhotoFrameView.tsx`
  - **Critério de conclusão:** Renderiza o JSON da 004; dimensão fixa em mm.
  - **Dependências:** Nenhuma (004 concluída)
  - **Estimativa:** Média

- [x] **T-002:** Node `dataTable` e mark `dataField`
  - **Descrição:** `dataTable` atom não editável (atrs `{tableId, rows}`, render estilizado navy); mark `dataField {field}` com highlight no hover, sem efeito de edição.
  - **Arquivos envolvidos:** `apps/web/components/editor/nodes/dataTable.ts`, `nodes/DataTableView.tsx`, `marks/dataField.ts`
  - **Critério de conclusão:** Ambos renderizam fiéis ao protótipo (CA-007 para a mark).
  - **Dependências:** Nenhuma
  - **Estimativa:** Média

- [x] **T-003:** `lockGuard` — filterTransaction
  - **Descrição:** Filtro de transação ProseMirror que cancela qualquer transação que delete/edite `photoFrame` ou `dataTable` (delete direto, select-all+delete, replace, paste sobre).
  - **Arquivos envolvidos:** `apps/web/components/editor/lockGuard.ts`, `lockGuard.core.ts`
  - **Critério de conclusão:** Suite de transações adversariais verde (CA-001).
  - **Dependências:** T-001, T-002
  - **Estimativa:** Grande
  - **Observação:** Implementação all-or-nothing — a transação inteira é rejeitada se removeria um nó travado (mais estrita que a nuance §6.4 "texto livre some"; CA-001 plenamente atendido).

### Fase 2: Editor e autosave (PRD T-17)

- [x] **T-004:** Editor pageless + toolbar
  - **Descrição:** TipTap com StarterKit/Table/TextAlign/Underline + extensões custom; toolbar pt-BR (parágrafo/headings, B/I/U, alinhamento, listas, tabela, undo/redo, localizar); canvas papel sobre fundo do protótipo.
  - **Arquivos envolvidos:** `apps/web/components/editor/EditorClient.tsx`, `Toolbar.tsx`, `editor.css`
  - **Critério de conclusão:** Edição fluida; nós custom carregados.
  - **Dependências:** T-003
  - **Estimativa:** Grande

- [x] **T-005:** Autosave + snapshots
  - **Descrição:** Debounce 2 s para `saveDocument` (rejeita fora de `editing`); indicador "Salvo · há Xs"; retry com backoff; snapshots no audit_log a cada transição de status e ≤ 5 min de edição contínua.
  - **Arquivos envolvidos:** `apps/web/lib/actions/editor.ts`, `EditorClient.tsx`
  - **Critério de conclusão:** CA-002 e CA-003 atendidos.
  - **Dependências:** T-004
  - **Estimativa:** Grande

- [x] **T-006:** Montagem do documento (RF-20) e página `/edit`
  - **Descrição:** Na primeira entrada em `editing`: montar `document_json` via builder da 004 (dados efetivos + fotos confirmadas), persistir e auditar; entradas seguintes carregam o existente sem remontar; redirecionar status incompatível.
  - **Arquivos envolvidos:** `apps/web/app/(app)/reports/[id]/edit/page.tsx`, `lib/document-assembly.ts`
  - **Critério de conclusão:** Doc montado uma única vez; verificado visualmente no navegador.
  - **Dependências:** T-005
  - **Estimativa:** Média

### Fase 3: Preview, aprovação e download (PRD T-18)

- [x] **T-007:** Painel de preview pela rota `/print`
  - **Descrição:** Iframe carregando `/reports/[id]/print` (a MESMA rota do worker, agora com auth de sessão do operador); a rota resolve caminhos de foto → URLs assinadas frescas no render.
  - **Arquivos envolvidos:** `apps/web/components/editor/PreviewPanel.tsx`, `app/reports/[id]/print/route.ts`, `lib/print-resolve.ts`
  - **Critério de conclusão:** CA-004 — preview é literalmente a rota de impressão.
  - **Dependências:** T-006
  - **Estimativa:** Média

- [x] **T-008:** Aprovação + enfileiramento
  - **Descrição:** `approve(reportId, json)`: snapshot final, transição `editing→approved` (máquina de estados), enfileirar `generate_pdf`, auditar; revalidação de status contra concorrência.
  - **Arquivos envolvidos:** `apps/web/lib/actions/editor.ts`, `lib/queue.ts`
  - **Critério de conclusão:** Job enfileirado; transição auditada.
  - **Dependências:** T-006
  - **Estimativa:** Média

- [x] **T-009:** Polling de status + download assinado
  - **Descrição:** Badge "Gerando PDF…" (spinner) → "PDF pronto" via polling 2–3 s com backoff; botão "Baixar PDF" habilitado em `generated` com URL assinada ≤ 10 min.
  - **Arquivos envolvidos:** `PreviewPanel.tsx`, `apps/web/lib/actions/editor.ts`
  - **Critério de conclusão:** CA-005 de ponta a ponta com worker real (execução ao vivo: ver nota de ambiente).
  - **Dependências:** T-008
  - **Estimativa:** Média

### Fase 4: Testes e Validação

- [x] **T-010:** Suite de transações adversariais do lockGuard
  - **Descrição:** Testes unitários: delete direto, select-all+delete, replace por paste, edição interna dos atoms, bypass da montagem — doc inalterado em todos.
  - **Arquivos envolvidos:** `apps/web/components/editor/lockGuard.test.ts`
  - **Critério de conclusão:** CA-001 com bordas da spec §6.4. **13 testes verdes.**
  - **Dependências:** T-003
  - **Estimativa:** Média

- [x] **T-011:** E2E — fluxo feliz completo (M2)
  - **Descrição:** Playwright: criar → upload → revisar (corrigir erro) → fotos (alocar) → editar (texto + lockGuard) → aprovar → polling → baixar PDF (aceite do PRD T-18).
  - **Arquivos envolvidos:** `tests/e2e/full-flow.spec.ts`
  - **Critério de conclusão:** CA-006 verde contra Supabase + worker.
  - **Dependências:** T-009
  - **Estimativa:** Grande
  - **Observação:** ✅ **Verde ao vivo** (15/15 E2E passando, worker real gerando PDF). Exigiu corrigir 3 bugs latentes (ver abaixo).

### Fase 5: Documentação e Finalização

- [x] **T-012:** Verificação final
  - **Descrição:** Conferir CA-001..CA-007; conferência visual com telas 06–07; atualizar progresso e índice — fecha o milestone M2.
  - **Arquivos envolvidos:** `implementation/008*/`, `implementation/README.md`
  - **Critério de conclusão:** Todos os CA marcados; M2 concluído.
  - **Dependências:** T-010, T-011
  - **Estimativa:** Pequena
  - **Observação:** ✅ CA-001..CA-007 verdes (13 unit lockGuard + 15 E2E + verificação visual).

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | ✅ Concluída | 2026-06-14 | nodes/photoFrame.ts + PhotoFrameView (atom travado) |
| T-002  | ✅ Concluída | 2026-06-14 | nodes/dataTable.ts + DataTableView; marks/dataField.ts |
| T-003  | ✅ Concluída | 2026-06-14 | lockGuard.ts + lockGuard.core.ts (filterTransaction) |
| T-004  | ✅ Concluída | 2026-06-14 | EditorClient.tsx + Toolbar.tsx + editor.css (pageless) |
| T-005  | ✅ Concluída | 2026-06-14 | autosave 2 s + snapshots ≤ 5 min; chip "Salvo · há Xs" |
| T-006  | ✅ Concluída | 2026-06-14 | montagem RF-20 em /edit (assembleDocument); verificado visualmente |
| T-007  | ✅ Concluída | 2026-06-14 | PreviewPanel (iframe /print); rota /print + auth sessão + print-resolve |
| T-008  | ✅ Concluída | 2026-06-14 | approve() + enqueueGeneratePdf; transição auditada |
| T-009  | ✅ Concluída | 2026-06-14 | polling getPdfStatus + getDownloadUrl (URL assinada) |
| T-010  | ✅ Concluída | 2026-06-14 | lockGuard.test.ts — 13 testes adversariais (CA-001 + §6.4) |
| T-011  | ✅ Concluída | 2026-06-14 | full-flow.spec.ts verde ao vivo (15/15 E2E; worker gera PDF) |
| T-012  | ✅ Concluída | 2026-06-14 | CA-001..007 verdes; M2 fechado |

---

## 🐛 Bugs latentes corrigidos para fechar o M2 ao vivo

A execução ao vivo revelou 4 bugs (3 herdados da 004 + 1 da 006) que travavam o fluxo:

1. **`confirmData` (006)** transicionava `in_review → editing`, pulando a tela de fotos
   (a `/photos` só renderiza em `in_review` e redirecionava direto pro editor). Corrigido:
   confirmData mantém `in_review`; a transição para `editing` vem do avanço pelas fotos (007).
2. **worker `generatePdf` (004)** gravava `audit_log` com colunas inexistentes
   (`user_id`/`details`) → corrigido para `actor`/`payload`.
3. **worker `generatePdf` (004)** atualizava `reports.generated_at`, coluna que **não existe**
   no schema → removido (carimbo fica no `audit_log`).
4. **rota `/print` (004)** importava `react-dom/server` no topo → erro de build do Next 15
   (App Router) que cobria o editor com overlay → trocado por import dinâmico. Guardas
   defensivas em `PrintDocument` para `attrs` ausentes.

## ⚠️ Pré-requisitos de ambiente (geração de PDF / jobs)

O sistema de filas (pg-boss) exige duas variáveis corretas no `.env` (já ajustadas):

1. **`DATABASE_URL`** — senha **percent-encoded** (`#`→`%23`, `@`→`%40`, `$`→`%24`). Sem isso,
   `new URL()` do `pg-connection-string` falha com `ERR_INVALID_URL` e nenhum job conecta.
2. **`APP_BASE_URL`** — aponta para o web acessível pelo worker (`http://localhost:3000`).

Rodar o fluxo completo:

```
# terminal 1 — web
pnpm --filter @naabsa/web dev
# terminal 2 — worker (Chromium + pg-boss)
pnpm --filter @naabsa/worker exec dotenv -e ../../.env -- tsx src/index.ts
# terminal 3 — E2E
pnpm -w run e2e tests/e2e/full-flow.spec.ts
```

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
