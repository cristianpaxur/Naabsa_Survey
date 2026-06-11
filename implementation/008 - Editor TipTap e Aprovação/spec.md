# Editor TipTap e Aprovação

> **ID:** 008
> **Status:** 🟡 Planejada
> **Prioridade:** 🟠 Alta
> **Criada em:** 2026-06-11
> **Última atualização:** 2026-06-11
> **Autor:** Agente AI

---

## 1. Resumo Executivo

Implementar o editor TipTap (modo pageless) com os nós custom travados (`photoFrame`,
`dataTable`), a mark `dataField`, autosave com snapshots auditados, e fechar o ciclo do
operador: montagem do documento ao entrar em `editing` (RF-20), preview paginado integrado,
aprovação que enfileira o PDF, polling de status e download por URL assinada. Conclui o
fluxo feliz E2E de ponta a ponta (aceite do M2).

## 2. Contexto e Motivação

### 2.1 Problema Atual
Dados revisados (006) e fotos alocadas (007) existem, e a cadeia print→PDF (004) funciona
por dentro — mas o operador não tem onde fazer os ajustes finais do texto nem comandar a
geração e o download do PDF.

### 2.2 Impacto do Problema
Este é o elo final do fluxo do operador. Sem nodes travados, o operador poderia quebrar o
layout (violando o princípio nº 4); sem autosave/snapshots, trabalho perdido e auditoria
incompleta; sem preview pela MESMA rota do worker, o princípio nº 5 (preview = PDF) cai.

### 2.3 Soluções Consideradas

| Solução | Prós | Contras | Decisão |
|---------|------|---------|---------|
| TipTap OSS + custom nodes atom + `filterTransaction` (PRD) | Travamento real no nível de transação | Exige cuidado com edge cases do ProseMirror | ✅ Escolhida |
| Extensões pagas @tiptap-pro | Menos código | Proibido pelo PRD §2 | ❌ Descartada |
| Editor caseiro contentEditable | Controle total | Reinventar ProseMirror; risco altíssimo | ❌ Descartada |

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura
Editor client-side TipTap (StarterKit, Table, TextAlign, Underline + extensões custom)
operando sobre `reports.document_json`. Na primeira entrada em `editing`, o documento é
montado pelo builder da 004 (dados efetivos + fotos confirmadas) e persistido. Autosave
debounce 2 s; snapshots no `audit_log` por transição de status e a cada ≤ 5 min de edição.
Preview = iframe/painel da rota `/reports/[id]/print` (a mesma do worker). Aprovar →
`approved` → enfileira `generate_pdf` → UI faz polling → `generated` → botão de download
(URL assinada). Regenerar (RF-30) entra na 010.

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|-----------|------|------|-----------|
| `apps/web/components/editor/Editor.tsx` | Arquivo | Criar | Tela 06 — canvas pageless + toolbar |
| `apps/web/components/editor/nodes/photoFrame.ts` | Arquivo | Criar | Node atom travado (PRD §9) |
| `apps/web/components/editor/nodes/dataTable.ts` | Arquivo | Criar | Node atom não editável |
| `apps/web/components/editor/marks/dataField.ts` | Arquivo | Criar | Mark com highlight no hover |
| `apps/web/components/editor/lockGuard.ts` | Arquivo | Criar | `filterTransaction` barrando edição/deleção dos nós travados |
| `apps/web/components/editor/Toolbar.tsx` | Arquivo | Criar | Parágrafo/headings, B/I/U, alinhamento, listas, tabela, undo/redo, localizar |
| `apps/web/lib/actions/editor.ts` | Arquivo | Criar | `saveDocument` (autosave), `snapshot`, `approve` |
| `apps/web/app/(app)/reports/[id]/edit/page.tsx` | Arquivo | Criar | Página: montagem RF-20 + editor + indicador de autosave |
| `apps/web/components/editor/PreviewPanel.tsx` | Arquivo | Criar | Tela 07 (UI) — iframe de `/print`, status do PDF, download |
| `tests/e2e/full-flow.spec.ts` | Arquivo | Criar | E2E do fluxo feliz completo (aceite do PRD T-18) |

### 3.3 Interfaces e Contratos

#### Entradas
- `document_json` (montado pelo builder da 004 na primeira entrada).
- Edições do operador (transações ProseMirror filtradas).

