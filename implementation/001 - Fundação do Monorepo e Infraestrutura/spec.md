# Fundação do Monorepo e Infraestrutura

> **ID:** 001
> **Status:** 🟡 Planejada
> **Prioridade:** 🔴 Crítica
> **Criada em:** 2026-06-11
> **Última atualização:** 2026-06-11
> **Autor:** Agente AI

---

## 1. Resumo Executivo

Criar o esqueleto do monorepo (pnpm workspaces) com TypeScript estrito, lint, testes e a
estrutura de pastas do PRD §7, mais a infraestrutura de containers (Docker Compose com
`app`, `worker` e `caddy`). Entrega a base sobre a qual todas as demais implementações
(002–010) serão construídas, com `pnpm lint` e `pnpm test` verdes desde o primeiro commit.

## 2. Contexto e Motivação

### 2.1 Problema Atual
O repositório contém apenas documentação (PRD.md, CLAUDE.md, design/). Não há projeto
executável, padronização de código nem ambiente reproduzível para desenvolvimento e deploy.

### 2.2 Impacto do Problema
Sem a fundação, nenhuma das implementações 002–010 pode começar. Sem TS estrito + lint + testes
configurados desde o início, dívida técnica se acumula no núcleo de maior risco (motor de extração).

### 2.3 Soluções Consideradas

| Solução | Prós | Contras | Decisão |
|---------|------|---------|---------|
| Monorepo pnpm workspaces (PRD §2/§7) | Stack fixa do PRD; core isolado e testável | — | ✅ Escolhida |
| Repositórios separados (web/worker/core) | Isolamento físico | Contraria o PRD; overhead de versionamento | ❌ Descartada |
| Turborepo/Nx | Cache de build | Complexidade desnecessária para 2 apps + 2 packages | ❌ Descartada |

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura
Monorepo com `apps/web` (Next.js 15+ App Router), `apps/worker` (Node + pg-boss),
`packages/core` (TypeScript puro — motor) e `packages/db` (migrations + tipos). Deploy via
Docker Compose em VPS (Hostinger KVM2, 2 vCPU/8 GB) com containers `app`, `worker` e
`caddy` (TLS). Regra inviolável: `packages/core` não importa Next.js, Supabase nem worker.

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|-----------|------|------|-----------|
| `package.json`, `pnpm-workspace.yaml` | Arquivo | Criar | Workspaces raiz + scripts `lint`, `test`, `typecheck` |
| `tsconfig.base.json` | Arquivo | Criar | TS estrito compartilhado (`strict: true`) |
| `.eslintrc` / `eslint.config.mjs`, `.prettierrc` | Arquivo | Criar | Padrão de código único |
| `apps/web/` | Módulo | Criar | Esqueleto Next.js 15+ App Router + TS |
| `apps/worker/` | Módulo | Criar | Esqueleto do processo Node (pg-boss será ligado na 004) |
| `packages/core/` | Módulo | Criar | Package TS puro com Vitest configurado |
| `packages/db/` | Módulo | Criar | Pasta de migrations + tipos (preenchida na 002) |
| `tests/golden/`, `tests/fixtures/` | Pasta | Criar | Estrutura de testes do PRD §7/§11 |
| `docker-compose.yml` | Arquivo | Criar | Serviços `app`, `worker`, `caddy` |
| `apps/web/Dockerfile`, `apps/worker/Dockerfile` | Arquivo | Criar | Builds de produção (worker inclui Chromium/Playwright) |
| `Caddyfile` | Arquivo | Criar | Reverse proxy + TLS automático |
| `.env.example` | Arquivo | Criar | Todas as variáveis do PRD §13, sem valores |

### 3.3 Interfaces e Contratos

#### Entradas
Variáveis de ambiente do PRD §13 (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `PRINT_SERVICE_TOKEN`, `APP_BASE_URL`,
`AI_ENABLED`, `ANTHROPIC_API_KEY`) — declaradas em `.env.example`.

#### Saídas
Comandos funcionais na raiz: `pnpm lint`, `pnpm typecheck`, `pnpm test` (verdes no esqueleto)
e `docker compose up` subindo `app` e `worker` localmente.

#### Contratos de API (se aplicável)
N/A — nenhuma API é exposta nesta implementação.

### 3.4 Modelos de Dados (se aplicável)
N/A — schema do banco é escopo da implementação 002.

### 3.5 Fluxo de Execução
1. `pnpm install` resolve os 4 workspaces.
2. `pnpm lint` / `pnpm typecheck` / `pnpm test` rodam em todos os workspaces via script raiz.
3. `docker compose up` builda as imagens e sobe `app` (porta interna 3000), `worker` e `caddy`.
4. Caddy roteia tráfego externo para `app` com TLS automático.

### 3.6 Tratamento de Erros
- Variável de ambiente ausente: app e worker falham no boot com mensagem clara em pt-BR
  indicando a variável faltante (validação de env no startup).
