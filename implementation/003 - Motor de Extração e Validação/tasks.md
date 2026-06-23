# Tarefas: Motor de Extração e Validação

> **Implementação:** 003 - Motor de Extração e Validação
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 13/16 tarefas concluídas (81%) — T-013/T-014 concluídas (CA-008/CA-009);
>   falta T-015 (tables range-based) e T-016 (extração limpa real).
> **Última atualização:** 2026-06-23

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Preparação e Setup

- [x] **T-001:** Definir tipos do domínio do motor
  - **Descrição:** Criar `ReportSpec`, `FieldDef`, `ValidationRule`, `PhotoSlot`, `Issue`, `ExtractionResult` em `packages/core/src/types.ts`, espelhando o PRD §8.
  - **Arquivos envolvidos:** `packages/core/src/types.ts`
  - **Critério de conclusão:** Tipos compilam e cobrem todo o contrato do PRD §8.
  - **Dependências:** Nenhuma (001 concluída)
  - **Estimativa:** Média

### Fase 2: Spec Schema (PRD T-04)

- [x] **T-002:** Escrever `spec.schema.json`
  - **Descrição:** JSON Schema completo do contrato JSONB: campos obrigatórios, tipos de campo (`number.decimals`, `date.format`, `enum.options`), regras `compare`/`range`, `photo_slots`.
  - **Arquivos envolvidos:** `packages/core/src/spec-schema/spec.schema.json`
  - **Critério de conclusão:** Schema valida o exemplo do PRD §8 e rejeita mutações inválidas.
  - **Dependências:** T-001
  - **Estimativa:** Média

- [x] **T-003:** Implementar `validateSpec()` com mensagens pt-BR
  - **Descrição:** Wrapper de validação (ajv) traduzindo erros para mensagens claras exibíveis na UI do admin (009).
  - **Arquivos envolvidos:** `packages/core/src/spec-schema/validateSpec.ts`
  - **Critério de conclusão:** Fixtures válidas passam; 10+ inválidas rejeitam com mensagem (CA-001).
  - **Dependências:** T-002
  - **Estimativa:** Média

### Fase 3: Extractor (PRD T-05)

- [x] **T-004:** Coerção de tipos
  - **Descrição:** `coerce.ts` com os 5 tipos: string (trim), number (decimals, vírgula pt-BR, texto numérico), date (serial Excel, sistemas 1900/1904, `format`), enum (política de caixa), boolean.
  - **Arquivos envolvidos:** `packages/core/src/extractor/coerce.ts`
  - **Critério de conclusão:** Unit test por tipo com tabela de casos, incl. bordas (CA-002).
  - **Dependências:** T-001
  - **Estimativa:** Grande

- [x] **T-005:** Pipeline de extração (aba, fingerprint, campos)
  - **Descrição:** `extract.ts`: localizar `source.sheet`, conferir fingerprint (erro RF-09 nomeando tipo detectado), ler `common` + `by_variant[variant]` com coerção; fórmulas lidas pelo valor calculado.
  - **Arquivos envolvidos:** `packages/core/src/extractor/extract.ts`
  - **Critério de conclusão:** Fixture perfeita extrai todos os campos; fingerprint errado gera o erro específico (CA-005).
  - **Dependências:** T-004
  - **Estimativa:** Grande

- [x] **T-006:** Gerar fixtures sintéticas de planilha
  - **Descrição:** Script que gera `.xlsx` de teste com ExcelJS (cenários: completa, campos vazios, tipos errados, fingerprint divergente) + specs sintéticos correspondentes.
  - **Arquivos envolvidos:** `tests/fixtures/planilhas/*`, `tests/fixtures/specs/*`
  - **Critério de conclusão:** Fixtures versionadas e regeneráveis por script.
  - **Dependências:** T-005
  - **Estimativa:** Média

### Fase 4: Validações e Issues (PRD T-06)

- [x] **T-007:** Validações por campo e regras cruzadas
  - **Descrição:** `validate.ts`: `required`, `min`, `max`, `pattern`, `enum` por campo + `validations[]` (`compare`, `range`), níveis error/warning, mensagens pt-BR com célula (RF-08).
  - **Arquivos envolvidos:** `packages/core/src/extractor/validate.ts`
  - **Critério de conclusão:** Fixtures com erros conhecidos produzem issues exatas (CA-004).
  - **Dependências:** T-005
  - **Estimativa:** Grande

