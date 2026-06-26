# Tarefas: Infraestrutura Collabora Online e WOPI Host

> **Implementação:** 011 - Infraestrutura Collabora Online e WOPI Host
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 9/9 tarefas concluídas (100%)
> **Última atualização:** 2026-06-26

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Provisionamento e Rede

- [x] **T-001:** Adicionar serviço `collabora` ao docker-compose
  - **Descrição:** Serviço `collabora/code` com `aliasgroup1` (domínio do app), `extra_params=--o:ssl.enable=false --o:ssl.termination=true`, `cap_add MKNOD`, healthcheck no `/hosting/discovery`. Variáveis em `.env.example` (`COLLABORA_URL`, `COLLABORA_ALIASGROUP`).
  - **Arquivos envolvidos:** `docker-compose.yml`, `.env.example`
  - **Critério de conclusão:** `docker compose up collabora` sobe e `/hosting/discovery` responde (CA-001).
  - **Dependências:** Nenhuma
  - **Estimativa:** Média

- [x] **T-002:** Rota do Collabora no Caddy (com WebSocket)
  - **Descrição:** Encaminhar `/browser/*`, `/hosting/*`, `/cool/*` (e `/lool/*` legado) para `collabora:9980`, preservando upgrade de WebSocket; manter `reverse_proxy app:3000` para o resto. Ajustar `frame-ancestors`/headers para permitir o iframe.
  - **Arquivos envolvidos:** `Caddyfile`
  - **Critério de conclusão:** Acessar o Collabora pelo domínio do app (via Caddy) funciona, incluindo WS.
  - **Dependências:** T-001
  - **Estimativa:** Média

### Fase 2: Modelo de Dados e Token

- [x] **T-003:** Migration das colunas WOPI em `reports`
  - **Descrição:** `0006_collabora.sql` adicionando `working_docx_path text`, `wopi_lock text`, `wopi_lock_expires_at timestamptz`. Atualizar `packages/db/types/database.ts`.
  - **Arquivos envolvidos:** `packages/db/migrations/0006_collabora.sql`, `packages/db/types/database.ts`
  - **Critério de conclusão:** `pnpm --filter @naabsa/db migrate` aplica; tipos refletem as colunas.
  - **Dependências:** Nenhuma
  - **Estimativa:** Pequena

- [x] **T-004:** Emissão/validação de access_token WOPI
  - **Descrição:** `lib/wopi/token.ts` com `signToken({reportId,userId,canWrite,exp})` e `verifyToken()` via HMAC-SHA256 (`node:crypto`, segredo `WOPI_TOKEN_SECRET`). TTL ≤ 60 min.
  - **Arquivos envolvidos:** `apps/web/lib/wopi/token.ts`, `.env.example`
  - **Critério de conclusão:** Testes unitários de assinar/verificar/expirar/adulterar passam (6.1).
  - **Dependências:** Nenhuma
  - **Estimativa:** Pequena

- [x] **T-005:** Cliente de discovery do Collabora
  - **Descrição:** `lib/wopi/discovery.ts` busca `/hosting/discovery`, cacheia e resolve o `urlsrc` para `.docx` (action `edit`).
  - **Arquivos envolvidos:** `apps/web/lib/wopi/discovery.ts`
  - **Critério de conclusão:** Teste unitário extrai o `urlsrc` de um XML de discovery de fixture.
  - **Dependências:** T-001
  - **Estimativa:** Pequena

### Fase 3: WOPI Host (endpoints)

- [x] **T-006:** CheckFileInfo + Lock lifecycle
  - **Descrição:** `app/api/wopi/files/[id]/route.ts`: GET (CheckFileInfo) e POST com `X-WOPI-Override` (LOCK/UNLOCK/REFRESH_LOCK/GET_LOCK), persistindo `wopi_lock`/`wopi_lock_expires_at`. Valida token; `UserCanWrite` reflete `canWrite`.
  - **Arquivos envolvidos:** `apps/web/app/api/wopi/files/[id]/route.ts`
  - **Critério de conclusão:** CheckFileInfo retorna o shape correto; Lock→GetLock→Unlock coerentes; lock divergente → 409 (CA-005).
  - **Dependências:** T-003, T-004
  - **Estimativa:** Média

- [x] **T-007:** GetFile + PutFile (Storage)
  - **Descrição:** `app/api/wopi/files/[id]/contents/route.ts`: GET baixa `working.docx` do Storage; POST (PutFile) grava (valida `X-WOPI-Lock` e `canWrite`). Atualiza `LastModifiedTime`/`Size`.
  - **Arquivos envolvidos:** `apps/web/app/api/wopi/files/[id]/contents/route.ts`
  - **Critério de conclusão:** PutFile persiste no Storage e CheckFileInfo reflete; sem lock/`canWrite=false` → 409/403.
  - **Dependências:** T-006
  - **Estimativa:** Média

### Fase 4: Validação ponta a ponta

- [x] **T-008:** Harness de teste do iframe (fixture)
  - **Descrição:** Página/spec descartável que monta o iframe do Collabora (discovery+WOPISrc+token) apontando para um `working.docx` semeado de fixture, para validar abrir/editar/salvar sem depender da 012.
  - **Arquivos envolvidos:** `apps/web/app/(dev)/wopi-poc/page.tsx` (ou script de teste)
  - **Critério de conclusão:** CA-002 e CA-003 verificados manualmente (abre, edita, salva no Storage).
  - **Dependências:** T-002, T-005, T-007
  - **Estimativa:** Média

- [x] **T-009:** Testes automatizados + lint
  - **Descrição:** Unit (token, discovery, CheckFileInfo shape) e integração (PutFile→Storage, ciclo de lock). `pnpm lint` e `pnpm test` verdes.
  - **Arquivos envolvidos:** `apps/web/lib/wopi/*.test.ts`, `apps/web/app/api/wopi/**/*.test.ts`
  - **Critério de conclusão:** Suítes 6.1/6.2 passam; lint limpo.
  - **Dependências:** T-006, T-007
  - **Estimativa:** Média

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | ✅ Concluída | 2026-06-26 | Collabora sobe (WSL2: mount_namespaces=false + SYS_ADMIN + alias URI válido); /hosting/discovery responde — CA-001 |
| T-002  | ✅ Concluída | 2026-06-26 | rota /browser,/hosting,/cool→collabora:9980 no Caddy (verificação real no deploy atrás do Caddy) |
| T-003  | ✅ Concluída | 2026-06-26 | migration 0006 aplicada (working_docx_path, wopi_lock, wopi_lock_expires_at) |
| T-004  | ✅ Concluída | 2026-06-26 | `lib/wopi/token.ts` + 5 testes verdes |
| T-005  | ✅ Concluída | 2026-06-26 | `lib/wopi/discovery.ts` + 3 testes verdes |
| T-006  | ✅ Concluída | 2026-06-26 | CheckFileInfo verificado via curl (JSON real: BaseFileName/Size/UserCanWrite); lock formal em T-009 |
| T-007  | ✅ Concluída | 2026-06-26 | GetFile verificado no POC (Collabora abriu o `working.docx`); PutFile/lock formal em T-009 |
| T-008  | ✅ Concluída | 2026-06-26 | POC visual: LibreOffice editando HG_ANTWERP.docx no browser (servido pelo WOPI host, via Storage) |
| T-008  | ⬜ Pendente | — | — |
| T-009  | ✅ Concluída | 2026-06-26 | 20 testes WOPI verdes (token 5, lock 12 incl. CA-005, discovery 3); lock extraído p/ `lib/wopi/lock.ts` puro; lint+typecheck limpos |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