#### Saídas
- `reports.document_json` autosalvo (debounce 2 s).
- Snapshots no `audit_log` (transição de status; ≤ 5 min de edição contínua).
- Aprovação: transição `editing → approved` + job `generate_pdf` enfileirado.
- Download: URL assinada do `final.pdf` quando `generated`.

#### Contratos de API (se aplicável)
Server Actions: `saveDocument(reportId, json)` (valida status `editing`),
`approve(reportId)` (valida gates), `getPdfStatus(reportId)` (polling) e
`getDownloadUrl(reportId)` (URL assinada ≤ 10 min).

### 3.4 Modelos de Dados (se aplicável)
Sem mudança de schema. Extensões TipTap conforme PRD §9: `photoFrame` atom
`selectable:false, draggable:false`; `dataTable` atom; mark `dataField {field}`.
Snapshot = cópia do `document_json` no payload do audit_log.

### 3.5 Fluxo de Execução
1. Entrada em `/edit` com fotos completas: se `document_json` nulo → montar via builder (RF-20) e persistir; transição para `editing` auditada.
2. Editor pageless com toolbar; valores da planilha destacados (mark `dataField`, highlight no hover).
3. Tentativas de editar/deletar `photoFrame`/`dataTable` são canceladas por `filterTransaction` (doc inalterado).
4. Autosave: debounce 2 s; indicador "Salvo · há Xs" (como no protótipo); snapshot a cada ≤ 5 min.
5. Preview abre painel/iframe da rota `/print` real.
6. "Aprovar e gerar PDF" → snapshot → `approved` → job enfileirado → UI navega ao preview com badge "Gerando PDF…" (polling).
7. `generated`: badge "PDF pronto"; botão "Baixar PDF" com URL assinada.

### 3.6 Tratamento de Erros
- Autosave falho (rede): retry com backoff; indicador muda para estado de erro; edição local preservada.
- Aprovação com estado divergente (outro usuário regenerou/alterou): action revalida status e rejeita com mensagem.
- Falha na geração do PDF (worker): polling expõe erro; relatório permanece `approved`; opção de re-enfileirar.
- `document_json` corrompido/não conformante: editor não monta; erro auditado; rollback ao último snapshot oferecido.

## 4. Requisitos

### 4.1 Requisitos Funcionais
Derivados do PRD (tarefas T-17, T-18):

- **RF-001 (PRD RF-20):** Montagem do documento na primeira entrada em `editing` (builder da 004 + dados efetivos + fotos confirmadas).
- **RF-002 (PRD RF-21):** Editor pageless com toolbar: parágrafo/headings, bold/italic/underline, alinhamento, listas, tabela simples, undo/redo, localizar.
- **RF-003 (PRD RF-22):** `photoFrame` e `dataTable` travados; edição/deleção barrada por `filterTransaction`.
- **RF-004 (PRD RF-23):** Mark `dataField` nos valores da planilha; highlight sutil no hover.
- **RF-005 (PRD RF-24):** Autosave debounce 2 s; snapshot por transição de status e ≤ 5 min de edição contínua.
- **RF-006 (PRD RF-25):** Preview abre a rota `/reports/[id]/print` (a mesma do worker) em painel/iframe.
- **RF-007 (PRD RF-26):** "Aprovar e gerar PDF" transiciona para `approved` e enfileira `generate_pdf`.
- **RF-008 (PRD RF-29):** Polling de status; em `generated`, download por URL assinada.

### 4.2 Requisitos Não-Funcionais
- **RNF-001 (PRD RNF-02):** Preview e PDF pela mesma rota — nenhuma duplicação de render.
- **RNF-002 (PRD RNF-05):** Download só por URL assinada (≤ 10 min).
- **RNF-003 (PRD RNF-07):** Snapshots garantem reconstituição do que foi editado e quando.
- **RNF-004 (PRD RNF-09):** Toolbar e mensagens em pt-BR.

### 4.3 Restrições e Limitações
- Somente extensões TipTap OSS (StarterKit, Table, TextAlign, Underline) + custom próprias.
- Regenerar PDF versionado (RF-30) NÃO é escopo aqui — implementação 010.
- Edição colaborativa simultânea é não-objetivo (PRD §1); lock otimista simples.

## 5. Critérios de Aceitação

