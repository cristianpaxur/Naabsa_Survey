# Recuperação de Erros e Resiliência Operacional

> **ID:** 014
> **Status:** 🟡 Planejada
> **Prioridade:** 🔴 Crítica
> **Criada em:** 2026-07-02
> **Última atualização:** 2026-07-02
> **Autor:** Agente AI (análise crítica do fluxo aprovada pelo usuário)

---

## 1. Resumo Executivo

Fecha os becos sem saída do fluxo operacional: hoje, quando um job assíncrono falha em
definitivo (PDF, preview, montagem do working.docx), o relatório fica preso num status sem
nenhuma ação de recuperação na UI, e o operador não vê o motivo. Esta implementação adiciona
dead-letter com auditoria no worker, botão de re-tentativa em `approved`, descarte de
relatórios em `draft`/`extracted` e reenvio de planilha sem criar relatório novo.

## 2. Contexto e Motivação

### 2.1 Problema Atual

Quatro becos sem saída confirmados no código (análise de 2026-07-02):

1. **`generate_pdf` esgota retries (2×)** → job sai da fila sem registro; relatório fica em
   `approved` para sempre. `approve()` exige `editing` e `regenerate()` exige `generated` —
   a mensagem "Tente novamente" da UI sugere uma ação que não existe
   (`apps/web/lib/actions/editor.ts`).
2. **`build_working_docx` falha em definitivo** → o `CollaboraEditor` faz polling cego por
   até 2 min e mostra "Tentar de novo" sem saber se o worker está vivo; nenhum motivo é
   gravado (`apps/web/components/editor/CollaboraEditor.tsx`).
3. **Extração falha ou dados errados descobertos tarde** → não há como descartar o
   relatório nem reenviar a planilha; o operador cria outro relatório e o dashboard acumula
   zumbis em `draft` (a máquina de estados até permite `→ draft`, mas nenhuma tela expõe).
4. **`preview_pdf` com `retryLimit: 1`** → uma falha transitória (rede/storage) e o preview
   nunca aparece (`apps/worker/src/jobs/previewPdf.ts`).

### 2.2 Impacto do Problema

Operadores (1–3, 30–50 relatórios/mês) ficam bloqueados sem autoatendimento: cada ocorrência
vira intervenção manual de desenvolvedor no banco. Cliente final espera um PDF que "está
gerando" indefinidamente. Dashboard sujo com rascunhos abandonados aumenta risco de operar
o relatório errado.

### 2.3 Soluções Consideradas

| Solução | Prós | Contras | Decisão |
|---------|------|---------|---------|
| Dead-letter + auditoria + ações de recuperação na UI (esta spec) | Autoatendimento; reusa `audit_log` e máquina de estados existentes | Toca worker e web | ✅ Escolhida |
| Status novo `error` na máquina de estados | Estado explícito | Muda PRD §3.2, migração de enum, RLS e badges; para 30–50 rel/mês é peso demais | ❌ Descartada |
| Monitoramento externo (alertas por e-mail) | Visibilidade | Não desbloqueia o operador; infra extra antes do deploy | ❌ Descartada (pós-deploy) |
| Fallback de renderer sem LibreOffice | Resiliência | Segundo motor de PDF = a divergência que a 012 eliminou | ❌ Descartada (fora de escopo) |

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura

Sem componentes novos. Três mecanismos sobre a arquitetura existente:

```
worker (pg-boss, includeMetadata) ──última tentativa falhou──▶ audit_log (action *_failed)
web (actions/polling) ──lê o *_failed mais recente pós-enfileiramento──▶ UI mostra erro + ação
UI: "Tentar gerar novamente" (approved) · "Descartar" (draft/extracted) · "Enviar nova planilha" (extracted/in_review)
```

