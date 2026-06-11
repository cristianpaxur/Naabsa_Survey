# Demais Relatórios e Admin de Specs

> **ID:** 009
> **Status:** 🟡 Planejada
> **Prioridade:** 🟠 Alta
> **Criada em:** 2026-06-11
> **Última atualização:** 2026-06-11
> **Autor:** Agente AI

---

## 1. Resumo Executivo

Provar a abstração do motor: adicionar os 4 tipos de relatório restantes (spec + conteúdo do
builder + fixtures + golden tests) **sem alterar `packages/core` fora de
`document-builder/content/` e specs**, e entregar a tela de administração de specs (listagem
por tipo, nova versão por JSON validado, ativação de versão) com imutabilidade garantida.

## 2. Contexto e Motivação

### 2.1 Problema Atual
Até a 008, o sistema processa apenas o primeiro tipo de relatório. Os outros 4 (dos 5 do
PRD §3.1) não têm spec, conteúdo nem golden test. Specs só existem via seed/SQL — sem UI
de administração, o admin não consegue evoluí-los.

### 2.2 Impacto do Problema
O valor do produto é automatizar os **5** tipos. O aceite do M3 é o teste real do princípio
inviolável nº 2 (motor genérico): se adicionar um tipo exigir mudar o motor, a arquitetura
falhou e o custo de cada relatório futuro explode.

### 2.3 Soluções Consideradas

| Solução | Prós | Contras | Decisão |
|---------|------|---------|---------|
| Tipos novos = dados (spec + content) + golden test (PRD M3) | Prova a abstração; motor intacto | Depende de insumos do cliente | ✅ Escolhida |
| Codificar particularidades por tipo no motor | Atalhos pontuais | Viola princípio nº 2; reprova o aceite do M3 | ❌ Descartada |
| Editor visual de spec (form builder) | UX rica p/ admin | Overkill p/ 1–3 usuários; PRD pede colar JSON validado | ❌ Descartada |

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura
Para cada tipo restante (entre: `draft_survey`, `bunker_surveyor`, `msc`, `on_off_hire`,
`rob`, excluído o tipo 1 da 003/004): spec JSONB versionado + `document-builder/{slug}.ts`
fino + `content/{slug}.{variant}.ts` (texto dos modelos Word) + fixture de planilha +
golden test. Caso crítico: `on_off_hire`, cuja variante muda texto **e** mapeamento de
dados (`by_variant`). Admin de specs em `/admin/specs` (rota admin-only): lista tipos e
versões, nova versão por colagem de JSON validada com `validateSpec` (003) antes de salvar,
ativação atualiza `report_types.active_spec_id`.

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|-----------|------|------|-----------|
| `tests/fixtures/specs/<slug>.v1.json` ×4 | Arquivo | Criar | Specs reais dos 4 tipos restantes |
| `packages/core/src/document-builder/<slug>.ts` ×4 | Arquivo | Criar | Builders finos por tipo |
| `packages/core/src/document-builder/content/<slug>.<variant>.ts` | Arquivo | Criar | Texto estático por tipo×variante (modelos Word) |
| `tests/golden/<slug>.<variant>/` (todas as combinações) | Pasta | Criar | input.xlsx, photos/, expected.pdf |
| `apps/web/app/(app)/admin/specs/page.tsx` | Arquivo | Criar | Tela 09 — listagem, editor JSON, ativação |
| `apps/web/lib/actions/specs.ts` | Arquivo | Criar | `createSpecVersion` (validada), `activateSpec` |
| `apps/web/components/admin/SpecEditor.tsx` | Arquivo | Criar | Editor JSON com indicador válido/inválido |

### 3.3 Interfaces e Contratos

#### Entradas
- Specs JSON colados pelo admin (validados por `validateSpec` antes de salvar — RF-34).
- Planilhas pré-moldadas reais + modelos Word dos 4 tipos (insumo do cliente).

#### Saídas
- 5 tipos × variantes com golden tests verdes.
- Nova versão de spec inserida imutável; ativação por tipo (`active_spec_id`).

#### Contratos de API (se aplicável)
Server Actions admin-only: `createSpecVersion(typeId, json)` → erros de validação pt-BR
exibíveis; `activateSpec(typeId, specId)` → auditado.

### 3.4 Modelos de Dados (se aplicável)
Sem mudança de schema. Versionamento: `version = max(version)+1` por tipo; updates negados
(002). Relatórios existentes mantêm `spec_id` congelado (RF-05) — ativação não os afeta.

### 3.5 Fluxo de Execução
1. Por tipo restante: escrever spec → validar → fixture de planilha real → extração limpa → builder + content → snapshot do JSON → golden test do PDF.
2. `on_off_hire`: validar as duas variantes com mapeamentos de dados distintos (delivery_date vs redelivery_date — PRD §8).
3. Admin: lista specs por tipo/versão → cola JSON da nova versão → `validateSpec` → salva imutável → ativa → relatórios novos usam a nova; antigos intactos.

### 3.6 Tratamento de Erros
- JSON inválido na UI: erros do `validateSpec` exibidos inline (indicador vermelho), salvar bloqueado (RF-34).
- Ativação de spec de outro tipo: rejeitada (FK + verificação na action).
- Golden test que exigiria mudar o motor: **parar e reavaliar** — sinaliza quebra da abstração; registrar a dúvida antes de tocar em `packages/core` (regra do PRD).
- Não-admin acessando `/admin/specs`: bloqueado por middleware + RLS.

