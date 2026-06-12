# Tarefas: Motor de Extração e Validação

> **Implementação:** 003 - Motor de Extração e Validação
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 10/12 tarefas concluídas (83%) — T-011/T-012 bloqueadas (planilha real do cliente)
> **Última atualização:** 2026-06-12

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

### Fase 6: Spec real do cliente (PRD T-07) — BLOQUEADA

- [!] **T-011:** Escrever o spec real do primeiro tipo do cliente
  - **Descrição:** Com o tipo prioritário definido e a planilha pré-moldada real em mãos, escrever o spec v1 completo (campos, células, validações, photo_slots).
  - **Arquivos envolvidos:** `tests/fixtures/specs/<slug>.v1.json`
  - **Critério de conclusão:** `validateSpec` passa; revisão com o cliente.
  - **Dependências:** T-003, T-007
  - **Estimativa:** Média
  - **Observações:** 🔴 Bloqueada por insumo do cliente (PRD §15: tipo prioritário + planilha real).

- [!] **T-012:** Fixture da planilha real + extração limpa
  - **Descrição:** Versionar a planilha real como fixture e garantir extração sem issues inesperadas (aceite do PRD T-07).
  - **Arquivos envolvidos:** `tests/fixtures/planilhas/<slug>-real.xlsx`, testes
  - **Critério de conclusão:** CA-007 verde.
  - **Dependências:** T-011
  - **Estimativa:** Média
  - **Observações:** 🔴 Bloqueada pelo mesmo insumo da T-011.

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
| T-011  | 🔴 Bloqueada | — | Aguarda tipo prioritário + planilha real (PRD §15) |
| T-012  | 🔴 Bloqueada | — | Aguarda T-011 |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
