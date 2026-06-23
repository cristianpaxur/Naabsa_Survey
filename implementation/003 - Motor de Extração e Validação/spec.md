# Motor de Extração e Validação

> **ID:** 003
> **Status:** 🔵 Em Andamento
> **Prioridade:** 🔴 Crítica
> **Criada em:** 2026-06-11
> **Última atualização:** 2026-06-23
> **Autor:** Agente AI

---

## 1. Resumo Executivo

Implementar em `packages/core` o núcleo de maior risco do projeto: o JSON Schema do report
spec com validador (`validateSpec`), o extractor determinístico de planilhas (ExcelJS,
fingerprint, coerção de tipos, datas seriais) e o sistema de validações com `Issue[]` em
pt-BR. Inclui o spec real do primeiro tipo de relatório do cliente quando o insumo chegar.

## 2. Contexto e Motivação

### 2.1 Problema Atual
Hoje os dados são copiados manualmente de planilhas para documentos — lento e sujeito a erro.
O motor genérico (princípio inviolável nº 2 do PRD) precisa ler qualquer planilha pré-moldada
guiado apenas por um spec JSONB, sem nenhum código conhecer um relatório específico.

### 2.2 Impacto do Problema
O PRD §12 classifica este módulo como "núcleo de maior risco" (M1). Erros aqui corrompem
todos os relatórios; não-determinismo (RNF-01) quebra a confiança e os golden tests.

### 2.3 Soluções Consideradas

| Solução | Prós | Contras | Decisão |
|---------|------|---------|---------|
| Extração determinística por spec declarativo (PRD) | Auditável, testável, genérica | Specs precisam ser mantidos por admin | ✅ Escolhida |
| Extração assistida por IA | Flexível a layouts variados | Viola princípio inviolável nº 1 do PRD | ❌ Descartada |
| Código específico por tipo de relatório | Simples no início | Viola princípio nº 2 (motor genérico); explode manutenção | ❌ Descartada |

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura
Tudo em `packages/core` (TypeScript puro, zero dependência de Next.js/Supabase/worker):

```
packages/core/src/
├── spec-schema/   → spec.schema.json + validateSpec()
├── extractor/     → extract(planilha, spec, variant) → { data, issues }
└── (document-builder/ → escopo da 004)
```

A persistência do resultado (`reports.extracted_data`) e o disparo da extração são feitos
pelo app (implementação 005); aqui vive só a lógica pura.

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|-----------|------|------|-----------|
| `packages/core/src/spec-schema/spec.schema.json` | Arquivo | Criar | JSON Schema do contrato JSONB (PRD §8) |
| `packages/core/src/spec-schema/validateSpec.ts` | Arquivo | Criar | Validador com mensagens de erro claras |
| `packages/core/src/extractor/extract.ts` | Arquivo | Criar | Pipeline: aba → fingerprint → campos → coerção |
| `packages/core/src/extractor/coerce.ts` | Arquivo | Criar | Coerção string/number/date(serial)/enum/boolean |
| `packages/core/src/extractor/validate.ts` | Arquivo | Criar | Validações por campo + regras cruzadas → `Issue[]` |
| `packages/core/src/types.ts` | Arquivo | Criar | `ReportSpec`, `Issue`, `ExtractionResult` etc. |
| `packages/core/src/resolveFieldValue.ts` | Arquivo | Criar | `override ?? extracted` (RF-13) — função única do sistema |
| `tests/fixtures/specs/`, `tests/fixtures/planilhas/` | Pasta | Criar | Fixtures sintéticas + (depois) planilha real do cliente |

### 3.3 Interfaces e Contratos

#### Entradas
- `validateSpec(json: unknown)` — candidato a spec.
- `extract(workbook: Buffer | ExcelJS.Workbook, spec: ReportSpec, variant: string | null)`.

