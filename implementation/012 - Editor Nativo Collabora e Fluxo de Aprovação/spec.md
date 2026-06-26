# Editor Nativo Collabora e Fluxo de Aprovação

> **ID:** 012
> **Status:** 🟡 Planejada
> **Prioridade:** 🔴 Crítica
> **Criada em:** 2026-06-26
> **Última atualização:** 2026-06-26
> **Autor:** Agente AI

---

## 1. Resumo Executivo

Substituir o editor TipTap (008) pelo **Collabora embutido** (011). Na primeira entrada em
`editing`, o worker monta o `working.docx` a partir dos dados (reusando o `buildDocx` da 004); o
operador edita **nativamente no LibreOffice do browser**; e a **pré-visualização e a aprovação
convertem o `working.docx` EDITADO** em PDF via LibreOffice — em vez de reconstruir o documento dos
dados. Fecha o ciclo do operador com **fidelidade exata** (preview = PDF = o que foi editado).

## 2. Contexto e Motivação

### 2.1 Problema Atual
Com a 011, o Collabora já consegue abrir/salvar um `working.docx`, mas o app ainda: (a) monta um
`document_json` TipTap na entrada em `editing` ([`edit/page.tsx`](../../apps/web/app/(app)/reports/[id]/edit/page.tsx));
(b) renderiza o editor TipTap; e (c) **reconstrói o `.docx` dos dados** a cada geração
([`renderReportPdf`](../../apps/worker/src/jobs/generatePdf.ts)), o que **descartaria** qualquer
edição manual. É preciso reconectar a cadeia em torno do `working.docx`.

### 2.2 Impacto do Problema
Sem esta implementação, o Collabora (011) fica órfão e a edição do operador continua não chegando
ao PDF. Esta é a implementação que **entrega o valor** ao operador e ao cliente.

### 2.3 Soluções Consideradas

| Solução | Prós | Contras | Decisão |
|---------|------|---------|---------|
| Collabora embutido + PDF a partir do `working.docx` editado | Fidelidade exata; edição nativa; reusa LibreOffice da 004 | Perde a trava de layout; `.docx` vira fonte da verdade | ✅ Escolhida |
| Manter TipTap como editor e Collabora só "preview" | Menos mudança | Mantém a divergência e o `document_json` órfão | ❌ Descartada |
| Reconstruir o `.docx` dos dados na aprovação (como hoje) | Mantém integridade dos dados | **Descarta** as edições manuais do operador | ❌ Descartada |

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura

```
 entrada em `editing`
        │  (working.docx ainda não existe?)
        ▼
  [worker] build_working_docx ── buildDocx(dados+fotos+sheets) ──▶ Storage: working.docx
        │
        ▼
  /reports/[id]/edit  ──▶  <CollaboraEditor> (iframe WOPI da 011)
        │  (operador edita; autosave WOPI PutFile → working.docx)
        ├─▶ "Preview"  ─▶ [worker] preview_pdf ─ convert(working.docx) ─▶ preview.pdf
        └─▶ "Aprovar"  ─▶ editing→approved ─▶ [worker] generate_pdf
                                         convert(working.docx) ─▶ final-v{n}.pdf + final.docx ─▶ generated
```

Mudança central: `generate_pdf`/`preview_pdf` deixam de **reconstruir** o `.docx` e passam a
**converter o `working.docx`** (o que o operador editou).

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|-----------|------|------|-----------|
| `apps/worker/src/jobs/buildWorkingDocx.ts` | Arquivo | Criar | Job `build_working_docx`: monta o `working.docx` (extrai o "1º passe" do `renderReportPdf`) e sobe ao Storage |
| `apps/worker/src/jobs/generatePdf.ts` | Arquivo | Modificar | Aprovação **converte `working.docx`** (não reconstrói); mantém versionamento e hash |
| `apps/worker/src/jobs/previewPdf.ts` | Arquivo | Modificar | Preview converte o `working.docx` atual |
| `apps/worker/src/index.ts` | Arquivo | Modificar | Registrar a fila `build_working_docx` (concorrência 1 — LibreOffice/sheets) |
| `apps/web/lib/queue.ts` | Arquivo | Modificar | `enqueueBuildWorkingDocx({reportId})` |
| `apps/web/app/(app)/reports/[id]/edit/page.tsx` | Arquivo | Modificar | Entrada: enfileira/aguarda `working.docx`; renderiza `<CollaboraEditor>` em vez do TipTap |
| `apps/web/components/editor/CollaboraEditor.tsx` | Arquivo | Criar | Monta o iframe (discovery+WOPISrc+token), barra de ações (Preview/Aprovar), estados |
| `apps/web/lib/actions/editor.ts` | Arquivo | Modificar | `approve` não passa mais `document_json`; preview aponta para `working.docx`; snapshots por cópia do `working.docx` |
| `apps/web/components/editor/EditorClient.tsx` (+ nodes/marks TipTap) | Arquivo | Deprecar | Removidos do fluxo de `/edit` (mantidos no repo até a limpeza final) |

