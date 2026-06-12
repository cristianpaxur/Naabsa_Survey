# Banco de Dados, RLS e Seed

> **ID:** 002
> **Status:** 🟢 Concluída
> **Prioridade:** 🔴 Crítica
> **Criada em:** 2026-06-11
> **Última atualização:** 2026-06-11
> **Autor:** Agente AI

---

## 1. Resumo Executivo

Criar as migrations SQL do schema completo do PRD §6 (enum `report_status` + 6 tabelas),
as políticas RLS por papel, a constraint de imutabilidade de `report_specs`, o seed dos
5 `report_types` e os tipos TypeScript gerados do Supabase. Entrega o contrato de dados
que todas as implementações seguintes consomem.

## 2. Contexto e Motivação

### 2.1 Problema Atual
Não existe banco. O domínio (relatórios, specs versionados, fotos, auditoria, papéis) está
definido apenas no PRD §6 e precisa virar schema aplicável em um Supabase limpo.

### 2.2 Impacto do Problema
Sem schema + RLS, nenhum fluxo (auth 005, extração persistida 003/005, fotos 007, auditoria)
pode ser implementado com segurança. RLS incorreta é risco direto de vazamento de dados (RNF-05).

### 2.3 Soluções Consideradas

| Solução | Prós | Contras | Decisão |
|---------|------|---------|---------|
| Migrations SQL versionadas em `packages/db` (PRD §7) | Reprodutível em Supabase limpo; auditável | Escrita manual de SQL | ✅ Escolhida |
| ORM com migrations geradas (Prisma/Drizzle) | DX | Fora da stack fixa do PRD §2; RLS manual de qualquer forma | ❌ Descartada |

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura
Postgres (**Supabase hosted/cloud**) com RLS em todas as tabelas. O web usa `anon key` +
sessão do usuário; o worker usa `service role` (bypass de RLS). Migrations idempotentes e
ordenadas em `packages/db/migrations/`, aplicadas ao **projeto hosted** via Supabase CLI
(`supabase link` + `supabase db push`) ou diretamente via `DATABASE_URL`.

> **Decisão (usuário, 2026-06-11):** no desenvolvimento usamos o **Supabase da nuvem** para
> agilizar; o ambiente **Supabase local (CLI/Docker, `supabase start`)** fica para a fase de
> deploy ao VPS (impl 010). Esta implementação NÃO exige banco local.

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|-----------|------|------|-----------|
| `packages/db/migrations/0001_schema.sql` | Arquivo | Criar | Enum + tabelas do PRD §6 na ordem de dependência |
| `packages/db/migrations/0002_rls.sql` | Arquivo | Criar | Enable RLS + políticas por tabela/papel |
| `packages/db/migrations/0003_constraints.sql` | Arquivo | Criar | Imutabilidade de `report_specs`; FK `report_types.active_spec_id` |
| `packages/db/migrations/0004_seed_report_types.sql` | Arquivo | Criar | Seed dos 5 tipos com slugs/variantes do PRD §3.1 |
| `packages/db/types/database.ts` | Arquivo | Criar | Tipos gerados (`supabase gen types`) |
| `packages/db/tests/rls.test.ts` | Arquivo | Criar | Testes básicos de RLS por papel |

### 3.3 Interfaces e Contratos

#### Entradas
Migrations SQL aplicadas em um projeto Supabase limpo (local CLI ou hosted).

#### Saídas
Schema com: `report_status` (7 estados), `report_types`, `report_specs`, `reports`,
`report_photos`, `audit_log`, `profiles` — exatamente como o DDL de referência do PRD §6 —
e tipos TS exportados por `packages/db`.

#### Contratos de API (se aplicável)
N/A — acesso é via cliente Supabase; não há endpoints próprios nesta implementação.

### 3.4 Modelos de Dados (se aplicável)
DDL integral do PRD §6 (fonte de verdade). Pontos de atenção:
- `report_specs` único por `(report_type_id, version)`; **updates proibidos** (RF-35).
- `reports.operator_overrides` default `'{}'`; `extracted_data` imutável após gravado (enforçado na camada de aplicação na 003/005 + trigger opcional).
- `audit_log.actor` nullable (null = sistema/worker).
- Seed (PRD §3.1): `draft_survey` [loading, discharge], `bunker_surveyor` [loading, discharge], `msc` [], `on_off_hire` [on_hire, off_hire], `rob` [].

### 3.5 Fluxo de Execução
1. `pnpm db:migrate` — runner próprio (`packages/db`, via `pg`) executa as migrations de
   `packages/db/migrations/*.sql` em ordem, em transação, contra `DATABASE_URL` (projeto
   hosted). Migrations idempotentes ⇒ seguras para re-rodar.
2. O seed (0004) insere os 5 `report_types` (`on conflict do nothing`).
3. `pnpm db:types` — `supabase gen types typescript --db-url $DATABASE_URL` atualiza
   `packages/db/types/database.ts`.
4. Testes de RLS rodam contra o **projeto hosted** (via `@supabase/supabase-js` com anon key
   + usuários de teste) validando as matrizes de acesso por papel.

