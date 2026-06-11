# Document-Builder e Geração de PDF

> **ID:** 004
> **Status:** 🟡 Planejada
> **Prioridade:** 🔴 Crítica
> **Criada em:** 2026-06-11
> **Última atualização:** 2026-06-11
> **Autor:** Agente AI

---

## 1. Resumo Executivo

Implementar a cadeia documento→PDF: o document-builder do primeiro tipo de relatório
(template → JSON TipTap com nodes custom), a rota `/reports/[id]/print` com o componente
`PrintDocument` e CSS de impressão A4, e o worker pg-boss com o job `generate_pdf`
(Playwright/Chromium singleton). Estabelece o princípio inviolável nº 5: **preview = PDF**,
ambos derivados do mesmo JSON e do mesmo engine, validado por golden test.

## 2. Contexto e Motivação

### 2.1 Problema Atual
Hoje o documento final é montado à mão no Word e exportado um a um. Não existe pipeline que
transforme dados extraídos + fotos em documento estruturado e PDF reproduzível.

### 2.2 Impacto do Problema
Sem esta cadeia, o produto não entrega seu artefato final (o PDF do relatório). Divergência
entre preview e PDF é classificada pelo PRD como **bug crítico** — a arquitetura precisa
impedi-la por construção.

### 2.3 Soluções Consideradas

| Solução | Prós | Contras | Decisão |
|---------|------|---------|---------|
| Mesmo componente React renderizado em `/print` + `page.pdf()` do Playwright (PRD) | Preview = PDF por construção; CSS de impressão padrão | Worker precisa de Chromium | ✅ Escolhida |
| Geração de PDF por lib dedicada (pdfkit/react-pdf) | Sem Chromium no worker | Duplicaria o render (editor ≠ PDF) — viola princípio nº 5 | ❌ Descartada |
| Exportar DOCX e converter | Familiar ao cliente | DOCX é não-objetivo explícito do PRD §1 | ❌ Descartada |

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura
```
spec + variant + dados efetivos + fotos
        │ (packages/core/document-builder/{slug}.ts)
        ▼
document_json (TipTap)  ──▶ editor (008)            ┐ mesmo JSON,
        │                                            │ mesmo componente,
        ▼                                            │ mesmo Chromium
/reports/[id]/print (PrintDocument + CSS @page A4)  ┘
        │ worker: pg-boss job generate_pdf → Playwright page.pdf()
        ▼
Storage reports/{id}/final.pdf + sha256(document_json) + status generated
```

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|-----------|------|------|-----------|
| `packages/core/src/document-builder/<slug>.ts` | Arquivo | Criar | Builder do 1º tipo: `{spec, variant, data, photos} → JSON TipTap` |
| `packages/core/src/document-builder/content/<slug>.<variant>.ts` | Arquivo | Criar | Texto estático por variante (dos modelos Word do cliente) |
| `packages/core/src/document-builder/nodes.ts` | Arquivo | Criar | Construtores JSON de `photoFrame`, `dataTable`, mark `dataField` |
| `apps/web/app/reports/[id]/print/page.tsx` | Arquivo | Criar | Rota de impressão protegida por `PRINT_SERVICE_TOKEN` |
| `apps/web/components/print/PrintDocument.tsx` | Arquivo | Criar | Render do `document_json` (compartilhado com preview da 008) |
| `apps/web/components/print/print.css` | Arquivo | Criar | `@page` A4, margens 2 cm, `break-inside: avoid`, rodapé numerado |
| `apps/worker/src/boss.ts` | Arquivo | Criar | Bootstrap pg-boss sobre `DATABASE_URL` |
| `apps/worker/src/browser.ts` | Arquivo | Criar | Singleton Chromium (RNF-08) |
| `apps/worker/src/jobs/generatePdf.ts` | Arquivo | Modificar | Job: abre `/print`, `page.pdf()`, salva Storage, hash, transição |
| `tests/golden/<slug>.<variant>/` | Pasta | Criar | `input.xlsx`, `photos/`, `expected.pdf` do tipo 1 |

### 3.3 Interfaces e Contratos