O padrão de dead-letter já existe no worker para `process_photo`
(`job.retryCount >= job.retryLimit` → `markPhotoError`); esta spec replica-o para os jobs de
documento, gravando no `audit_log` (que a web já lê).

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|-----------|------|------|-----------|
| `apps/worker/src/index.ts` | Arquivo | Modificar | Dead-letter nos handlers `generate_pdf`, `preview_pdf`, `build_working_docx` (última tentativa → auditar) |
| `apps/worker/src/lib/deadLetter.ts` | Arquivo | Criar | Helper `auditJobFailure(queue, reportId, err)` → insere `*_failed` no `audit_log` |
| `apps/worker/src/jobs/previewPdf.ts` | Arquivo | Modificar | `PREVIEW_PDF_RETRY_LIMIT: 1 → 2` |
| `apps/web/lib/actions/editor.ts` | Arquivo | Modificar | `getPdfStatus` detecta `pdf_generation_failed` pós-`pdf_enqueued`; nova action `retryGeneratePdf` |
| `apps/web/lib/actions/reports.ts` | Arquivo | Modificar | Actions `deleteReport` e `resetToDraft` |
| `apps/web/components/editor/PreviewPanel.tsx` | Arquivo | Modificar | Estado de falha em `approved`: mensagem + botão "Tentar gerar novamente" |
| `apps/web/components/editor/CollaboraEditor.tsx` | Arquivo | Modificar | Polling do build distingue `working_docx_failed` (erro real) de `pending` |
| `apps/web/app/(app)/dashboard/page.tsx` (+ componente de linha) | Arquivo | Modificar | Botão "Descartar" em `draft`/`extracted` com confirmação |
| `apps/web/app/(app)/reports/[id]/review/page.tsx` | Arquivo | Modificar | Botão "Enviar nova planilha"; em `draft`, render do passo de upload |
| `apps/web/components/wizard/UploadStep.tsx` | Arquivo | Modificar | Reutilizável para relatório existente (modo reenvio) |

### 3.3 Interfaces e Contratos

#### Entradas
- `retryGeneratePdf(reportId)` — exige `status === 'approved'`.
- `deleteReport(reportId)` — exige `status ∈ {draft, extracted}` e confirmação na UI.
- `resetToDraft(reportId)` — exige `status ∈ {extracted, in_review}` (grafo já permite).
- Worker: payload dos jobs inalterado.

#### Saídas
- `retryGeneratePdf` → `{ ok: true } | { error }`; re-enfileira `generate_pdf` e audita `pdf_enqueued`.
- `deleteReport` → `{ ok: true } | { error }`; remove Storage `reports/{id}/**`, `report_photos`, `audit_log`, `reports`.
- `resetToDraft` → `{ ok: true } | { error }`; transição auditada `→ draft`, limpa `operator_overrides`, `working_docx_path` e artefatos derivados do Storage (`working.docx`, `preview.pdf`, `sheets/*`). Fotos permanecem.
- `getPdfStatus` → passa a incluir `{ failed: boolean, failReason?: string }`.

#### Contratos de API (se aplicável)
N/A — apenas Server Actions e handlers de fila existentes; nenhuma rota HTTP nova.

### 3.4 Modelos de Dados (se aplicável)

Nenhuma migração. Novas actions no `audit_log` (colunas existentes):
`pdf_generation_failed`, `preview_failed`, `working_docx_failed`, `report_reset`.
Payload: `{ message, jobId?, queue }`.

### 3.5 Fluxo de Execução

1. **Falha definitiva de job:** handler detecta `retryCount >= retryLimit` → `auditJobFailure`
   grava `*_failed` → NÃO relança (job sai da fila com registro).
2. **UI em `approved`:** polling do `getPdfStatus` encontra `pdf_generation_failed` mais
   recente que o último `pdf_enqueued` → badge de erro + "Tentar gerar novamente" →
   `retryGeneratePdf` re-enfileira e audita → polling volta ao normal.
3. **UI no editor:** polling do build (`getEditorUrl`) consulta `working_docx_failed` pós-
   `working_docx_enqueued` → erro com motivo + "Tentar de novo" (re-enfileira o build).
4. **Descartar:** dashboard (linha em `draft`/`extracted`) → confirmação → `deleteReport` →
   some da lista.
5. **Reenviar planilha:** revisão → "Enviar nova planilha" → confirmação → `resetToDraft` →
   tela de upload (mesmo `POST /api/reports/[id]/spreadsheet`, que já exige `draft`) → nova
   extração segue o fluxo normal.

### 3.6 Tratamento de Erros

- Falha ao auditar dead-letter: log no console do worker (não mascara o erro original).
- `retryGeneratePdf`/`resetToDraft`/`deleteReport` com status errado: erro pt-BR explicando
  o estado atual (guarda otimista, como as demais actions).
- `deleteReport` com falha parcial no Storage: prossegue com a remoção das linhas (blobs
  órfãos são varridos pela retenção — 010) e reporta `ok`.

## 4. Requisitos

### 4.1 Requisitos Funcionais

- **RF-001:** Falha definitiva de `generate_pdf`, `preview_pdf` ou `build_working_docx` grava ação `*_failed` no `audit_log` com a mensagem do erro.
- **RF-002:** Em `approved` sem PDF, a UI exibe o motivo da falha e um botão "Tentar gerar novamente" que re-enfileira `generate_pdf` (auditado).
- **RF-003:** O polling do editor distingue "build em andamento" de "build falhou", exibindo o motivo e permitindo re-enfileirar.
- **RF-004:** Operador pode descartar relatório em `draft`/`extracted` com confirmação; Storage e linhas relacionadas são removidos.
- **RF-005:** Operador pode reenviar a planilha a partir de `extracted`/`in_review`: transição auditada para `draft`, limpeza de `operator_overrides` e artefatos derivados, e novo upload no MESMO relatório.
- **RF-006:** `preview_pdf` tolera 2 falhas transitórias (`retryLimit: 2`).