> Mantém as migrations em `packages/db/migrations/` (PRD §7) e é cross-platform (sem depender
> de `psql` no host nem da pasta `supabase/migrations/` exigida pelo `supabase db push`).

### 3.6 Tratamento de Erros
- Migration reaplicada: scripts idempotentes (`if not exists` / guards) ou controle de versão
  do CLI impede dupla aplicação.
- Update em `report_specs`: rejeitado por política/trigger com erro explícito.
- Transição de status fora do grafo: rejeitada na camada de aplicação (005/T-13 do PRD);
  o banco garante apenas o enum.

## 4. Requisitos

### 4.1 Requisitos Funcionais
Derivados do PRD (tarefa T-02):

- **RF-001 (PRD §6):** Schema completo conforme DDL de referência (enum + 6 tabelas, FKs, defaults).
- **RF-002 (PRD RF-02):** Papéis `operator` e `admin` em `profiles`, refletidos nas políticas RLS.
- **RF-003 (PRD RF-35):** `report_specs` imutável após criação (update negado por RLS/constraint).
- **RF-004 (PRD §3.1):** Seed dos 5 `report_types` com slugs e variantes exatos.
- **RF-005 (PRD §6/RLS):** Matriz RLS: `profiles` legível pelo próprio usuário e admin; `reports`/`report_photos`/`audit_log` acessíveis a autenticados com papel; `report_specs`/`report_types` leitura para autenticados, escrita só admin.

### 4.2 Requisitos Não-Funcionais
- **RNF-001 (PRD RNF-05):** RLS habilitada em TODAS as tabelas; nenhuma tabela pública.
- **RNF-002 (PRD RNF-07):** `audit_log` com `actor`, `action`, `payload`, `created_at` suportando a trilha completa de auditoria.

### 4.3 Restrições e Limitações
- Não alterar nomes/estruturas do DDL do PRD §6 sem atualizar o PRD primeiro.
- Criação de usuários é por admin (RF-01 do PRD) — não há fluxo de signup; o seed NÃO cria usuários (feito manualmente no painel Supabase ou na 005).

## 5. Critérios de Aceitação

- [x] **CA-001:** Migrations aplicam no projeto Supabase hosted via `supabase db push` sem erro (aceite do PRD T-02).
- [x] **CA-002:** Seed resulta em exatamente 5 `report_types` com slugs/variantes do PRD §3.1.
- [x] **CA-003:** Testes de RLS: operator não lê `profiles` de terceiros; não escreve em `report_specs`; admin escreve; anônimo não lê nada.
- [x] **CA-004:** `update` em `report_specs` falha mesmo como admin (imutabilidade RF-35).
- [x] **CA-005:** Tipos TS gerados compilam e são exportados por `packages/db`.

## 6. Plano de Testes

### 6.1 Testes Unitários
N/A — SQL puro; a lógica testável vive nos testes de RLS (integração).

### 6.2 Testes de Integração
Suite `rls.test.ts` contra Supabase local: cria usuários de teste (operator, admin),
exercita a matriz de acesso de cada tabela nos dois papéis + anônimo.

### 6.3 Testes de Aceitação
`supabase db reset` completo + seed + suite RLS verde = CA-001..CA-004.

### 6.4 Casos de Borda (Edge Cases)
- Usuário autenticado **sem** linha em `profiles` (sem papel): não acessa nada além do próprio profile inexistente.
- `report_photos` órfã após delete de report: `on delete cascade` verificado.
- `audit_log` com `actor` null (worker): insert permitido via service role.

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Política RLS permissiva demais passa despercebida | Média | Alto | Testes negativos explícitos por tabela/papel (CA-003) |
| Drift entre DDL do PRD e migrations | Baixa | Médio | PRD §6 é fonte de verdade; revisão por diff na PR |
| Tipos gerados desatualizados | Média | Baixo | Script `pnpm db:types` documentado; CI falha se diff |

## 8. Dependências

### 8.1 Dependências Internas
**001** (monorepo, `packages/db` existente, scripts raiz).

### 8.2 Dependências Externas
- **Projeto Supabase hosted (cloud)** — dev e produção. Requer credenciais no `.env`
  (gitignored): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `DATABASE_URL` e, para o CLI, o project-ref + access token. **Bloqueia a aplicação das
  migrations e os testes de RLS** (CA-001..005) até serem fornecidas.
- Supabase CLI (para `link`/`db push`/`gen types`). Ambiente local (`supabase start`)
  **diferido para o deploy ao VPS**.

## 9. Observações e Decisões de Design

- Sem UI — nenhuma tela de `design/` vinculada (M0 do PRD).
- A máquina de estados (PRD §3.2) é enforçada na aplicação (implementação 005), não por
  trigger — decisão do PRD T-13; o banco fornece apenas o enum.
- A FK `report_types.active_spec_id → report_specs.id` é adicionada em migration separada
  (dependência circular entre as duas tabelas, como anotado no DDL do PRD).
- **Imutabilidade de `report_specs` (decisão do usuário, 2026-06-11):** defesa dupla —
  política RLS negando UPDATE **e** trigger `BEFORE UPDATE` que lança erro explícito. Garante
  a regra mesmo para o `service role` (que ignora RLS) — daí a importância do trigger.

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