### 3.3 Interfaces e Contratos

#### Entradas
- Relatório em `editing` (gate da 007: fotos completas) com dados efetivos e fotos confirmadas.
- Edições do operador no Collabora (persistidas via WOPI PutFile no `working.docx`).

#### Saídas
- `reports.working_docx_path` populado; `working.docx` no Storage.
- Aprovação: `editing → approved`, job `generate_pdf`, `final-v{n}.pdf` + `final.docx`, `generated`.
- Snapshots de auditoria: cópia do `working.docx` no Storage (`{id}/snapshots/...`) por transição.

#### Contratos de API
Server Actions (ajustadas): `getEditorUrl(reportId)` (discovery+token → URL do iframe),
`approve(reportId)` (gates + transição + enfileira), `generatePreview(reportId)`,
`getPreviewUrl`/`getPdfStatus`/`getDownloadUrl` (inalteradas em assinatura).

### 3.4 Modelos de Dados
Sem novas colunas (as da 011 bastam). `working.docx` é a fonte de verdade do documento a partir da
montagem. `document_json` deixa de ser lido/escrito (legado).

### 3.5 Fluxo de Execução
1. Entrada em `/edit` (status `editing`): se `working_docx_path` nulo → `enqueueBuildWorkingDocx` → a UI aguarda (polling) o `working.docx`.
2. `<CollaboraEditor>` carrega o iframe WOPI (011) com `canWrite=true`.
3. Operador edita; Collabora autossalva no `working.docx` (PutFile).
4. **Preview:** `generatePreview` → `preview_pdf` converte o `working.docx` → `preview.pdf` (idêntico ao download).
5. **Aprovar:** snapshot do `working.docx` → `editing → approved` → `generate_pdf` converte o `working.docx` → `final-v{n}.pdf` (+ `final.docx`) → `generated`.
6. **Regenerar** (`generated → editing`, RF-30): reabre o `working.docx` existente no Collabora (não remonta).
7. `approved`/`generated`: editor em modo leitura (iframe `canWrite=false`) + download por URL assinada.

### 3.6 Tratamento de Erros
- `build_working_docx` falha → `editing` preservado; UI mostra erro e botão de re-tentar.
- Conversão na aprovação falha (LibreOffice) → permanece `approved`; re-enfileirar (como hoje).
- TOC/numeração desatualizada após edição → atualizar índices/campos na conversão (ver Riscos).
- Operador apaga `photoFrame`/tabela no Word → documento sai como editado (sem trava — decisão de produto); mitigação opcional por proteção de seção (fora de escopo inicial).

## 4. Requisitos

### 4.1 Requisitos Funcionais
- **RF-001 (subst. PRD RF-20):** Na 1ª entrada em `editing`, montar o `working.docx` (builder da 004 + dados + fotos) e persistir.
- **RF-002:** Embutir o editor Collabora (iframe WOPI) em `/reports/[id]/edit`, editável em `editing`.
- **RF-003:** Autosave do operador persistido no `working.docx` (via WOPI da 011).
- **RF-004 (subst. RF-25):** Preview converte o `working.docx` atual → `preview.pdf` (idêntico ao final).
- **RF-005 (subst. RF-26):** "Aprovar" transiciona `editing → approved` e enfileira `generate_pdf` que **converte o `working.docx`**.
- **RF-006:** `generated`/`approved` abrem o editor em leitura; download por URL assinada (mantém 008/RF-29).
- **RF-007 (RF-30):** Regeneração reabre o `working.docx` (não remonta dos dados).
- **RF-008:** Snapshots de auditoria do `working.docx` por transição de status (RNF-07).

### 4.2 Requisitos Não-Funcionais
- **RNF-001:** **Preview = PDF = documento editado** — mesmo motor (LibreOffice), sem duplicação de render.
- **RNF-002:** Carregamento do editor Collabora em poucos segundos; build do `working.docx` concorrência 1.
- **RNF-003:** Chrome do app (botões, badges, mensagens) em pt-BR; auditoria preservada (RNF-07).
- **RNF-004:** Download só por URL assinada ≤ 10 min (RNF-05).