#### Saídas
- `validateSpec` → `{ valid: true } | { valid: false, errors: string[] }` (pt-BR).
- `extract` → `{ data: Record<string, unknown>, issues: Issue[] }` com
  `Issue = { field, cell, level: 'error' | 'warning', message }` (RF-08), mensagens em pt-BR
  apontando a célula (ex.: `"Campo 'Data do survey' vazio na célula B7"`).

#### Contratos de API (se aplicável)
N/A — biblioteca pura; a API HTTP que a chama é escopo da 005.

### 3.4 Modelos de Dados (se aplicável)
Contrato do spec (PRD §8): `report_type`, `version`, `variants[]`,
`source.{sheet, fingerprint{cell,expect}, common.fields, by_variant[variant].fields}`,
`validations[]` (rules `compare` e `range`, níveis `error`/`warning`), `photo_slots[]`
(id, label, aspect, required, min, max). Tipos de campo: `string | number | date | enum |
boolean`; `number` aceita `decimals`; `date` exige `format`; `enum` exige `options[]`.

#### 3.4.1 Contrato v2 — multi-aba (exigido pelo 1º tipo real, Draft Survey)

O insumo real do cliente (2026-06-23) provou que o **modelo v1 de aba única é insuficiente**: o
relatório `draft_survey` lê **6 abas** (`Capa`, `Inicial`, `Intermediario`, `final`,
`DS INTERMEDIATE`, `DS FINAL`) e ignora `LOD-LOP`. O contrato evolui para **v2** (campo
`contract: 2` no spec), retrocompatível com v1 (sem `contract` ⇒ v1, aba única):

| Mudança | v1 | v2 |
|---|---|---|
| Aba | `source.sheet` (única) | **`sheet` por campo** (e por `table`/`fingerprint`) |
| Fingerprint | `{cell, expect}` na aba única | `{sheet, cell, expect}` |
| Variante | parâmetro externo de `extract(...)` | **`source.variant_source {sheet, cell, map}`** — lida da planilha (Draft Survey: `Capa!L4`, `Loading`→`loading`/`Discharge`→`discharge`) |
| Tabelas/grades | inexistente | **`source.tables[]`** range-based (`{id, label, sheet, range, phase?, optional?}`) p/ recriar as grades de cálculo como tabelas nativas |
| Abas ignoradas | — | `source.ignore_sheets[]` (ex.: `["LOD-LOP"]`) |
| Hints de exibição | — | `field.unit` (sufixo) opcional; `table.optional` (seção condicional) |

Spec real de referência: `tests/fixtures/specs/draft_survey.v1.json` (83 campos, 14 tabelas).
Mapa célula→relatório: `tests/fixtures/reports/draft_survey/field-map.md`.

### 3.5 Fluxo de Execução
1. Localizar a aba `source.sheet`; ausente → issue `error`.
2. Conferir `fingerprint.cell === expect`; divergente → `error` específico identificando o tipo detectado (RF-09).
3. Ler campos `common` + `by_variant[variant]`, coagindo tipos (datas a partir de serial Excel).
4. Rodar validações por campo (`required`, `min`, `max`, `pattern`, `enum`) e cruzadas (`validations[]`).
5. Retornar `{ data, issues }` — saída byte-idêntica para a mesma entrada (RNF-01).

### 3.6 Tratamento de Erros
- Toda falha vira `Issue` estruturada — o extractor **nunca lança** para problemas de dados;
  exceções só para erros de programação (spec inválido deve ser barrado antes por `validateSpec`).
- Fingerprint de outro tipo: `error` nomeando o tipo detectado (RF-09).
- Célula vazia em campo `required`: `error` com label e célula; campo não-required vazio → valor `null` sem issue.
- Data serial inválida/fora de range: `error` apontando a célula.

## 4. Requisitos

### 4.1 Requisitos Funcionais
Derivados do PRD (tarefas T-04..T-07):