- [x] **T-008:** Implementar `resolveFieldValue()`
  - **Descrição:** Função única `override ?? extracted` (RF-13), tratando `undefined` vs valores falsy legítimos (0, '', false).
  - **Arquivos envolvidos:** `packages/core/src/resolveFieldValue.ts`
  - **Critério de conclusão:** Testes de override presente/ausente/falsy verdes (CA-006).
  - **Dependências:** T-001
  - **Estimativa:** Pequena

### Fase 5: Testes e Validação

- [x] **T-009:** Teste de determinismo (RNF-01)
  - **Descrição:** Rodar o extractor 3× sobre a mesma fixture e exigir igualdade profunda (PRD §11).
  - **Arquivos envolvidos:** `packages/core/src/extractor/determinism.test.ts`
  - **Critério de conclusão:** CA-003 verde no CI.
  - **Dependências:** T-005, T-007
  - **Estimativa:** Pequena

- [x] **T-010:** Teste de performance (RNF-03)
  - **Descrição:** Fixture de ~5 MB extraída em < 5 s (medição no teste, com margem para CI).
  - **Arquivos envolvidos:** `packages/core/src/extractor/perf.test.ts`
  - **Critério de conclusão:** Limite atendido localmente e documentado.
  - **Dependências:** T-009
  - **Estimativa:** Pequena

### Fase 6: Spec real do cliente (PRD T-07) — INSUMO RECEBIDO 2026-06-23

- [x] **T-011:** Escrever o spec real do primeiro tipo do cliente
  - **Descrição:** Tipo prioritário = `draft_survey`. Spec real autorado a partir da planilha real
    e do docx anotado: 83 campos (6 abas), 14 tabelas range-based, `variant_source` em `Capa!L4`,
    fingerprint `Capa!B2`. **Usa o contrato v2** (multi-aba — §3.4.1 do spec).
  - **Arquivos envolvidos:** `tests/fixtures/specs/draft_survey.v1.json`,
    `tests/fixtures/reports/draft_survey/{cliente-instrucoes,field-map}.md`
  - **Critério de conclusão:** JSON sintaticamente válido + revisão com o cliente.
  - **Observações:** ✅ Autorado. `validateSpec` ainda **não** o aceita (precisa de T-013).

- [x] **T-012:** Fixture da planilha real (versionada)
  - **Descrição:** Planilha real versionada como fixture; docx-modelo versionado como referência.
  - **Arquivos envolvidos:** `tests/fixtures/planilhas/draft_survey/draft_survey.real.v1.xlsx`,
    `tests/fixtures/reports/draft_survey/MV-PERSEUS-I.model.docx`
  - **Critério de conclusão:** Arquivos versionados (CA-007a). **Extração limpa → T-016 (CA-007b).**

### Fase 7: Contrato v2 — multi-aba (implementação do motor) — PENDENTE

- [x] **T-013:** Estender schema + types + `validateSpec` para o contrato v2
  - **Descrição:** `sheet` por campo/table/fingerprint, `variant_source`, `ignore_sheets`,
    `tables[]`, `field.unit`. Retrocompatível (sem `contract` ⇒ v1). Atualizar `spec.schema.json`,
    `types.ts`, `validateSpec.ts`.
  - **Critério de conclusão:** CA-008 — `draft_survey.v1.json` valida; 21 testes v1 seguem verdes.
  - **Dependências:** T-011
  - **Estimativa:** Grande
  - **Observações:** ✅ Schema com `contract` 1/2 + checagens semânticas em `validateSpec`
    (v1 exige `source.sheet`; v2 exige `sheet` em fingerprint/campos + `variant_source.map ⊆ variants`).
    98 testes do core verdes (validateSpec 21→28); typecheck/lint ok.

- [x] **T-014:** Extractor multi-aba + variante por célula
  - **Descrição:** `extract` lê `sheet` por campo; resolve variante de `source.variant_source`
    (valor fora do `map` ⇒ `error`); respeita `ignore_sheets`. Fingerprint passa a usar `sheet`.
  - **Arquivos envolvidos:** `packages/core/src/extractor/extract.ts`, `pipeline.ts`
  - **Critério de conclusão:** CA-009.
  - **Dependências:** T-013
  - **Estimativa:** Grande