### 4.3 Restrições e Limitações
- O operador **pode editar livremente** o documento (perde a trava de layout do TipTap) — **decisão de produto aceita**.
- O `working.docx` é a **fonte da verdade** após a montagem: regenerar do zero é ação **explícita** (descarta edições), não automática.
- `document_json` não é mais usado; permanece como coluna legada (drop em limpeza futura).

## 5. Critérios de Aceitação

- [ ] **CA-001:** Entrar em `editing` (1ª vez) monta o `working.docx` e o abre no Collabora dentro do app.
- [ ] **CA-002:** Editar um texto no Collabora, recarregar a página e a edição **persiste** (autosave WOPI).
- [ ] **CA-003:** "Preview" mostra um PDF **idêntico** ao que será baixado (mesmo `working.docx`).
- [ ] **CA-004:** Uma **edição manual** feita no Collabora **aparece no PDF final** gerado na aprovação (prova de que o PDF vem do docx editado, não dos dados).
- [ ] **CA-005:** Aprovar → `approved` → `generate_pdf` → `generated` → download baixa o PDF correto e versionado.
- [ ] **CA-006:** Regenerar (`generated → editing`) reabre o **mesmo** `working.docx` (mantém as edições).
- [ ] **CA-007:** E2E do fluxo feliz: criar → upload → revisar → fotos → **editar no Collabora** → aprovar → baixar PDF.

## 6. Plano de Testes

### 6.1 Testes Unitários
`buildWorkingDocx` (monta e sobe o docx); `generatePdf` convertendo o `working.docx` (não chama o
builder); `previewPdf` idem; ajuste das actions (`approve` sem `document_json`).

### 6.2 Testes de Integração
Entrada em `editing` → `working.docx` no Storage; aprovação reflete uma edição injetada no
`working.docx` no PDF (CA-004); regeneração reabre o mesmo arquivo.

### 6.3 Testes de Aceitação
E2E (CA-007) contra Supabase + worker + Collabora locais — substitui o `full-flow` da 008 na parte do editor.

### 6.4 Casos de Borda (Edge Cases)
- Entrar em `/edit` com `working.docx` já existente (NÃO remontar).
- Sumário (TOC) após edição que muda a paginação — números recalculados na conversão.
- Operador remove uma foto/tabela no Word — PDF reflete a remoção (sem trava).
- Duas abas editando — o lock WOPI (011) serializa; a 2ª entra em leitura/avisada.
- Aprovar sem nenhuma edição (working.docx = rascunho) — PDF idêntico ao rascunho.

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| TOC/numeração não atualiza ao converter o docx editado | Média | Alto | Atualizar índices/campos no LibreOffice na conversão (macro `ConvertDoc` + update de índices); teste de paginação |
| Edição manual quebra placeholders (foto/sheet) | Média | Médio | Documento sai como editado; orientar operador; (futuro) proteção de seções |
| `working.docx` diverge dos dados após regeneração | Média | Médio | Regenerar do zero é ação explícita e avisada; default reabre o docx existente |
| Migração de fluxo deixa caminhos TipTap mortos | Baixa | Baixo | Deprecar `EditorClient`/nodes no `/edit`; remover em limpeza dedicada |
| Perda de trabalho se autosave WOPI falhar | Baixa | Alto | Collabora mantém cópia local; lock + RefreshLock (011); snapshots por transição |

## 8. Dependências

### 8.1 Dependências Internas
**011** (Collabora + WOPI host — pré-requisito direto), **004** (`buildDocx`, `convertDocxToPdf`,
`measureBookmarkPages`), **006** (dados efetivos), **007** (fotos — gate de entrada), **008**
(máquina de estados, aprovação/preview/download — adaptados).

### 8.2 Dependências Externas
Nenhuma além das herdadas da 011 (Collabora) e 004 (LibreOffice).

## 9. Observações e Decisões de Design
- **"Reset para o rascunho":** prever uma ação explícita que remonta o `working.docx` dos dados
  (descartando edições) — útil quando o operador corrige dados a montante (006). Fora do escopo
  inicial; registrar como follow-up.
- **TipTap/`document_json`:** removidos do fluxo de `/edit`; arquivos mantidos até uma limpeza
  dedicada (evita PR gigante). A coluna `document_json` vira legado.
- **Snapshots:** passam de cópia do JSON para cópia do `working.docx` (binário) no Storage — manter
  a auditoria reconstituível (RNF-07).
- **Telas de design (06/07):** a chrome (header, badges "Salvo", Preview/Aprovar, A4 sobre fundo)
  é preservada em volta do iframe; o canvas interno passa a ser o Collabora.

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