- **RF-001 (PRD §8/T-04):** JSON Schema completo do spec + `validateSpec` rejeitando estruturas inválidas com mensagem.
- **RF-002 (PRD RF-06):** Extractor lê aba, confere fingerprint, lê `common` + `by_variant[variant]`, coage os 5 tipos.
- **RF-003 (PRD RF-07):** Validações por campo (`required`, `min`, `max`, `pattern`, `enum`) e cruzadas, com níveis `error`/`warning`.
- **RF-004 (PRD RF-08):** Saída `{ data, issues }` com mensagens pt-BR apontando célula.
- **RF-005 (PRD RF-09):** Fingerprint incompatível gera `error` identificando o tipo detectado.
- **RF-006 (PRD RF-13):** `resolveFieldValue(field, overrides, extracted)` única em todo o sistema.
- **RF-007 (PRD T-07/RF-05):** Spec real do primeiro tipo do cliente + fixture de planilha real extraindo sem issues inesperadas. **[INSUMO RECEBIDO 2026-06-23]** — spec autorado (`tests/fixtures/specs/draft_survey.v1.json`) e planilha versionada; extração limpa depende do contrato v2 (RF-008..RF-010).
- **RF-008 (contrato v2 — multi-aba):** Extractor lê `sheet` por campo / por `table`, fingerprint com `sheet`, e `ignore_sheets`. `validateSpec` aceita specs v2 e continua aceitando v1.
- **RF-009 (contrato v2 — variante por célula):** Quando o spec define `source.variant_source {sheet, cell, map}`, a variante é resolvida lendo a célula da planilha (ex.: `Capa!L4`), não por parâmetro externo. Valor fora do `map` ⇒ `error`.
- **RF-010 (contrato v2 — tabelas range-based):** Extractor lê `source.tables[]` (`sheet` + `range`) devolvendo matrizes determinísticas p/ as grades nativas; `table.optional` ausente/vazia não gera `error` (seção condicional).
- **RF-011 (coerção time-of-day):** Coação de células de horário (ex.: `Capa!M7`/`N7`) — novo caso além dos 5 tipos atuais (decidir: `string` "HH:MM" determinístico).

### 4.2 Requisitos Não-Funcionais
- **RNF-001 (PRD RNF-01):** Determinismo: mesma planilha + spec ⇒ saída profundamente igual em execuções repetidas (testado 3×).
- **RNF-002 (PRD RNF-03):** Extração < 5 s para planilhas de até 5 MB.
- **RNF-003 (PRD §7):** Zero imports de Next.js/Supabase/worker (lint da 001 enforça).
- **RNF-004 (PRD RNF-09):** Todas as mensagens de issue em pt-BR.

### 4.3 Restrições e Limitações
- IA **nunca** participa da extração (princípio inviolável nº 1).
- `extracted_data` é imutável após gravado — correções vão para `operator_overrides` (RF-10/RF-12; persistência na 005/006).
- RF-007 bloqueado até o cliente definir o tipo prioritário e enviar a planilha real.

## 5. Critérios de Aceitação

- [x] **CA-001:** Fixtures de spec válidas passam no `validateSpec`; 10+ casos inválidos rejeitam com mensagem (aceite do PRD T-04).
- [x] **CA-002:** Unit tests por tipo de campo (string, number+decimals, date serial, enum, boolean) verdes (aceite do PRD T-05).
- [x] **CA-003:** Teste de determinismo: extractor 3× sobre a mesma fixture ⇒ igualdade profunda (RNF-01).
- [x] **CA-004:** Fixtures com erros conhecidos produzem `Issue[]` exatas, em pt-BR, com célula (aceite do PRD T-06).
- [x] **CA-005:** Planilha de tipo errado produz o `error` de fingerprint do RF-09.
- [x] **CA-006:** `resolveFieldValue` coberta por testes (override presente, ausente, valor falsy legítimo).
- [x] **CA-007a:** Spec real do `draft_survey` autorado e versionado (`tests/fixtures/specs/draft_survey.v1.json`) + planilha real como fixture (`tests/fixtures/planilhas/draft_survey/draft_survey.real.v1.xlsx`).
- [ ] **CA-007b:** Extração da planilha real sem issues inesperadas (aceite do PRD T-07) — **depende do contrato v2** (CA-008..CA-010).
- [ ] **CA-008:** `validateSpec` aceita `draft_survey.v1.json` (v2) e mantém os 21 testes v1 verdes.
- [ ] **CA-009:** Extractor resolve a variante de `Capa!L4` e lê campos das 6 abas; `LOD-LOP` ignorada.
- [ ] **CA-010:** `source.tables[]` extraídas como matrizes; tabelas `optional` vazias não geram `error`.