- Build Docker falho: erro do compose aponta o estágio; Dockerfiles em multi-stage para
  isolar falhas de dependência.

## 4. Requisitos

### 4.1 Requisitos Funcionais
Derivados do PRD (tarefas T-01 e T-03):

- **RF-001 (PRD T-01):** Monorepo pnpm workspaces com TS estrito, ESLint/Prettier e Vitest, estrutura exata do PRD §7.
- **RF-002 (PRD T-03):** Docker Compose com containers `app`, `worker` e `caddy`, Dockerfiles e `.env.example`.
- **RF-003 (PRD §7):** `packages/core` sem nenhuma importação de Next.js, Supabase ou worker (enforçado por lint rule de import).

### 4.2 Requisitos Não-Funcionais
- **RNF-001 (PRD RNF-05):** Nenhum segredo em código; secrets só via env (`.env` no `.gitignore`).
- **RNF-002 (PRD RNF-08):** Imagens dimensionadas para o VPS de 8 GB; worker com Chromium instalado mas sem múltiplas instâncias.

### 4.3 Restrições e Limitações
- Stack fixa do PRD §2 — não reavaliar tecnologias.
- O deploy real no VPS depende de acesso (PRD §15, insumo interno); esta implementação
  entrega tudo funcionando **localmente** — o deploy final é validado na 010 (T-28).

## 5. Critérios de Aceitação

- [ ] **CA-001:** `pnpm lint` e `pnpm test` passam verdes no esqueleto (aceite do PRD T-01).
- [ ] **CA-002:** `pnpm typecheck` passa com `strict: true` em todos os workspaces.
- [ ] **CA-003:** `docker compose up` sobe `app` e `worker` localmente (aceite do PRD T-03).
- [ ] **CA-004:** Estrutura de pastas idêntica ao PRD §7 (inspeção).
- [ ] **CA-005:** Lint falha se `packages/core` importar `next`, `@supabase/*` ou código do worker (teste de regra).
- [ ] **CA-006:** `.env.example` lista todas as variáveis do PRD §13 e `.env` está no `.gitignore`.

## 6. Plano de Testes

### 6.1 Testes Unitários
Teste-sentinela em `packages/core` (ex.: função identidade) provando que Vitest roda no workspace.

### 6.2 Testes de Integração
`docker compose up` local com healthcheck simples nos containers `app` e `worker`.

### 6.3 Testes de Aceitação
Execução manual dos comandos dos CA-001..CA-004 e inspeção da árvore de pastas.

### 6.4 Casos de Borda (Edge Cases)
- `pnpm install` em máquina limpa (sem cache).
- Compose sem `.env` presente → falha com mensagem clara, não com stack trace críptico.

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Imagem do worker (Chromium) muito pesada p/ VPS 8 GB | Média | Alto | Base `mcr.microsoft.com/playwright` slim; multi-stage; medir RAM no compose local |
| Versões Next.js 15 / pnpm incompatíveis no futuro | Baixa | Médio | Lockfile commitado; versões fixadas |
| Regra de isolamento do core não enforçada | Média | Alto | Regra ESLint `no-restricted-imports` + teste de CI |

## 8. Dependências

### 8.1 Dependências Internas
Nenhuma — é a primeira implementação.

### 8.2 Dependências Externas
pnpm, Node LTS, Docker/Docker Compose, imagens base (node, playwright, caddy).
Acesso ao VPS (PRD §15) **apenas** para o deploy final — não bloqueia o desenvolvimento local.

## 9. Observações e Decisões de Design

- Sem UI nesta implementação (M0 do PRD é "sem UI") — nenhuma tela de `design/` vinculada.
- Os jobs do worker (`process_photo`, `generate_pdf`, `retention_purge`, `ai_review`) são
  apenas pastas/stubs aqui; a lógica chega nas implementações 004, 007 e 010.
- O script `pnpm test` raiz deve agregar todos os workspaces para servir de gate único de CI.
- **Decisão (T-008) — base do worker:** na fundação a imagem do worker usa `node:22-slim`,
  não a imagem Playwright. O worker do esqueleto só executa `tsx` (sem Chromium); a troca para
  `mcr.microsoft.com/playwright:<versão>-jammy` é **diferida para a impl 004**, quando o pacote
  npm `playwright` e o job `generate_pdf` entram — momento natural para alinhar a versão da
  imagem com a do pacote. O Dockerfile do worker documenta o ponto de troca. Evita carregar
  uma base de ~1,8 GB antes de qualquer código usá-la.
- **Decisão (T-008) — `allowBuilds`:** o pnpm 11.6 não honra `onlyBuiltDependencies`; a
  autorização de scripts de build de dependências nativas (`esbuild`, `sharp`) é feita via
  `allowBuilds: { esbuild: true, sharp: true }` no `pnpm-workspace.yaml` — essencial para o
  `pnpm install` limpo dentro do Docker.

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