#### Entradas
- Builder: `{ spec: ReportSpec, variant: string | null, data: Record<string, unknown>, photos: PhotoAlloc[] }`.
- Rota `/print`: `id` do relatório + header/query com `PRINT_SERVICE_TOKEN` (RNF-05).
- Job `generate_pdf`: payload `{ reportId }` via pg-boss.

#### Saídas
- Builder: JSON TipTap completo (doc válido contra o schema do editor da 008).
- Rota `/print`: HTML paginado pronto para impressão.
- Job: `reports/{id}/final.pdf` no Storage, `reports.document_hash` (sha256), status → `generated`, linha no `audit_log`.

#### Contratos de API (se aplicável)
`GET /reports/[id]/print?token=…` — 401 sem token válido; 404 se relatório inexistente;
HTML caso contrário. Único consumidor automatizado: o worker.

### 3.4 Modelos de Dados (se aplicável)
Nodes custom (PRD §9): `photoFrame` atrs `{slotId, photoId, src, widthMm, heightMm}` (atom,
não selecionável/arrastável); `dataTable` atrs `{tableId, rows}` (atom não editável);
mark `dataField` atrs `{field}`. Campos persistidos usados: `reports.document_json`,
`reports.pdf_paths[]`, `reports.document_hash`.

### 3.5 Fluxo de Execução
1. Builder monta o `document_json` (texto fixo + condicionais por variante + dataFields + dataTables + photoFrames) — chamado ao entrar em `editing` (RF-20, integração na 008).
2. Worker recebe `generate_pdf`, abre `APP_BASE_URL/reports/{id}/print` com o token de serviço no Chromium singleton.
3. `page.pdf({ format: 'A4', printBackground: true })`.
4. Upload para Storage, grava sha256 do `document_json` usado, transiciona `approved → generated`, audita.
5. Concorrência 1 para `generate_pdf` (RNF-04).

### 3.6 Tratamento de Erros
- `/print` sem token ou token errado: 401, sem vazamento de conteúdo.
- Falha do Chromium/timeout: job marcado com retry do pg-boss (limite definido); relatório
  permanece `approved`; erro registrado no `audit_log`.
- Crash do singleton: relançar browser no próximo job (health check antes de usar).
- Foto ausente no Storage ao renderizar: frame renderiza placeholder de erro visível — PDF
  não é silenciosamente gerado com buraco invisível.

## 4. Requisitos

### 4.1 Requisitos Funcionais
Derivados do PRD (tarefas T-08..T-10):

- **RF-001 (PRD RF-20/T-08):** Builder por tipo em `packages/core/src/document-builder/{slug}.ts` montando o JSON TipTap a partir de spec/variante/dados/fotos. Texto estático em `content/{slug}.{variant}.ts`. **[Texto real BLOQUEADO por modelos Word — PRD §15]**
- **RF-002 (PRD §9):** Construtores dos nodes `photoFrame` e `dataTable` e da mark `dataField` em JSON puro.
- **RF-003 (PRD RF-27/T-09):** Rota `/print` protegida por token renderizando `document_json` com `@page` A4, margens 2 cm, `break-inside: avoid` em photoFrames/dataTables, rodapé numerado.
- **RF-004 (PRD RF-28/T-10):** Worker pg-boss com `generate_pdf`: Playwright, `page.pdf()`, Storage `reports/{id}/final.pdf`, hash sha256, transição para `generated`.

### 4.2 Requisitos Não-Funcionais
- **RNF-001 (PRD RNF-02):** Golden test: render rasterizado do PDF vs `expected.pdf` com diff ≤ 0,5% de pixels.
- **RNF-002 (PRD RNF-04):** Concorrência 1 no job `generate_pdf`.
- **RNF-003 (PRD RNF-08):** Chromium singleton reutilizado entre jobs; operação dentro de 8 GB.
- **RNF-004 (PRD RNF-03):** Geração de PDF < 60 s.
- **RNF-005 (PRD RNF-05):** `/print` exige `PRINT_SERVICE_TOKEN`; PDF acessível só por URL assinada.

### 4.3 Restrições e Limitações
- Builder vive em `packages/core` (TS puro — sem React); o render React vive em `apps/web`.
- Fotos têm dimensão fixa no frame, `object-fit: cover` — a imagem se adapta ao frame, nunca o contrário (princípio nº 4).
- O conteúdo textual definitivo depende dos modelos Word do cliente; até lá usa-se conteúdo provisório derivado do protótipo (tela 07) claramente marcado como placeholder.

