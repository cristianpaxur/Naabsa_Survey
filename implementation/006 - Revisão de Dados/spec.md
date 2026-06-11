# Revisão de Dados

> **ID:** 006
> **Status:** 🟡 Planejada
> **Prioridade:** 🟠 Alta
> **Criada em:** 2026-06-11
> **Última atualização:** 2026-06-11
> **Autor:** Agente AI

---

## 1. Resumo Executivo

Implementar a tela de revisão de dados (`/reports/[id]/review`): exibição dos campos do spec
agrupados por seção com valor extraído, célula de origem e issues coloridas; edição inline
gravando overrides auditados (nunca sobrescrevendo `extracted_data`); e bloqueio do avanço
para fotos enquanto houver issue de nível `error`. Materializa o princípio "operador decide".

## 2. Contexto e Motivação

### 2.1 Problema Atual
Após a extração (005), os dados e issues existem no banco mas o operador não tem onde
revisá-los, corrigir erros apontados pelo motor nem registrar a proveniência das correções.

### 2.2 Impacto do Problema
Sem revisão com bloqueio por `error`, dados inválidos fluiriam para o documento e o PDF.
Sem overrides auditados, a auditabilidade exigida pelo RNF-07 ("o que veio da planilha,
o que foi editado, por quem e quando") seria impossível.

### 2.3 Soluções Consideradas

| Solução | Prós | Contras | Decisão |
|---------|------|---------|---------|
| Overrides em coluna própria + `resolveFieldValue` (PRD) | `extracted_data` intocado; trilha completa | Duas fontes a resolver (mitigado pela função única) | ✅ Escolhida |
| Editar `extracted_data` direto | Simples | Viola RF-10/RF-12; destrói auditabilidade | ❌ Descartada |
| Re-extração após correção manual na planilha | Fonte única | Ciclo lento; PRD prevê override na UI | ❌ Descartada |

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura
Página server-rendered que une: spec congelado do relatório (campos/seções/células) +
`extracted_data` + `extraction_issues` + `operator_overrides`. Edição inline via Server
Action `setOverride(reportId, field, value)` que grava em `operator_overrides[field]`,
audita e **revalida** o campo (issues recalculadas com o motor da 003 sobre os valores
efetivos). Painel lateral de pendências (contadores de erro/aviso) e botão "Confirmar
dados" habilitado apenas com zero erros (RF-14) — transição `in_review → ...` rumo a fotos.

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|-----------|------|------|-----------|
| `apps/web/app/(app)/reports/[id]/review/page.tsx` | Arquivo | Criar | Tela 04 — seções, campos, issues, painel de pendências |
| `apps/web/components/review/FieldRow.tsx` | Arquivo | Criar | Linha de campo: label, chip de célula, badge override, input mono, issue inline |
| `apps/web/components/review/PendingPanel.tsx` | Arquivo | Criar | Painel lateral: erro bloqueante / avisos / pronto |
| `apps/web/lib/actions/review.ts` | Arquivo | Criar | `setOverride` + `confirmData` (Server Actions) |
| `apps/web/lib/effective-values.ts` | Arquivo | Criar | Montagem dos valores efetivos via `resolveFieldValue` (003) |
| `tests/e2e/review.spec.ts` | Arquivo | Criar | E2E corrigir campo e avançar |

### 3.3 Interfaces e Contratos

#### Entradas
- Relatório em `extracted`/`in_review` com spec, dados e issues persistidos.
- Edições inline do operador (campo, novo valor).

#### Saídas
- `reports.operator_overrides[field]` atualizado (RF-12) + linha no `audit_log` por edição
  (com valor anterior → novo, campo e célula, como no protótipo do histórico).
- Issues recalculadas sobre valores efetivos.
- Em "Confirmar dados": transição auditada e navegação para `/photos`.

#### Contratos de API (se aplicável)
Server Actions: `setOverride(reportId, field, value)` → `{ issues: Issue[] }`;
`confirmData(reportId)` → erro se ainda houver issue `error` (defesa além da UI).

### 3.4 Modelos de Dados (se aplicável)
Sem mudança de schema. Convenções: `operator_overrides` JSONB `{ [field]: valor }`;
valor efetivo SEMPRE via `resolveFieldValue` (RF-13) — proibido inline `??` espalhado.

### 3.5 Fluxo de Execução
1. Abrir relatório `extracted` marca `extracted → in_review` (auditado).
2. Página agrupa campos por `section` do spec, ordenados como no spec.
3. Cada campo mostra: label, chip mono da célula (`B7`), badge "override" quando aplicável, input com o valor efetivo e issue inline colorida por nível.
4. Edição → `setOverride` → auditoria → revalidação → painel de pendências atualiza contadores.
5. Zero erros → "Confirmar dados" habilita → transição e navegação para fotos (007).

### 3.6 Tratamento de Erros
- Issue `error` não resolvida: botão desabilitado + card vermelho no painel (UI) e rejeição na action (servidor).
- Falha ao salvar override: valor reverte no input com toast de erro; sem gravação parcial.
- Relatório em status incompatível (ex.: `editing`): página redireciona para a etapa correta (mapa de roteamento da 005).
- Edição concorrente do mesmo campo: última escrita vence, ambas auditadas.

## 4. Requisitos

### 4.1 Requisitos Funcionais
Derivados do PRD (tarefa T-14):

- **RF-001 (PRD RF-11):** Exibir todos os campos do spec agrupados por `section`, com valor extraído, célula de origem e issues coloridas por nível.
- **RF-002 (PRD RF-12):** Edição inline grava em `operator_overrides[field]`, nunca em `extracted_data`, e registra no `audit_log`.
- **RF-003 (PRD RF-13):** Valor efetivo exclusivamente via `resolveFieldValue()`.
- **RF-004 (PRD RF-14):** Avanço para fotos bloqueado (UI + servidor) enquanto houver issue `error` não resolvida.

### 4.2 Requisitos Não-Funcionais
- **RNF-001 (PRD RNF-07):** Cada override auditado com valor anterior/novo, campo, célula, autor e timestamp.
- **RNF-002 (PRD RNF-09):** Labels, seções e mensagens em pt-BR (vêm do spec e do motor).

### 4.3 Restrições e Limitações
- A tela é dirigida pelo spec congelado do relatório — nenhum campo hardcoded.
- Warnings de origem `ai` (RF-36) só aparecem na 010; a tela já deve renderizar issues de
  qualquer origem sem mudança (estrutura `Issue` única).

## 5. Critérios de Aceitação

- [ ] **CA-001:** E2E: relatório com erro bloqueante → corrigir campo → erro some → "Confirmar dados" habilita → avança (aceite do PRD T-14).
- [ ] **CA-002:** Override gravado não altera `extracted_data` (verificação direta no banco).
- [ ] **CA-003:** Cada edição gera linha de auditoria com before/after.
- [ ] **CA-004:** `confirmData` no servidor rejeita com issue `error` presente, mesmo com UI burlada.
- [ ] **CA-005:** Campos agrupados por seção na ordem do spec, com chip da célula e badge "override" conforme protótipo.
- [ ] **CA-006:** Warnings não bloqueiam o avanço (banner âmbar "pode seguir mesmo assim").

## 6. Plano de Testes

### 6.1 Testes Unitários
`effective-values.ts` (montagem por seção, integração com `resolveFieldValue`); lógica de
contadores de pendências.

### 6.2 Testes de Integração
`setOverride`: persistência, auditoria, revalidação; `confirmData`: bloqueio servidor.

### 6.3 Testes de Aceitação
E2E do CA-001 (fluxo do protótipo: "Data do survey" vazia → preencher → liberar).

### 6.4 Casos de Borda (Edge Cases)
- Override com valor vazio sobre campo `required` → erro reaparece.
- Override igual ao valor extraído (ainda registra override? Decisão: sim, auditado — operador confirmou explicitamente).
- Campo `date` com formato inválido digitado → issue de coerção exibida.
- Spec com seção sem nenhum campo da variante ativa → seção omitida.

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Revalidação divergir da validação original do motor | Média | Alto | Reusar exatamente `validate.ts` da 003 sobre valores efetivos; teste comparativo |
| UI permitir avanço com erro por race | Baixa | Alto | CA-004: bloqueio também no servidor |
| Inputs genéricos para tipos diversos (date/enum/number) | Média | Médio | Input por tipo do campo no spec (date picker, select de enum, número com decimais) |

## 8. Dependências

### 8.1 Dependências Internas
**003** (issues, `resolveFieldValue`, revalidação), **005** (auth, shell, máquina de estados,
relatório chegando em `extracted`/`in_review`).

### 8.2 Dependências Externas
Nenhuma nova. Nenhum insumo do cliente bloqueia.

## 9. Observações e Decisões de Design

- **Tela de design vinculada:** 04 Revisão — `design/naabsa-survey/project/Naabsa Protótipo.dc.html`
  (seção `isReview`): header com badge "Em revisão" e legenda `override ?? extraído` em mono;
  cards por seção; linha de campo com chip mono da célula, badge azul "override", input mono
  com borda colorida por nível de issue; issues inline (tag ERRO vermelha / AVISO âmbar);
  painel lateral "Pendências" com cards de erro bloqueante (vermelho), aviso (âmbar) e
  sucesso (verde); botão "Confirmar dados →" desabilitado cinza / habilitado navy.
  Board estático `Naabsa Relatórios.dc.html`, tela 04, para estados visuais.
- A mensagem de exemplo do PRD (RF-08) é o caso demo do protótipo: `"Campo 'Data do survey' vazio na célula B7"`.

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