## 4. Requisitos

### 4.1 Requisitos Funcionais
Derivados do PRD (tarefas T-19..T-23):

- **RF-001 (PRD T-19..T-22):** Para cada um dos 4 tipos restantes: spec + conteúdo do builder + fixtures + golden test, exercitando RF-05..RF-10 e RF-20 do PRD. **[BLOQUEADO por insumos — PRD §15]**
- **RF-002 (PRD §3.1):** `on_off_hire` cobre variantes com texto E mapeamento de dados distintos; `draft_survey`/`bunker_surveyor` cobrem variantes só de texto; `msc`/`rob` sem variante.
- **RF-003 (PRD RF-34):** Admin lista specs por tipo com versões; nova versão por JSON validado contra o schema antes de salvar; ativação de uma versão por tipo.
- **RF-004 (PRD RF-35):** Imutabilidade pós-criação confirmada de ponta a ponta (UI → RLS).

### 4.2 Requisitos Não-Funcionais
- **RNF-001 (aceite M3):** Nenhuma alteração em `packages/core` fora de `document-builder/content/` e specs — verificado por diff na PR.
- **RNF-002 (PRD RNF-02):** Golden tests dos 5 tipos verdes (≤ 0,5% pixels).
- **RNF-003 (PRD RNF-09):** Mensagens de validação de spec em pt-BR na UI.

### 4.3 Restrições e Limitações
- Totalmente dependente dos insumos do cliente (modelos Word + planilhas reais de cada tipo) — a parte de admin (RF-003/004) NÃO depende e pode ser feita primeiro.
- Gestão de usuários pelo admin não é escopo (fora do RF-34).

## 5. Critérios de Aceitação

- [ ] **CA-001:** Golden tests dos 5 tipos (todas as variantes) verdes no CI (aceite do PRD M3).
- [ ] **CA-002:** Diff das PRs dos 4 tipos não toca `packages/core` fora de `content/`+specs (aceite do PRD T-19..T-22).
- [ ] **CA-003:** Spec inválido é rejeitado na UI com mensagens claras; válido salva e aparece versionado (aceite do PRD T-23).
- [ ] **CA-004:** Ativar nova versão não altera relatório existente (`spec_id` congelado — verificado por teste).
- [ ] **CA-005:** `on_off_hire` extrai campos diferentes por variante conforme `by_variant`.
- [ ] **CA-006:** Acesso a `/admin/specs` negado para operator.

## 6. Plano de Testes

### 6.1 Testes Unitários
Snapshot do JSON TipTap de cada builder×variante; `createSpecVersion` (validação, incremento de versão).

### 6.2 Testes de Integração
Extração das planilhas reais dos 4 tipos sem issues inesperadas; ativação de spec + criação de relatório usando a nova versão.

### 6.3 Testes de Aceitação
Golden tests (CA-001); E2E do admin: colar inválido → erro; colar válido → ativar → criar relatório novo com a versão ativa.

### 6.4 Casos de Borda (Edge Cases)
- Spec novo com campo a mais/a menos que a planilha real (issues claras, não crash).
- Duas versões ativadas em sequência rápida (última vence, auditado).
- Tipo sem variante com `variants: []` no spec (validador aceita; builder ignora `by_variant`).
- JSON gigante/malformado colado na UI (parser protege; mensagem amigável).

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Um tipo real não caber na abstração do spec | Média | Alto | Detectar no 1º spec do tipo; estender o **schema** (003) versionado, nunca hardcode no motor |
| Insumos do cliente atrasarem em bloco | Alta | Alto | Admin (T-001..T-003) independe; especificar tipos na ordem em que os insumos chegarem |
| Golden tests dos 5 tipos lentos no CI | Média | Baixo | Rodar matriz em paralelo; gatilho por path (core/templates/CSS) |

## 8. Dependências

### 8.1 Dependências Internas
**004** (padrão de builder/golden), **008** (fluxo completo para validar cada tipo de ponta
a ponta), **003** (`validateSpec` para a UI do admin).

### 8.2 Dependências Externas
Insumos do cliente (PRD §15): **modelos Word + exemplos preenchidos de todas as variantes**
e **planilhas pré-moldadas reais de cada tipo** — bloqueiam RF-001/RF-002 (não o admin).

## 9. Observações e Decisões de Design

- **Tela de design vinculada:** 09 Admin specs — `design/naabsa-survey/project/Naabsa Protótipo.dc.html`
  (seção `isAdmin`): lista lateral de tipos com versão ativa (badge verde "vN ativa") e
  contagem de versões em mono; painel com editor JSON dark (tema navy `#11203B`, syntax
  highlighting), indicador "JSON válido" (verde) / erros de validação, pills de versão,
  botão navy "Salvar & ativar vN" e nota "Specs são imutáveis após salvar".
  Board estático `Naabsa Relatórios.dc.html`, tela 09.
- Ordem interna recomendada: admin primeiro (desbloqueado), depois um tipo por vez conforme
  os insumos chegarem — cada tipo é um PR isolado cujo diff prova o RNF-001.

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
