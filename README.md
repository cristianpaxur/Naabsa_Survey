# Sistema de Relatórios Automatizados Naabsa

Sistema web interno que automatiza a produção dos relatórios de inspeção marítima da
**Naabsa Marine Surveyors & Consultants**: o operador sobe a planilha pré-moldada, o sistema
extrai e valida os dados, distribui as fotos, abre o documento num editor rico e gera o PDF —
com auditoria completa e o operador como autoridade final.

- **Requisitos:** [PRD.md](./PRD.md) (fonte de verdade — RF/RNF, domínio, stack).
- **Convenções do agente:** [CLAUDE.md](./CLAUDE.md).
- **Plano de implementação:** [implementation/](./implementation/) (10 implementações, 001→010).
- **Design (handoff):** [design/naabsa-survey](./design/naabsa-survey).

> Status: **fundação (implementação 001) concluída** — monorepo, tooling, esqueletos de app e
> worker, testes e containerização. As features chegam nas implementações 002–010.

## Stack

Next.js 15 (App Router) · TypeScript estrito · Supabase (Postgres/RLS/Storage) · pg-boss ·
worker Node + Playwright + sharp · TipTap · ExcelJS · Docker Compose (app, worker, caddy).
Detalhes e decisões fixas no [PRD §2](./PRD.md).

## Estrutura do monorepo

```
apps/
  web/        # Next.js (UI + API + rota /print)
  worker/     # processo Node (pg-boss, Playwright, sharp) — jobs em src/jobs/
packages/
  core/       # MOTOR (TS puro): extractor, spec-schema, document-builder
  db/         # migrations SQL + tipos gerados do Supabase
tests/
  golden/     # golden tests de PDF por tipo×variante
  fixtures/   # planilhas/specs de teste
```

`packages/core` é **TypeScript puro** e nunca importa Next.js, Supabase ou o worker — regra
garantida por lint (`eslint.config.mjs`).

## Pré-requisitos

- **Node** ≥ 20 (ver [.nvmrc](./.nvmrc) — usamos 24)
- **pnpm** 11+ (`npm i -g pnpm` ou via corepack)
- **Docker** + Docker Compose (para a stack containerizada)

## Como rodar

### Instalar

```bash
pnpm install
```

### Desenvolvimento

```bash
pnpm --filter @naabsa/web dev      # app web em http://localhost:3000
pnpm --filter @naabsa/worker dev   # worker (recarrega ao salvar)
```

### Qualidade (gate de cada tarefa)

```bash
pnpm lint          # ESLint (config única, isolamento do core)
pnpm typecheck     # tsc estrito em todos os workspaces
pnpm test          # Vitest
pnpm format        # Prettier --write   (format:check para verificar)
```

### Stack completa (Docker)

```bash
cp .env.example .env        # preencha conforme o PRD §13 (opcional no esqueleto)
docker compose up --build   # sobe app, worker e caddy
```

Por padrão o Caddy publica em **http://localhost** (HTTP). Verifique:

```bash
curl http://localhost/api/health    # → {"status":"ok","service":"naabsa-web"}
```

> Se a porta 80 estiver em uso, defina `CADDY_HTTP_PORT` (ex.: `CADDY_HTTP_PORT=8080`).
> Em produção, defina `APP_DOMAIN=seu.dominio` no `.env` e o Caddy emite TLS automaticamente.

## Variáveis de ambiente

Todas as variáveis estão em [.env.example](./.env.example) (PRD §13). Nenhum segredo vai para o
repositório: `.env` está no `.gitignore`.

## Convenções

- Uma implementação por vez, na ordem de [implementation/README.md](./implementation/README.md).
- Por tarefa: ler RFs → implementar → testes → `pnpm lint && pnpm typecheck && pnpm test`
  verdes → commit pequeno referenciando a tarefa (ex.: `feat(core): 003/T-005 ...`).
- UI e mensagens sempre em **pt-BR**.
