# Tarefas: Retenção, IA e Hardening

> **Implementação:** 010 - Retenção, IA e Hardening
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 5/13 tarefas concluídas (38%)
> **Última atualização:** 2026-06-24

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Retenção e histórico (PRD T-24)

- [x] **T-001:** Job `retention_purge`
  - **Descrição:** Cron diário pg-boss: `generated` > 30 dias (janela contada do último PDF) → apagar fotos (3 versões) e planilha do Storage, manter PDF(s)+dados, `purged`+`purged_at`, auditar; idempotente.
  - **Arquivos envolvidos:** `apps/worker/src/jobs/retentionPurge.ts`, `apps/worker/src/index.ts` (cron)
  - **Critério de conclusão:** Fixture retroativa purga blobs e preserva PDF (CA-001).
  - **Dependências:** Nenhuma (008 concluída)
  - **Estimativa:** Média
  - **Concluída:** elegibilidade pura testada (unit); purga remove fotos/planilha/sheets/preview, preserva final*.pdf + .docx; cron 03:00 via `boss.schedule`. CA-001 (storage) é integração — ver Fase 5.

- [x] **T-002:** Tela 08 — Histórico
  - **Descrição:** `/reports/[id]/history` com timeline fiel ao protótipo (hora mono, ponto colorido por tipo de ação, ator em chip, detalhe mono); paginação simples se necessário.
  - **Arquivos envolvidos:** `apps/web/app/(app)/reports/[id]/history/page.tsx`
  - **Critério de conclusão:** Timeline completa de um relatório `generated` (CA-002).
  - **Dependências:** Nenhuma
  - **Estimativa:** Média

- [x] **T-003:** Acesso ao histórico pelo dashboard
  - **Descrição:** Ação por linha do dashboard (e/ou aba no relatório) levando ao histórico — decisão de UI validada com o usuário (spec §9).
  - **Arquivos envolvidos:** `apps/web/app/(app)/dashboard/page.tsx`
  - **Critério de conclusão:** Histórico alcançável para qualquer relatório, não só purgados.
  - **Dependências:** T-002
  - **Estimativa:** Pequena

### Fase 2: Regeneração de PDF (PRD T-25)

- [x] **T-004:** Action `regenerate` + extensão da máquina de estados
  - **Descrição:** Em `generated`: transição auditada `generated → editing` (estender `state-machine.ts` da 005 conforme RF-30) mantendo `document_json`; botão "Regenerar" na barra do preview.
  - **Arquivos envolvidos:** `apps/web/lib/actions/regenerate.ts`, `apps/web/lib/state-machine.ts`
  - **Critério de conclusão:** Ciclo editar→aprovar reabre normalmente.
  - **Dependências:** Nenhuma
  - **Estimativa:** Média

- [x] **T-005:** PDF versionado `final-v{n}.pdf`
  - **Descrição:** Worker: nova geração adiciona `final-v{n}.pdf` em `pdf_paths[]` e atualiza `document_hash`; download oferece a versão mais recente.
  - **Arquivos envolvidos:** `apps/worker/src/jobs/generatePdf.ts`
  - **Critério de conclusão:** `final-v2.pdf` criado com hash atualizado (CA-003).
  - **Dependências:** T-004
  - **Estimativa:** Média

### Fase 3: IA — flag AI_ENABLED (PRD T-26, T-27)

- [ ] **T-006:** Cliente Anthropic com auditoria `ai_call`
  - **Descrição:** `apps/worker/src/lib/anthropic.ts`: chamadas com timeout curto, retry limitado, registro `ai_call` (finalidade, duração) em TODA chamada; nunca planilha bruta nem foto original (RF-38); modelo via env.
  - **Arquivos envolvidos:** `apps/worker/src/lib/anthropic.ts`
  - **Critério de conclusão:** CA-006 verificável por teste com cliente mockado.
  - **Dependências:** Nenhuma
  - **Estimativa:** Média

- [ ] **T-007:** Job `ai_review` pós-extração
  - **Descrição:** Se `AI_ENABLED`: enviar dados extraídos + metadados do spec; respostas viram warnings origem `ai` exibidos na revisão (006 já renderiza); falha/timeout não bloqueia (RNF-06); resposta malformada descartada com warning auditado.
  - **Arquivos envolvidos:** `apps/worker/src/jobs/aiReview.ts`
  - **Critério de conclusão:** CA-004: off = fluxo idêntico; on = warnings na revisão.
  - **Dependências:** T-006
  - **Estimativa:** Grande

