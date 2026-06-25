# syntax=docker/dockerfile:1
# Imagem do worker. Contexto de build = raiz do monorepo:
#   docker build -f apps/worker/Dockerfile .
#
# ┌─ generate_pdf (.docx nativo → PDF via LibreOffice) ───────────────────────┐
# │ O job generate_pdf monta o relatório como .docx nativo (lib `docx`) e      │
# │ converte para PDF via LibreOffice headless (sem Chromium). Por isso a base  │
# │ node:22-slim basta; o LibreOffice é instalado no estágio runner abaixo.    │
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

# ┌─ LibreOffice headless (render_sheets + generate_pdf) ──────────────────────┐
# │ render_sheets exporta abas do Excel como PNG (`libreoffice-calc`).          │
# │ generate_pdf monta o .docx nativo e converte para PDF via macro UNO         │
# │ (`libreoffice-writer`). Fontes Carlito/Caladea = clones métricos de         │
# │ Calibri/Cambria para fidelidade tipográfica.                                │
# └────────────────────────────────────────────────────────────────────────────┘
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-calc libreoffice-writer fonts-crosextra-carlito fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*
# Perfil do LibreOffice (macro de conversão) num caminho gravável pelo usuário node.
ENV LO_PROFILE_DIR=/tmp/naabsa-lo

COPY packages ./packages
COPY apps/worker ./apps/worker
ENV NODE_ENV=production
# node:22-slim já inclui o usuário não-root `node`.
USER node
# start:container = tsx direto (sem dotenv). As envs vêm da plataforma (EasyPanel)
# ou do docker-compose (env_file), não de um .env dentro da imagem.
CMD ["pnpm", "--filter", "@naabsa/worker", "start:container"]