## 5. Critérios de Aceitação

- [ ] **CA-001:** Snapshot test do JSON TipTap por variante do tipo 1 (aceite do PRD T-08).
- [ ] **CA-002:** Render manual de `/print` fiel ao modelo do cliente (aceite do PRD T-09 — inspeção; provisoriamente fiel à tela 07 do protótipo).
- [ ] **CA-003:** PDF gerado da fixture pelo worker de ponta a ponta (aceite do PRD T-10).
- [ ] **CA-004:** Golden test inicial do tipo 1 verde com tolerância ≤ 0,5% (RNF-02).
- [ ] **CA-005:** `/print` retorna 401 sem token válido.
- [ ] **CA-006:** Dois jobs simultâneos de `generate_pdf` executam em série (concorrência 1).
- [ ] **CA-007:** `document_hash` confere com sha256 do `document_json` usado.

## 6. Plano de Testes

### 6.1 Testes Unitários
Builder (JSON esperado por fixture/variante — snapshot), construtores de nodes, função de hash.

### 6.2 Testes de Integração
Worker + rota `/print` + Storage local: job completo gera PDF e atualiza o relatório.

### 6.3 Testes de Aceitação
Golden test do pipeline (PRD §11): extrai → monta → gera PDF → rasteriza → diff de pixels
contra `expected.pdf`; roda no CI a cada mudança em core, templates ou CSS de impressão.

### 6.4 Casos de Borda (Edge Cases)
- Documento de 1 página vs 10+ páginas (numeração de rodapé correta).
- photoFrame no fim da página (deve quebrar para a próxima inteiro — `break-inside: avoid`).
- Relatório sem fotos opcionais alocadas (layout não colapsa).
- Variante com campos diferentes (on/off-hire muda mapeamento — testado na 009, estrutura prevista aqui).
- Job disparado para relatório que não está `approved` (rejeitar e auditar).

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Divergência preview/PDF por CSS de tela vazando no print | Média | Alto | Mesma rota/componente para ambos; golden test no CI (RNF-001) |
| Golden tests frágeis (fontes/antialiasing entre ambientes) | Alta | Médio | Rasterização e diff sempre no MESMO container do worker; tolerância 0,5% |
| Chromium consumindo RAM além do VPS | Média | Alto | Singleton + concorrência 1 + medição no compose local (001) |
| Modelos Word atrasarem | Alta | Médio | Conteúdo provisório do protótipo; troca posterior atinge só `content/` (motor intacto) |

## 8. Dependências

### 8.1 Dependências Internas
**001** (worker, Docker, compose), **002** (tabelas `reports`, Storage, audit_log),
**003** (tipos do spec, dados extraídos, `resolveFieldValue`).

### 8.2 Dependências Externas
pg-boss, Playwright/Chromium, sharp (na 007 — não aqui), lib de rasterização de PDF para o
golden test (pdfium/pdf2image). Insumo do cliente (PRD §15): **modelos Word + exemplos
preenchidos** — bloqueiam o texto definitivo (RF-001).

## 9. Observações e Decisões de Design

- **Tela de design vinculada:** 07 Preview/PDF — `design/naabsa-survey/project/Naabsa Protótipo.dc.html`
  (seção `isPreview`: duas páginas A4, cabeçalho com logo NAABSA, tabela de calados, grid de
  fotos, rodapé `NAABSA · PÁGINA n DE m`) e board estático `Naabsa Relatórios.dc.html` (tela 07).
  O `PrintDocument` deve reproduzir essa diagramação; a integração do preview na UI do editor
  é escopo da 008.
- Tokens visuais do documento: Public Sans para texto, IBM Plex Mono para valores de dados,
  navy `#16294D` em cabeçalhos de tabela, vermelho `#BF2C30` apenas no letreiro institucional.
- O builder do tipo 1 define o padrão que os 4 builders restantes (009) seguirão — investir
  em clareza aqui paga na M3, cujo aceite proíbe alterar `packages/core` fora de `content/` e specs.

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