- [ ] **T-008:** Classificação de fotos por visão
  - **Descrição:** Pós-processamento do lote: classificar cada foto processada sugerindo `slot_id` + flags (`dark`, `blurry`, `possible_duplicate`); pré-alocar com `ai_suggested=true`; slot inexistente descartado.
  - **Arquivos envolvidos:** `apps/worker/src/jobs/processPhoto.ts` (encadeamento), job novo
  - **Critério de conclusão:** Pré-alocações corretas com fixture; flags persistidas.
  - **Dependências:** T-006
  - **Estimativa:** Grande

- [ ] **T-009:** Banner de sugestões na tela de fotos
  - **Descrição:** Ligar na tela 05 (007) o banner navy do protótipo ("N fotos pré-alocadas pela IA", "Confirmar todas"), badge "sugestão IA" e "Confirmar sugestão" por slot; confirmação zera `ai_suggested` e grava `confirmed_by`.
  - **Arquivos envolvidos:** `apps/web/components/photos/AiBanner.tsx`, `SlotList.tsx`, actions
  - **Critério de conclusão:** CA-005 verde em E2E com IA mockada.
  - **Dependências:** T-008
  - **Estimativa:** Média

### Fase 4: Hardening e deploy (PRD T-28)

- [ ] **T-010:** Rate limit e headers de segurança
  - **Descrição:** Rate limit nos endpoints de upload; headers (CSP, HSTS, X-Content-Type-Options etc.) via middleware/Caddy; 429 com mensagem pt-BR.
  - **Arquivos envolvidos:** `apps/web/middleware.ts`, `Caddyfile`
  - **Critério de conclusão:** Limites verificados por teste; headers presentes nas respostas.
  - **Dependências:** Nenhuma
  - **Estimativa:** Média

- [ ] **T-011:** Backup check e README de operação
  - **Descrição:** Verificação de backup (banco Supabase + estratégia de Storage), `docs/OPERACAO.md` com runbook (deploy, env, logs, restauração, rotação de tokens) e checklist de deploy.
  - **Arquivos envolvidos:** `docs/OPERACAO.md`
  - **Critério de conclusão:** Runbook revisado; checklist pronto para execução.
  - **Dependências:** T-010
  - **Estimativa:** Média

### Fase 5: Testes e Finalização

- [ ] **T-012:** Suites de integração do M4
  - **Descrição:** Purga (elegibilidade, idempotência, preservação), regeneração (v2, hash), IA on/off/timeout/malformada, bordas da spec §6.4.
  - **Arquivos envolvidos:** testes do worker e web
  - **Critério de conclusão:** CA-001, CA-003, CA-004, CA-006 verdes.
  - **Dependências:** T-001, T-005, T-007, T-008
  - **Estimativa:** Grande

- [!] **T-013:** Deploy no VPS + smoke test (fecha o projeto)
  - **Descrição:** Executar o checklist no VPS (compose up, TLS, env, RAM/CPU sob carga), rodar o E2E completo contra o ambiente (Definição de Pronto global do PRD §14).
  - **Arquivos envolvidos:** VPS, `docs/OPERACAO.md`
  - **Critério de conclusão:** CA-007: checklist concluído; E2E verde no VPS.
  - **Dependências:** T-011, T-012
  - **Estimativa:** Grande
  - **Observações:** 🔴 Bloqueada por acesso ao VPS (PRD §15, insumo interno).

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | ✅ Concluída | 2026-06-24 | Job + cron 03:00; elegibilidade testada (unit) |
| T-002  | ✅ Concluída | 2026-06-24 | Timeline do audit_log (`/reports/[id]/history`) |
| T-003  | ✅ Concluída | 2026-06-24 | Link de histórico por linha no dashboard |
| T-004  | ✅ Concluída | 2026-06-24 | generated→editing (state-machine + action regenerate); botão no preview |
| T-005  | ✅ Concluída | 2026-06-24 | final-v{n}.pdf acumulado em pdf_paths; download = última versão |
| T-006  | ⬜ Pendente | — | — |
| T-007  | ⬜ Pendente | — | — |
| T-008  | ⬜ Pendente | — | — |
| T-009  | ⬜ Pendente | — | — |
| T-010  | ⬜ Pendente | — | — |
| T-011  | ⬜ Pendente | — | — |
| T-012  | ⬜ Pendente | — | — |
| T-013  | 🔴 Bloqueada | — | Aguarda acesso ao VPS (PRD §15) |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