- [ ] **CA-001:** Tentar deletar/editar `photoFrame` e `dataTable` não altera o documento (aceite do PRD T-17).
- [ ] **CA-002:** Autosave persiste após 2 s de inatividade; recarregar a página recupera o texto (aceite do PRD T-17).
- [ ] **CA-003:** Snapshots gravados no audit_log na transição e a cada ≤ 5 min de edição contínua.
- [ ] **CA-004:** Preview exibe exatamente o render da rota `/print` (mesma URL carregada).
- [ ] **CA-005:** Aprovar → status `approved` → job na fila → polling → `generated` → download baixa o PDF.
- [ ] **CA-006:** E2E do fluxo feliz completo: criar → upload → revisar → fotos → editar → aprovar → baixar PDF (aceite do PRD T-18 / M2).
- [ ] **CA-007:** Valores com mark `dataField` destacam no hover e seguem editáveis como texto (sem efeito de edição).

## 6. Plano de Testes

### 6.1 Testes Unitários
`lockGuard` (transações sintéticas: delete, replace, edição interna dos atoms → todas barradas);
debounce do autosave; agendador de snapshots.

### 6.2 Testes de Integração
Montagem RF-20 (builder + dados efetivos + fotos reais de fixture → doc válido persistido);
`approve` enfileirando job real; polling refletindo transições.

### 6.3 Testes de Aceitação
E2E full-flow (CA-006) contra Supabase local com worker rodando — o teste mais importante do M2.

### 6.4 Casos de Borda (Edge Cases)
- Select-all + delete (nós travados sobrevivem; texto livre some).
- Undo até antes da montagem (não pode des-montar o documento inicial).
- Colar conteúdo com HTML rico externo (sanitizado para o schema permitido).
- Entrar em `/edit` com `document_json` já existente (NÃO remontar — RF-20 é só primeira vez).
- Sessão expira durante edição (autosave falha → retry pós-relogin sem perda local).
- Duas abas editando o mesmo relatório (última escrita vence; snapshot preserva ambas as versões na auditoria).

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| `filterTransaction` com brechas (paste, undo, IME) | Média | Alto | Suite dedicada de transações adversariais (CA-001 ampliado §6.4) |
| Divergência editor ↔ print por extensões fora do schema | Média | Alto | Schema fechado; sanitização no paste; golden test (004) pega regressões |
| Polling agressivo sobrecarregando o app | Baixa | Baixo | Intervalo 2–3 s com backoff; para ao sair da tela |
| Autosave conflitando com aprovação simultânea | Baixa | Médio | `approve` revalida status; `saveDocument` rejeita fora de `editing` |

## 8. Dependências

### 8.1 Dependências Internas
**004** (builder, rota `/print`, worker generate_pdf), **006** (dados efetivos confirmados),
**007** (fotos alocadas/cropadas — gate de entrada no editor).

### 8.2 Dependências Externas
TipTap OSS (@tiptap/react, starter-kit, extension-table, extension-text-align,
extension-underline). Nenhum insumo do cliente bloqueia (conteúdo provisório da 004 serve).

## 9. Observações e Decisões de Design

- **Telas de design vinculadas** (`design/naabsa-survey/project/Naabsa Protótipo.dc.html`):
  - **06 Editor** (`isEditor`): header com título do relatório + "spec v3" mono, pill verde
    "Salvo · há 2 s", botões Preview (outline) e "Aprovar e gerar PDF" (navy); toolbar
    (Parágrafo ▾, B/I/U, listas, tabela, Localizar…); canvas papel 680 px sobre fundo
    `#EFECE6`; dataFields com fundo azul claro e sublinhado; `dataTable` com pill navy
    "dataTable · travado" e cabeçalho azul; `photoFrame` com outline tracejado, pill
    "photoFrame" e legenda mono `draft_fwd · 4:3 · cover`.
  - **07 Preview/PDF** (`isPreview`): barra navy com "Preview paginado", badge "Gerando PDF…"
    (spinner) → "PDF pronto · idêntico ao preview" (verde), botões Regenerar (010) e
    "Baixar PDF" (desabilitado até pronto); páginas A4 com sombra sobre fundo `#D9D5CD`.
  - Board estático `Naabsa Relatórios.dc.html`, telas 06–07.
- Os badges visuais "travado" sobre os nós (como no protótipo) são afford­ance de UI —
  o travamento real é o `filterTransaction`.
- O E2E full-flow (CA-006) fecha o milestone M2 do PRD e é pré-requisito do início da 009.

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
