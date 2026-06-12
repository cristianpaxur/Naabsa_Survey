# Autenticação, Dashboard e Criação de Relatórios

> **ID:** 005
> **Status:** 🟢 Concluída
> **Prioridade:** 🟠 Alta
> **Criada em:** 2026-06-11
> **Última atualização:** 2026-06-12
> **Autor:** Agente AI

---

## 1. Resumo Executivo

Implementar a entrada do operador no sistema: login via Supabase Auth com papéis
(operator/admin), dashboard com listagem/filtros/busca de relatórios, wizard de criação
(tipo → variante → upload da planilha) e a máquina de estados do relatório com auditoria
de transições. Ao final, um relatório criado chega ao estado `extracted` de ponta a ponta.

## 2. Contexto e Motivação

### 2.1 Problema Atual
O motor (003) existe como biblioteca, mas não há como um operador autenticar, ver a fila de
trabalho, criar um relatório nem subir a planilha que alimenta a extração.

### 2.2 Impacto do Problema
Sem este fluxo de entrada, nenhuma tela subsequente (revisão 006, fotos 007, editor 008) tem
relatórios para operar. A máquina de estados aqui implementada é o guarda-corpo de TODO o ciclo.

### 2.3 Soluções Consideradas

| Solução | Prós | Contras | Decisão |
|---------|------|---------|---------|
| Supabase Auth e-mail/senha + profiles com papel (PRD) | Stack fixa; RLS já preparada na 002 | — | ✅ Escolhida |
| Provedor externo (Auth0/Clerk) | Features extras | Fora da stack fixa; custo | ❌ Descartada |
| Máquina de estados por trigger no banco | Garantia no nível mais baixo | PRD T-13 coloca na aplicação; triggers dificultam mensagens pt-BR e auditoria rica | ❌ Descartada |

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura
Next.js App Router: grupo `(auth)/login` público; grupo `(app)/*` protegido por middleware
que valida sessão + papel (profiles). Server Actions para mutações simples (criar relatório,
transicionar status); Route Handler para upload da planilha (stream, máx. 20 MB). Módulo
`lib/state-machine.ts` único ponto de transição de status (grafo do PRD §3.2), sempre
gravando `audit_log`.

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|-----------|------|------|-----------|
| `apps/web/app/(auth)/login/page.tsx` | Arquivo | Criar | Tela 01 — login e-mail/senha com erros claros |
| `apps/web/middleware.ts` | Arquivo | Criar | Proteção de rotas + papel (RF-02) |
| `apps/web/lib/supabase/{client,server}.ts` | Arquivo | Criar | Clientes Supabase (browser/server) |
| `apps/web/app/(app)/dashboard/page.tsx` | Arquivo | Criar | Tela 02 — tabela, filtros, busca, badges |
| `apps/web/app/(app)/reports/new/page.tsx` | Arquivo | Criar | Tela 03 — wizard tipo → variante → upload |
| `apps/web/app/api/reports/[id]/spreadsheet/route.ts` | Arquivo | Criar | Upload .xlsx (20 MB) + disparo da extração |
| `apps/web/lib/state-machine.ts` | Arquivo | Criar | Transições válidas + audit_log (PRD §3.2, RF-32) |
| `apps/web/lib/audit.ts` | Arquivo | Criar | Helper único de escrita no audit_log |
| `apps/web/components/ui/*` | Arquivo | Criar | Badge de status, inputs, botões (tokens do design) |
| `tests/e2e/{login,create-report}.spec.ts` | Arquivo | Criar | E2E Playwright |

### 3.3 Interfaces e Contratos

#### Entradas
- Login: e-mail/senha (Supabase Auth).
- Dashboard: filtros tipo/status/período + busca por navio (query params).
- Wizard: `report_type_id`, `variant` (obrigatória se o tipo tiver variantes), arquivo `.xlsx` ≤ 20 MB.

#### Saídas
- Sessão autenticada com papel resolvido.
- Relatório criado em `draft` com `spec_id` **congelado** no spec ativo do momento (RF-05).
- Pós-upload: extração executada (motor da 003), `extracted_data`/`extraction_issues`
  persistidos (imutáveis — RF-10), `vessel_name` denormalizado, status `draft → extracted`.

#### Contratos de API (se aplicável)
- `POST /api/reports/[id]/spreadsheet` — multipart; 413 acima de 20 MB; 415 se não-xlsx;
  422 com issues de fingerprint; 200 com resumo `{ fields, errors, warnings }`.
- Server Actions: `createReport(typeId, variant)`, `transition(reportId, to)`.

### 3.4 Modelos de Dados (se aplicável)
Usa tabelas da 002 sem alterações. Grafo de estados (PRD §3.2):
`draft→extracted→in_review→editing→approved→generated→purged`, com retorno
`qualquer (exceto generated/purged) → draft` (reiniciar com nova planilha). Toda transição
fora do grafo é rejeitada com erro pt-BR e NÃO audita transição (audita a tentativa rejeitada).

