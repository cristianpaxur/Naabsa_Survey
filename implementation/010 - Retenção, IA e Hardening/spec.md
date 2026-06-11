# Retenção, IA e Hardening

> **ID:** 010
> **Status:** 🟡 Planejada
> **Prioridade:** 🟡 Média
> **Criada em:** 2026-06-11
> **Última atualização:** 2026-06-11
> **Autor:** Agente AI

---

## 1. Resumo Executivo

Fechar o M4 do PRD: job diário de retenção (purga de blobs aos 30 dias preservando PDF e
dados), tela de histórico (timeline do audit_log), regeneração versionada de PDF, os dois
recursos de IA atrás da flag `AI_ENABLED` (revisão de dados extraídos e sugestão de
slots/qualidade de fotos — sempre como sugestão confirmável) e o hardening final com
checklist de deploy no VPS.

## 2. Contexto e Motivação

### 2.1 Problema Atual
Com o M3 fechado, o produto opera os 5 tipos — mas acumula blobs indefinidamente (custo de
storage), não expõe a trilha de auditoria ao operador, não permite corrigir um PDF gerado,
não tem as sugestões de IA previstas e nunca passou por hardening de produção.

### 2.2 Impacto do Problema
Storage cresce sem limite (30–50 relatórios/mês com fotos pesadas); RNF-07 (auditabilidade)
fica invisível sem a tela de histórico; operador sem "Regenerar" precisaria recriar o
relatório; deploy sem hardening viola RNF-05.

### 2.3 Soluções Consideradas

| Solução | Prós | Contras | Decisão |
|---------|------|---------|---------|
| IA via API Anthropic só como sugestões flag-gated (PRD) | RNF-06 garantido; operador decide | Valor de IA limitado a sugestões | ✅ Escolhida |
| IA inline no fluxo crítico | Mais automação | Viola princípios nº 1/3 e RNF-06 | ❌ Descartada |
| Purga total (incluindo PDF) aos 30 dias | Storage mínimo | PRD manda MANTER PDF e dados | ❌ Descartada |

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura
Quatro frentes independentes sobre a base existente:
1. **Retenção:** job diário `retention_purge` (pg-boss cron) → `generated` há > 30 dias →
   apaga fotos (originais/processadas/thumbs) e planilha do Storage → mantém PDF(s) e dados →
   `purged` + `purged_at`.
2. **Histórico:** `/reports/[id]/history` renderiza o audit_log cronológico legível.
3. **Regenerar:** em `generated`, voltar a `editing` mantendo `document_json`; novo ciclo
   gera `final-v{n}.pdf` versionado em `pdf_paths[]`.
4. **IA (flag `AI_ENABLED`):** job `ai_review` pós-extração (dados extraídos + metadados →
   warnings origem `ai` na revisão) e classificação de fotos pós-processamento (sugere
   `slot_id` + flags `dark`/`blurry`/`possible_duplicate`, pré-aloca com `ai_suggested=true`).
   Falha/timeout de IA nunca bloqueia. Toda chamada auditada (`ai_call`).
5. **Hardening:** rate limit de upload, headers de segurança, backup check, README de
   operação, deploy validado no VPS.

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|-----------|------|------|-----------|
| `apps/worker/src/jobs/retentionPurge.ts` | Arquivo | Modificar | Job diário de purga (RF-31) |
| `apps/web/app/(app)/reports/[id]/history/page.tsx` | Arquivo | Criar | Tela 08 — timeline do audit_log (RF-33) |
| `apps/web/lib/actions/regenerate.ts` | Arquivo | Criar | `generated → editing`; PDF versionado (RF-30) |
| `apps/worker/src/jobs/aiReview.ts` | Arquivo | Modificar | Job `ai_review` (RF-36) |
| `apps/worker/src/jobs/processPhoto.ts` | Arquivo | Modificar | Encadear classificação de fotos com IA (RF-37) |
| `apps/worker/src/lib/anthropic.ts` | Arquivo | Criar | Cliente da API Anthropic + auditoria `ai_call` (RF-38) |
| `apps/web/components/photos/AiBanner.tsx` | Arquivo | Criar | Banner de sugestões + confirmação (liga o que a 007 preparou) |
| `apps/web/middleware.ts` / headers | Arquivo | Modificar | Headers de segurança, rate limit de upload (T-28) |
| `docs/OPERACAO.md` | Arquivo | Criar | README de operação + checklist de deploy |

### 3.3 Interfaces e Contratos

