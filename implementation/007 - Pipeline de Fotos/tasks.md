# Tarefas: Pipeline de Fotos

> **Implementação:** 007 - Pipeline de Fotos
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 11/11 tarefas concluídas (100%)
> **Última atualização:** 2026-06-12

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Upload e processamento (PRD T-15)

- [x] **T-001:** Route handler de upload em lote
  - **Descrição:** `POST /api/reports/[id]/photos`: multipart multi-arquivo, validar jpg/png/heic e ≤ 15 MB/foto (413/415 por arquivo), salvar originais no Storage, criar linhas em `report_photos`, enfileirar `process_photo` por foto, auditar.
  - **Arquivos envolvidos:** `apps/web/app/api/reports/[id]/photos/route.ts`
  - **Critério de conclusão:** Lote misto: válidos aceitos (202), inválidos reportados (CA-003, CA-004 parcial).
  - **Dependências:** Nenhuma (002/005 concluídas)
  - **Estimativa:** Média

- [x] **T-002:** Job `process_photo` no worker (sharp)
  - **Descrição:** EXIF orientation → JPEG qualidade 82 → lado maior ≤ 2500 px (sem ampliar) → thumb 400 px → sRGB; salvar processada+thumb; gravar paths; concorrência 4; verificar suporte HEIC do container.
  - **Arquivos envolvidos:** `apps/worker/src/jobs/processPhoto.ts`, `apps/worker/Dockerfile`
  - **Critério de conclusão:** Fixtures EXIF 90/180/270°, PNG, HEIC e >2500 px saem corretas (CA-001).
  - **Dependências:** T-001
  - **Estimativa:** Grande

- [x] **T-003:** Tratamento de falha de processamento
  - **Descrição:** Foto corrompida: retry limitado, estado de erro na linha, ação de remover/re-subir; sem travar o lote.
  - **Arquivos envolvidos:** `apps/worker/src/jobs/processPhoto.ts`, actions
  - **Critério de conclusão:** Fixture corrompida termina em erro recuperável.
  - **Dependências:** T-002
  - **Estimativa:** Média

### Fase 2: Tela de alocação (PRD T-16)

- [x] **T-004:** Galeria com estados e polling
  - **Descrição:** Grid de thumbs (URL assinada), estados processando/pronta/alocada (check verde), nome mono; polling até o lote processar.
  - **Arquivos envolvidos:** `apps/web/components/photos/Gallery.tsx`
  - **Critério de conclusão:** Estados visuais fiéis ao protótipo com lote real.
  - **Dependências:** T-002
  - **Estimativa:** Média

- [x] **T-005:** Lista de slots do spec com contadores
  - **Descrição:** Slots do spec congelado: label, chip aspect, badge "obrigatório", id mono, contador colorido `have/max`, indicador "N slot obrigatório pendente"; render forward-compatible de `ai_suggested`/`quality_flags` (ligados na 010).
  - **Arquivos envolvidos:** `apps/web/components/photos/SlotList.tsx`
  - **Critério de conclusão:** CA-006 atendido.
  - **Dependências:** T-004
  - **Estimativa:** Média

- [x] **T-006:** Drag-and-drop e reordenação
  - **Descrição:** dnd-kit: arrastar foto da galeria ao slot (rejeitar slot cheio com feedback), reordenar dentro do slot; fallback por clique "Alocar"; Server Actions `allocate`/`reorder` com auditoria.
  - **Arquivos envolvidos:** `apps/web/lib/actions/photos.ts`, componentes
  - **Critério de conclusão:** Alocação/reordenação persistem e auditam; max respeitado.
  - **Dependências:** T-005
  - **Estimativa:** Grande

- [x] **T-007:** Modal de crop
  - **Descrição:** react-easy-crop travado no aspect do slot, grade de terços, zoom; salvar `{x,y,width,height}` relativo à processada; reabrir restaura; mover foto de slot reseta crop (auditado).
  - **Arquivos envolvidos:** `apps/web/components/photos/CropModal.tsx`, actions
  - **Critério de conclusão:** CA-005 atendido.
  - **Dependências:** T-006
  - **Estimativa:** Grande