- [ ] **T-015:** Extração de `tables[]` (range-based) + coerção time-of-day
  - **Descrição:** Ler `source.tables[]` (`sheet`+`range`) em matrizes determinísticas;
    `optional` vazia não gera `error`. Coerção de horário (`Capa!M7`...) → `string` "HH:MM" (RF-011).
  - **Arquivos envolvidos:** `packages/core/src/extractor/extract.ts`, `coerce.ts`
  - **Critério de conclusão:** CA-010 + coerção testada.
  - **Dependências:** T-014
  - **Estimativa:** Média

- [ ] **T-016:** Extração limpa da planilha real (CA-007b) + confirmar ranges
  - **Descrição:** Rodar a extração real ponta-a-ponta; eliminar issues inesperadas; confirmar os
    limites `provisional` das `tables` contra o conteúdo real e remover o flag.
  - **Arquivos envolvidos:** `tests/fixtures/specs/draft_survey.v1.json`, testes de extração real.
  - **Critério de conclusão:** CA-007b verde.
  - **Dependências:** T-015
  - **Estimativa:** Média

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | ✅ Concluída | 2026-06-12 | types.ts: ReportSpec/FieldDef(união discriminada)/ValidationRule/PhotoSlot/Issue/ExtractionResult; exportados pelo barril |
| T-002  | ✅ Concluída | 2026-06-12 | spec.schema.json (draft-07): exclusividade date→format/enum→options/number→decimals; additionalProperties false |
| T-003  | ✅ Concluída | 2026-06-12 | validateSpec (ajv 8) com erros pt-BR; 21 testes (1 válido + 18 inválidos) verdes (CA-001) |
| T-004  | ✅ Concluída | 2026-06-12 | coerce.ts (5 tipos): serial Excel 1900/1904, número pt-BR (.milhar ,decimal), enum case-insensitive, boolean pt-BR; 25 testes (CA-002) |
| T-005  | ✅ Concluída | 2026-06-12 | extract.ts: aba→fingerprint(RF-09)→common+by_variant→coerção; normalizeCell (fórmula/richText/hyperlink); I/O fica no app; 7 testes |
| T-006  | ✅ Concluída | 2026-06-12 | synthFixtures.ts: builder ExcelJS in-memory + sampleSpec (draft_survey c/ variantes); usado por extract/determinismo |
| T-007  | ✅ Concluída | 2026-06-12 | validate.ts (required/min/max/pattern + compare/range) pt-BR; pipeline.ts (runExtraction, pula validação se aba/fingerprint falham); 8 testes (CA-004) |
| T-008  | ✅ Concluída | 2026-06-12 | resolveFieldValue (RF-13): override ?? extraído, mantém falsy (0/''/false); 6 testes (CA-006) |
| T-009  | ✅ Concluída | 2026-06-12 | determinism.test: runExtraction 3× → igualdade profunda + JSON idêntico (CA-003) |
| T-010  | ✅ Concluída | 2026-06-12 | perf.test: 300 campos < 1s (RNF-03; load do .xlsx fica no app). Núcleo: 72 testes verdes |
| T-011  | ✅ Concluída | 2026-06-23 | Spec real `draft_survey.v1.json` (83 campos/6 abas, 14 tabelas, variante Capa!L4) — contrato v2 |
| T-012  | ✅ Concluída | 2026-06-23 | Planilha real + docx-modelo versionados em tests/fixtures (CA-007a) |
| T-013  | ✅ Concluída | 2026-06-23 | spec.schema.json + types.ts + validateSpec: contrato v2 com checagens semânticas; 98→28 testes verdes (CA-008) |
| T-014  | ✅ Concluída | 2026-06-23 | extract.ts multi-aba + resolveVariant(); pipeline.ts integrado; 9 testes v2 (CA-009); 107 testes verdes |
| T-015  | ⬜ Pendente | — | Tables range-based + coerção time-of-day (CA-010/RF-011) |
| T-016  | ⬜ Pendente | — | Extração limpa real + confirmar ranges (CA-007b) |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