#### Entradas
- Cron diário (pg-boss schedule) para `retention_purge`.
- `AI_ENABLED` + `ANTHROPIC_API_KEY` (PRD §13).
- IA recebe: dados extraídos + metadados do spec (nunca a planilha bruta); fotos só na versão processada (RF-38).

#### Saídas
- Relatórios `purged` com `purged_at`, PDFs e dados preservados.
- Warnings origem `ai` em `extraction_issues`/revisão; pré-alocações `ai_suggested=true` + `quality_flags`.
- `final-v{n}.pdf` adicionais em `pdf_paths[]`, `document_hash` atualizado.
- `audit_log`: `ai_call` (finalidade + duração), purgas, regenerações.

#### Contratos de API (se aplicável)
API Anthropic (modelo com visão) via `apps/worker/src/lib/anthropic.ts` com timeout curto e
retry limitado; prompts versionados no código. Server Action `regenerate(reportId)`.

### 3.4 Modelos de Dados (se aplicável)
Sem mudança de schema — usa `purged_at`, `pdf_paths[]`, `quality_flags`, `ai_suggested`,
`confirmed_by` já criados na 002.

### 3.5 Fluxo de Execução
1. **Purga:** cron diário seleciona `generated` com `created_at` (do PDF) > 30 dias → remove blobs → `purged` → audita.
2. **Histórico:** página renderiza audit_log com hora, ator (operador/sistema/worker), ação e detalhe legível (como no protótipo).
3. **Regenerar:** `generated → editing` (máquina de estados estendida se necessário) mantendo doc → editar → aprovar → worker gera `final-v{n}.pdf`.
4. **ai_review:** pós-extração (se flag on) → warnings `ai` aparecem na revisão como as demais (006 já renderiza).
5. **Fotos IA:** pós-processamento do lote → classificação → pré-alocação `ai_suggested` → banner na tela 05 → confirmar zera a flag (`confirmed_by`).
6. **Hardening:** aplicar limites/headers → checklist → deploy compose no VPS → smoke test E2E.

### 3.6 Tratamento de Erros
- IA fora do ar/timeout: fluxo segue idêntico ao `AI_ENABLED=false` (RNF-06); falha auditada.
- Purga parcial (blob já ausente): idempotente — segue e completa; nunca purga não-`generated`.
- Regenerar simultâneo à edição de outra pessoa: revalidação de status na action.
- Rate limit excedido: 429 com mensagem pt-BR.

## 4. Requisitos

### 4.1 Requisitos Funcionais
Derivados do PRD (tarefas T-24..T-28):

- **RF-001 (PRD RF-31):** Job diário: `generated` > 30 dias → apagar fotos+planilha do Storage, MANTER PDF(s) e dados, status `purged` + `purged_at`.
- **RF-002 (PRD RF-33):** Tela de histórico com audit_log em ordem cronológica legível.
- **RF-003 (PRD RF-30):** Regenerar em `generated`: volta a `editing` mantendo `document_json`; novo PDF `final-v{n}.pdf`.
- **RF-004 (PRD RF-36):** `ai_review` pós-extração envia SOMENTE dados extraídos + metadados; retorno vira warnings origem `ai`; falha não bloqueia.
- **RF-005 (PRD RF-37):** Classificação de fotos sugere `slot_id` + flags (`dark`, `blurry`, `possible_duplicate`); pré-aloca `ai_suggested=true`; confirmação zera a flag.
- **RF-006 (PRD RF-38):** Toda chamada de IA auditada (`ai_call`, finalidade, duração); nunca enviar planilha bruta nem fotos originais.
- **RF-007 (PRD T-28):** Rate limit de upload, headers de segurança, backup check, README de operação.

### 4.2 Requisitos Não-Funcionais
- **RNF-001 (PRD RNF-06):** Com `AI_ENABLED=false` ou IA caída, fluxo 100% funcional.
- **RNF-002 (PRD RNF-05):** Headers de segurança; secrets via env; checklist de deploy concluído no VPS.
- **RNF-003 (PRD RNF-07):** Histórico responde "o que veio da planilha, o que foi editado, por quem e quando".
- **RNF-004 (PRD RNF-08):** Cargas de IA e purga dentro do orçamento de RAM do VPS.

### 4.3 Restrições e Limitações
- IA é Fase 4 e 100% atrás de flag — nenhum caminho crítico pode depender dela.
- Deploy final bloqueado pelo acesso ao VPS (PRD §15, insumo interno).
- Modelo de visão da API Anthropic definido por env/config — usar o modelo vigente mais
  adequado na época da implementação (consultar doc da API antes; não fixar no spec).