### 4.2 Requisitos Não-Funcionais

- **RNF-001:** Mensagens de UI e auditoria em pt-BR (convenção do projeto).
- **RNF-002:** Nenhuma migração de schema; usar `audit_log` e colunas existentes.
- **RNF-003:** Ações destrutivas (descartar, reenviar) exigem confirmação explícita na UI e são auditadas (exceto delete, que remove o próprio trail — ver §9).

### 4.3 Restrições e Limitações

- Fora de escopo (decisão do usuário): fallback de renderer, paginação do dashboard,
  health-check do Collabora, alertas externos.
- `deleteReport` limitado a `draft`/`extracted` — relatórios que já passaram por revisão
  têm valor de auditoria e seguem o ciclo normal (retenção da 010).

## 5. Critérios de Aceitação

- [ ] **CA-001:** Forçando falha definitiva de `generate_pdf`, o `audit_log` recebe `pdf_generation_failed` e a UI em `approved` mostra erro + botão; clicar re-enfileira e o PDF sai na retentativa.
- [ ] **CA-002:** Com o worker parado, a entrada no editor mostra estado de espera; com `working_docx_failed` auditado, mostra o motivo e o botão re-enfileira.
- [ ] **CA-003:** "Descartar" em `draft`/`extracted` (com confirmação) remove o relatório da lista, do banco e do Storage.
- [ ] **CA-004:** "Enviar nova planilha" em `extracted`/`in_review` volta a `draft` (auditado), limpa overrides/artefatos e aceita novo upload no mesmo relatório; a nova extração substitui os dados.
- [ ] **CA-005:** `preview_pdf` com `retryLimit: 2`; falha única transitória não mata o preview.
- [ ] **CA-006:** `pnpm lint` e `pnpm test` verdes.

## 6. Plano de Testes

### 6.1 Testes Unitários
- `deadLetter.auditJobFailure` insere a action correta por fila.
- Lógica pura de detecção de falha (`pdf_generation_failed` pós-`pdf_enqueued` → `failed`).
- `resetToDraft`/`deleteReport`: guardas de status (transições inválidas rejeitadas).

### 6.2 Testes de Integração
- Handler de fila com job na última tentativa → audita e não relança (mock pg-boss job com `retryCount/retryLimit`).

### 6.3 Testes de Aceitação
- CA-001..CA-004 verificados manualmente contra a stack local (worker + Supabase); CA-005/CA-006 por inspeção e CI local.

### 6.4 Casos de Borda (Edge Cases)
- Retentativa clicada duas vezes (dedup por guarda de status + o job é idempotente).
- `resetToDraft` com `working.docx` inexistente (remoção tolerante a 404).
- `deleteReport` com Storage parcialmente removido (prossegue; ver §3.6).
- Falha de `preview_pdf` NÃO bloqueia aprovação (preview é acessório).

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Detecção por `audit_log` dá falso "failed" (ordem de eventos) | Baixa | Médio | Comparar timestamps `*_failed` × último `*_enqueued`; retentativa audita novo `pdf_enqueued` que "limpa" o estado |
| Delete remover relatório errado | Baixa | Alto | Confirmação com nome do navio + restrição a `draft`/`extracted` |
| Reenvio deixar artefato velho (sheets/working.docx) no PDF novo | Média | Alto | `resetToDraft` remove artefatos derivados; upload re-enfileira `render_sheets`; build do docx é refeito ao entrar em `editing` |

## 8. Dependências

### 8.1 Dependências Internas
- 012 (editor Collabora — fluxo de aprovação/working.docx) — concluída (T-010 pendente de execução).
- 010 (auditoria/histórico) — concluída.

### 8.2 Dependências Externas
Nenhuma nova (pg-boss, Supabase já em uso).

## 9. Observações e Decisões de Design

- **Sem status `error` novo:** o relatório permanece no status corrente e o erro vive no
  `audit_log` — evita migração e mantém o PRD §3.2 intacto.
- **`deleteReport` apaga também o `audit_log` do relatório:** um rascunho descartado nunca
  produziu documento; manter trail órfão não tem valor e complica FK. Registrado aqui como
  decisão consciente.
- **`resetToDraft` limpa `operator_overrides`:** overrides referem-se à extração anterior;
  mantê-los sobre dados novos é risco silencioso de relatório errado (pior que redigitar).
- **Fotos sobrevivem ao reenvio:** são independentes da planilha; realocação continua válida.

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