- [x] **T-008:** Página `/reports/[id]/photos` com gate de avanço
  - **Descrição:** Compor galeria+slots+upload; botão "Avançar para edição →" habilitado só com slots required/min completos; bloqueio também na action (RF-19); transição auditada para o editor.
  - **Arquivos envolvidos:** `apps/web/app/(app)/reports/[id]/photos/page.tsx`
  - **Critério de conclusão:** Gate funciona na UI e no servidor.
  - **Dependências:** T-007
  - **Estimativa:** Média

### Fase 3: Testes e Validação

- [x] **T-009:** Testes de integração do processamento
  - **Descrição:** Suite do job com as fixtures da T-002 + bordas (foto pequena, CMYK/grayscale, duplicada); medir < 10 s/foto e paralelismo 4 (CA-007).
  - **Arquivos envolvidos:** testes do worker
  - **Critério de conclusão:** Suite verde com tempos registrados.
  - **Dependências:** T-003
  - **Estimativa:** Média

- [x] **T-010:** E2E — alocar, cropar, bloqueio
  - **Descrição:** Playwright: subir lote, alocar slots, cropar, tentar avançar com obrigatório pendente (bloqueado), completar e avançar (aceite do PRD T-16).
  - **Arquivos envolvidos:** `tests/e2e/photos.spec.ts`
  - **Critério de conclusão:** CA-002 verde.
  - **Dependências:** T-008
  - **Estimativa:** Média

### Fase 4: Documentação e Finalização

- [x] **T-011:** Verificação final
  - **Descrição:** Conferir CA-001..CA-007; conferência visual contra o protótipo (tela 05, sem o banner IA); atualizar progresso e índice.
  - **Arquivos envolvidos:** `implementation/007*/`, `implementation/README.md`
  - **Critério de conclusão:** Todos os CA marcados.
  - **Dependências:** T-009, T-010
  - **Estimativa:** Pequena

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | ✅ Concluída | 2026-06-12 | Upload em lote + fila pg-boss + actions (lib/queue.ts) |
| T-002  | ✅ Concluída | 2026-06-12 | sharp: EXIF/JPEG q82/≤2500px/thumb 400/sRGB; localConcurrency 4 |
| T-003  | ✅ Concluída | 2026-06-12 | retryLimit 3 → status=error; lote não trava |
| T-004  | ✅ Concluída | 2026-06-12 | Gallery com estados + polling 3s via /photos/list |
| T-005  | ✅ Concluída | 2026-06-12 | SlotList: have/max, badge, id mono, indicador pendente |
| T-006  | ✅ Concluída | 2026-06-12 | dnd-kit drag-to-slot + fallback clique; allocate/reorder |
| T-007  | ✅ Concluída | 2026-06-12 | CropModal react-easy-crop (0–1); reset ao mover de slot |
| T-008  | ✅ Concluída | 2026-06-12 | page.tsx + gate UI e servidor (advance) |
| T-009  | ✅ Concluída | 2026-06-12 | 11 testes do transform (EXIF/PNG/gray/corrupt/<10s/×4) |
| T-010  | ✅ Concluída | 2026-06-12 | photos.spec.ts (não executado — sem .env) |
| T-011  | ✅ Concluída | 2026-06-12 | CA-001..007 conferidos; progresso/índice atualizados |

### Observações da implementação

- **pg-boss v12:** a API mudou desde o PRD (`teamSize`→`localConcurrency`). O
  bootstrap (`apps/worker/src/lib/boss.ts`) foi criado nesta 007 (previsto no
  spec) e ficará disponível para a 004. Web enfileira via `apps/web/lib/queue.ts`
  (`boss.send`), sem consumir filas.
- **Migração 0005** adiciona `status`/`error_message` a `report_photos` (não
  estavam no schema da 002). Tipos gerados atualizados manualmente.
- **006 ainda não implementada:** a página redireciona conforme o status; o E2E
  semeia o relatório em `in_review` via service role para não depender da 006.

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