### 3.5 Fluxo de Execução
1. Operador faz login (tela 01); middleware resolve papel; sem papel → acesso negado.
2. Dashboard (tela 02) lista relatórios com filtros/busca; clique abre o relatório na etapa correspondente ao status.
3. "Novo relatório" (tela 03): seleciona tipo → se houver variantes, escolhe (obrigatório) → cria relatório `draft` com `spec_id` congelado.
4. Upload da planilha com barra de progresso → extração síncrona ou job curto → persiste resultado → `extracted` → redireciona para a revisão (006).
5. Cada criação, upload e transição gera linha no `audit_log` (RF-32).

### 3.6 Tratamento de Erros
- Credenciais inválidas/campos vazios: mensagem clara na tela (como no protótipo: banner vermelho).
- Usuário sem papel: bloqueado pelo middleware com página de acesso negado.
- Upload > 20 MB ou não-xlsx: rejeição imediata com mensagem pt-BR.
- Fingerprint incompatível: exibe o erro do motor (RF-09) e mantém `draft` para novo upload.
- Transição inválida: erro explícito; estado não muda; tentativa auditada.

## 4. Requisitos

### 4.1 Requisitos Funcionais
Derivados do PRD (tarefas T-11..T-13):

- **RF-001 (PRD RF-01):** Login e-mail/senha via Supabase Auth; sem cadastro público.
- **RF-002 (PRD RF-02):** Papéis operator/admin enforçados por middleware + RLS (002).
- **RF-003 (PRD RF-03):** Dashboard com tipo, variante, navio, status, data, autor; filtros tipo/status/período; busca por navio.
- **RF-004 (PRD RF-04):** Wizard: tipo → variante obrigatória (se houver) → upload .xlsx máx. 20 MB com barra de progresso.
- **RF-005 (PRD RF-05):** `reports.spec_id` congela o spec ativo na criação.
- **RF-006 (PRD RF-10):** `extracted_data` persistido e imutável; correções só via `operator_overrides`.
- **RF-007 (PRD §3.2/T-13):** Máquina de estados com rejeição de transições inválidas.
- **RF-008 (PRD RF-32):** Auditoria de criação, upload, resultado de extração (resumo) e toda transição.

### 4.2 Requisitos Não-Funcionais
- **RNF-001 (PRD RNF-05):** Planilha no Storage só por URL assinada (≤ 10 min); sem acesso público.
- **RNF-002 (PRD RNF-03):** Extração < 5 s (planilha ≤ 5 MB) — UX do wizard prevê spinner "Extraindo…".
- **RNF-003 (PRD RNF-09):** UI 100% pt-BR.

### 4.3 Restrições e Limitações
- Criação de usuários por admin fora da UI (painel Supabase) — gestão de usuários na UI não é escopo desta implementação.
- Filtro por período (RF-03) entra como filtro de data simples; relatórios por página seguem padrão único (sem preferências por usuário).

## 5. Critérios de Aceitação

- [x] **CA-001:** E2E de login: sucesso, erro de credencial e acesso negado sem papel (aceite do PRD T-11). — `tests/e2e/login.spec.ts` (5 casos verdes ao vivo): rota protegida→login, credencial inválida, campos vazios, login feliz→dashboard, usuário sem papel→`/acesso-negado`.
- [x] **CA-002:** E2E: criar relatório (tipo com e sem variante) chega a `extracted` (aceite do PRD T-12). — `tests/e2e/create-report.spec.ts`: `draft_survey`/Descarga e `rob` (sem variante) chegam a `extracted`.
- [x] **CA-003:** Transições inválidas rejeitadas com erro; log gravado (aceite do PRD T-13). — `apps/web/lib/state-machine.test.ts` (tabela 7×7; tentativa inválida auditada).
- [x] **CA-004:** Dashboard filtra por tipo/status/período e busca por navio; badge de cada um dos 7 estados com as cores do design system. — Implementado server-side (query params) em `dashboard/page.tsx`; `StatusBadge` com as cores exatas do `statusMap`. Conformidade visual conferida com o board; sem E2E dedicado de UI (decisão: verificação visual + render server-side com dados reais).
- [x] **CA-005:** Variante obrigatória bloqueia o avanço do wizard quando não selecionada. — `create-report.spec.ts` ("variante obrigatória bloqueia o avanço"): "Continuar" desabilitado até escolher a variante.
- [x] **CA-006:** `spec_id` do relatório não muda quando o admin ativa nova versão de spec depois. — Garantido por construção: `createReport` congela `active_spec_id` no INSERT e o app nunca reescreve `reports.spec_id` (RF-05). `report_specs` é imutável (trigger da 002). Regressão dedicada de reativação fica para a 009 (Admin de Specs), onde a UI de ativação existe.
- [x] **CA-007:** Trilha de auditoria completa para um relatório recém-criado (criação, upload, extração, transição). — `create-report.spec.ts` verifica `audit_log` com `create`, `upload`, `extraction` e `transition`.

