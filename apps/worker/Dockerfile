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

# ┌─ impl 007 (process_photo / sharp + HEIC) ─────────────────────────────────┐
# │ O job process_photo usa `sharp`. O pacote npm pré-compilado para linux-x64 │
# │ (sharp@0.34) embute libvips com suporte a HEIF/HEIC, então node:22-slim    │
# │ basta — não é necessário instalar libvips do SO. Se trocar para uma base   │
# │ musl (alpine) ou outra arquitetura, validar o suporte HEIC do sharp.       │
# └────────────────────────────────────────────────────────────────────────────┘

# --- runner: fonte + execução via tsx (core/db são TS, sem build) ---
FROM deps AS runner

# ┌─ impl "print da planilha" (render_sheets / LibreOffice) ───────────────────┐
# │ O job render_sheets exporta as abas do Excel como PNG via LibreOffice       │
# │ headless. Instalamos `libreoffice-calc` + `fonts-crosextra-carlito`         │
# │ (Carlito = clone métrico do Calibri) para fidelidade tipográfica.           │
# └────────────────────────────────────────────────────────────────────────────┘
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-calc fonts-crosextra-carlito fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*

COPY packages ./packages
COPY apps/worker ./apps/worker
ENV NODE_ENV=production
# node:22-slim já inclui o usuário não-root `node`.
USER node
CMD ["pnpm", "--filter", "@naabsa/worker", "start"]