## 6. Plano de Testes

### 6.1 Testes Unitários
Cobertura alta (PRD §11) em: coerção por tipo (incl. datas seriais do Excel e números com
`decimals`), fingerprint, leitura common/by_variant, cada regra de validação, formatação
das mensagens pt-BR, `resolveFieldValue`.

### 6.2 Testes de Integração
Extração ponta-a-ponta de fixtures `.xlsx` reais (geradas com ExcelJS) por tipo de cenário:
planilha perfeita, campos faltando, tipo errado, fingerprint divergente.

### 6.3 Testes de Aceitação
CA-001..CA-006 são suites Vitest; CA-007 roda quando a planilha real chegar.

### 6.4 Casos de Borda (Edge Cases)
- Célula com fórmula (ler valor calculado, não a fórmula).
- Data serial 0 / datas antes de 1900 / sistema de datas 1904.
- Número armazenado como texto ("12,5" com vírgula decimal pt-BR).
- String com espaços/quebras de linha (trim definido e testado).
- Enum com diferença de caixa ("Descarga" vs "descarga") — política definida no spec e testada.
- Planilha de 5 MB (limite de performance RNF-002).

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Datas seriais Excel com timezone/1904 produzirem off-by-one | Alta | Alto | Conversão própria testada com tabela de casos conhecidos; sem `Date` local |
| Planilha real do cliente divergir das suposições do spec sintético | Alta | Médio | RF-007 isola isso; ajustar spec (dado), não o motor (código) |
| Não-determinismo sutil (ordem de keys, floats) | Média | Alto | Ordenação estável de campos; teste CA-003 roda no CI |
| Insumo do cliente atrasar | Alta | Médio | CA-001..CA-006 não dependem do insumo; só CA-007 fica pendente |

## 8. Dependências

### 8.1 Dependências Internas
**001** (monorepo, `packages/core`, Vitest, lint de isolamento).

### 8.2 Dependências Externas
ExcelJS; ajv (ou equivalente) para JSON Schema. Insumos do cliente (PRD §15): tipo
prioritário + planilha pré-moldada real — bloqueiam apenas RF-007/CA-007.

## 9. Observações e Decisões de Design

- Sem UI — nenhuma tela de `design/` vinculada. A tela 04 (Revisão) **consome** as issues
  deste motor, mas é escopo da 006.
- A célula de origem (`cell`) acompanha cada campo na saída para a tela de revisão exibir
  a proveniência (como visto no protótipo: chips monoespaçados `B7`).
- `validateSpec` também será usado pela tela Admin de Specs (009) — manter mensagens
  amigáveis para exibição direta na UI.

### 9.1 Achados dos insumos reais (2026-06-23)
- **Multi-aba** é estrutural, não exceção: o contrato v2 (§3.4.1) é pré-requisito da extração real.
- **Anotações do docx são hints, não verdade**: a seção *Final* do modelo cita `Final F28/G28…`
  (template antigo); a aba `final` viva espelha o layout de `Intermediario` (linhas 9–11). O spec
  segue a **planilha viva**. Outras imprecisões menores: porto de destino é `Capa!C9` (docx diz C7);
  data inicial é `Capa!L7` (docx diz L3). Tudo registrado em `field-map.md`.
- **`extracted_data` continua imutável**; a variante agora é um dado extraído (de `Capa!L4`), não
  um parâmetro — alinhado ao princípio de que todo conhecimento vive no spec/dados.
- **Ranges das `tables` são provisórios** (`provisional: true`): confirmar limites contra o render
  nativo da 004 antes de fechar o golden test.

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