## 6. Plano de Testes

### 6.1 Testes Unitários
`state-machine.ts`: tabela exaustiva de transições válidas/ inválidas (7×7); helpers de filtro do dashboard.

### 6.2 Testes de Integração
Upload handler com arquivos: válido, > 20 MB, não-xlsx, fingerprint errado; verificação de persistência (`extracted_data`, issues, `vessel_name`).

### 6.3 Testes de Aceitação
E2E Playwright (CA-001, CA-002) contra o projeto Supabase hosted; CA-003..CA-007 entre unit/integração/E2E.

### 6.4 Casos de Borda (Edge Cases)
- Reiniciar relatório (`→ draft`) com nova planilha: `extracted_data` anterior preservado? (PRD: novo upload gera novo resultado; decisão: sobrescrever ao reiniciar é o ÚNICO caso permitido, auditado). **Verificação:** transições `* → draft` cobertas pela tabela 7×7 (`state-machine.test.ts`); o reupload sobrescreve `extracted_data` no route handler (003 é puro/determinístico).
- Dois uploads simultâneos no mesmo relatório (lock otimista; segundo falha com mensagem). **Verificação:** `transition()` usa guarda otimista (`update ... { count: 'exact' }`) — a segunda transição `draft→extracted` não encontra a linha em `draft` e falha. Coberto pela lógica de `state-machine.ts`.
- Sessão expirada no meio do wizard (redirect a login sem perder o relatório `draft`). **Verificação:** middleware sem sessão → `/login` (E2E "rota protegida sem sessão"); o relatório `draft` permanece no banco e reaparece no dashboard.
- Tipo sem variantes pula a etapa de variante (msc, rob). **Verificação:** E2E `rob` (sem variante) em `create-report.spec.ts`.

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Extração síncrona estourar timeout de request | Média | Médio | Limite 5 s do RNF; fallback: extração em job rápido + polling do wizard |
| Middleware deixar rota desprotegida | Baixa | Alto | Teste E2E de acesso negado por rota; RLS (002) como segunda linha de defesa |
| Estados divergirem entre UI e máquina | Média | Médio | `state-machine.ts` é o único ponto de transição; UI deriva ações possíveis dele |

## 8. Dependências

### 8.1 Dependências Internas
**002** (schema, RLS, seed, tipos), **003** (extractor, validateSpec, issues).

### 8.2 Dependências Externas
Supabase Auth + Storage; Playwright para E2E. Nenhum insumo do cliente bloqueia.

## 9. Observações e Decisões de Design

- **Telas de design vinculadas** (`design/naabsa-survey/project/Naabsa Protótipo.dc.html` —
  primário; board `Naabsa Relatórios.dc.html`):
  - **01 Login** (`isLogin`): split navy/papel, headline institucional, banner de erro vermelho, rodapé mono "SUPABASE AUTH · TLS".
  - **02 Dashboard** (`isDashboard`): tabela ID/Navio/Tipo·Variante/Status/Atualizado/Autor, busca por navio, dropdowns Tipo/Status, badges dos 7 estados (cores exatas no `statusMap` do protótipo), empty-state "Nenhum relatório corresponde aos filtros.", CTA navy "Novo relatório".
  - **03 Novo relatório** (`isWizard`): stepper 1-Tipo/2-Variante/3-Planilha, cards de tipo com slug mono e contagem de variantes, seleção de variante com badge "obrigatório", dropzone .xlsx 20 MB, barra de progresso animada e botão "Extrair dados" com spinner.
- Sidebar/app shell (logo NAABSA, navegação Relatórios/Novo/Specs, usuário com papel) nasce aqui e é reutilizado por 006–010.
- Roteamento por status ao abrir relatório (como no protótipo `openReport`): extracted/in_review → review; editing → edit; approved/generated → preview; purged → history.

### Decisões para tornar a 005 testável agora (usuário, 2026-06-12)

- **Usuários iniciais via seed script.** `packages/db` ganha um script (service
  role) que provisiona um **operador** e um **admin** de teste com linhas em
  `profiles` (roles corretos), idempotente. É pré-requisito do login e do E2E;
  senhas trocáveis depois. (Gestão de usuários na UI continua fora de escopo.)
- **Spec ativo sintético.** Como a planilha real do cliente está bloqueada
  (003/T-011), o seed também insere um `report_specs` v1 para `draft_survey`
  usando o **spec sintético do 003** (`sampleSpec`, fingerprint `NAABSA-DRAFT`) e
  o ativa (`report_types.active_spec_id`). Assim o fluxo criar→upload→`extracted`
  funciona de verdade. Quando o spec real chegar, ele é ativado via Admin (009) e,
  por RF-05, relatórios antigos mantêm o `spec_id` congelado — sem regressão.
- Para o upload da planilha de teste, reutiliza-se o gerador `buildWorkbook`/
  `buildCompleteWorkbook` do 003 (escrito como `.xlsx` real) como fixture do E2E.

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