## 5. Critérios de Aceitação

- [ ] **CA-001:** Fixture retroativa purga blobs e preserva PDF + dados (aceite do PRD T-24).
- [ ] **CA-002:** Tela de histórico exibe a timeline completa de um relatório `generated` (RF-33).
- [ ] **CA-003:** Regenerar produz `final-v2.pdf` com hash atualizado (aceite do PRD T-25).
- [ ] **CA-004:** Com IA off, fluxo idêntico; com IA on, warnings `ai` na revisão (aceite do PRD T-26).
- [ ] **CA-005:** Pré-alocação marcada `ai_suggested`; confirmação zera a flag (aceite do PRD T-27).
- [ ] **CA-006:** Nenhuma chamada de IA sem linha `ai_call` no audit_log; payloads conformes ao RF-38 (inspeção de código + teste).
- [ ] **CA-007:** Checklist de deploy concluído no VPS com smoke test E2E (aceite do PRD T-28 — bloqueado por acesso).

## 6. Plano de Testes

### 6.1 Testes Unitários
Seleção de relatórios elegíveis à purga (janela 30d); parser/validador das respostas de IA;
versionamento `final-v{n}`.

### 6.2 Testes de Integração
Purga com Storage local (blobs somem, PDF fica); `ai_review` com cliente mockado (on/off/timeout);
classificação de fotos mockada → pré-alocação → confirmação.

### 6.3 Testes de Aceitação
CA-001..CA-006 entre integração e E2E; CA-007 manual no VPS com checklist.

### 6.4 Casos de Borda (Edge Cases)
- Relatório `generated` re-editado no dia 29 (regenerado → nova janela de 30 dias? Decisão: janela conta do último PDF gerado — documentar).
- Resposta de IA malformada/alucinada (slot inexistente) → descartada com warning auditado, sem pré-alocação inválida.
- Purga rodando durante download de PDF (PDF preservado — sem conflito).
- Duas regenerações seguidas sem editar (v3 idêntica à v2 — permitido, hash igual registrado).

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Purga apagar blob errado | Baixa | Alto | Seleção testada com fixtures; dry-run logado antes do delete em produção |
| Custo/latência de IA com fotos | Média | Médio | Sempre versão processada (menor); timeout curto; flag por recurso |
| Sugestões de IA ruins minarem confiança | Média | Médio | Tudo é sugestão confirmável (princípio nº 3); flags visíveis |
| VPS subdimensionado no deploy real | Média | Alto | Checklist mede RAM/CPU sob carga antes do go-live |

## 8. Dependências

### 8.1 Dependências Internas
**008** (fluxo completo: histórico/regenerar/IA operam sobre ele). A tela 05 da **007** já
renderiza `ai_suggested`/`quality_flags` (forward-compatible) — aqui só liga o banner e o backend.

### 8.2 Dependências Externas
API Anthropic (`ANTHROPIC_API_KEY`); pg-boss cron. Insumo interno (PRD §15): **acesso ao
VPS** — bloqueia apenas o deploy final (CA-007).

## 9. Observações e Decisões de Design

- **Telas de design vinculadas** (`design/naabsa-survey/project/Naabsa Protótipo.dc.html`):
  - **08 Histórico** (`isHistory`): timeline com hora mono, ponto colorido por tipo de ação
    (criação navy, upload azul, sistema rocha, edição âmbar, foto verde, status vermelho),
    ação + chip do ator, detalhe em mono (ex.: `"Porto: 'Tubarao' → 'Tubarão (Vitória)' (B6)"`).
  - **05 Fotos — banner IA** (`hasAiPending`): banner navy "N fotos pré-alocadas pela IA",
    texto "Confirme ou mova — a confirmação zera a flag. Nada é decidido sem você.",
    botão branco "Confirmar todas"; badge "sugestão IA" e botão "Confirmar sugestão" por slot.
  - **07 Preview** (`isPreview`): botão "Regenerar" na barra navy (volta a `editing`).
  - Board estático `Naabsa Relatórios.dc.html`, telas 05/07/08.
- O grafo de estados do PRD §3.2 não prevê `generated → editing` explicitamente, mas o
  RF-30 o exige — atualizar o módulo `state-machine.ts` (005) e registrar a extensão do
  grafo nesta spec quando implementada (transição auditada própria, ex.: action `regenerate`).
- Acessibilidade do histórico via dashboard (protótipo só alcança por relatório purgado) —
  adicionar entrada de menu/ação por linha, decisão de UI a validar com o usuário.

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
