# syntax=docker/dockerfile:1
# Imagem do worker. Contexto de build = raiz do monorepo:
#   docker build -f apps/worker/Dockerfile .
#
# ┌─ impl 004 (generate_pdf / Playwright) ────────────────────────────────────┐
# │ O job generate_pdf usa Playwright/Chromium. Quando a impl 004 adicionar o  │
# │ pacote npm `playwright`, trocar a imagem base por                          │
# │   mcr.microsoft.com/playwright:vX.Y.Z-jammy                                 │
# │ (mantendo a versão em sincronia com o pacote npm). Essa base traz Chromium │
# │ + dependências de SO e o usuário não-root `pwuser`.                        │
# │ Na fundação (impl 001) o worker só executa tsx (sem navegador), então      │
# │ usamos node:22-slim — leve, rápido e suficiente para o esqueleto.          │
# └────────────────────────────────────────────────────────────────────────────┘

# --- base: Node + pnpm (via corepack, versão fixada em package.json) ---
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH" CI=true
RUN corepack enable
WORKDIR /app

# --- deps: instala dependências do monorepo (camada cacheável pelos manifests) ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- runner: fonte + execução via tsx (core/db são TS, sem build) ---
FROM deps AS runner
COPY packages ./packages
COPY apps/worker ./apps/worker
ENV NODE_ENV=production
# node:22-slim já inclui o usuário não-root `node`.
USER node
CMD ["pnpm", "--filter", "@naabsa/worker", "start"]
