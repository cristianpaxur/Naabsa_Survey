# Tarefas: Autenticação, Dashboard e Criação de Relatórios

> **Implementação:** 005 - Autenticação, Dashboard e Criação de Relatórios
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 10/12 tarefas concluídas (83%)
> **Última atualização:** 2026-06-12
>
> **Setup extra (decisão do usuário):** `pnpm db:seed-dev` provisiona operador+admin
> de teste e um spec sintético ativo de `draft_survey`. Login: `operador@naabsa.dev` /
> `admin@naabsa.dev` (senha `naabsa123`).

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Autenticação (PRD T-11)

- [x] **T-001:** Clientes Supabase e validação de env
  - **Descrição:** `lib/supabase/{client,server}.ts` (browser/server) tipados com `packages/db`; falha de boot clara sem env.
  - **Arquivos envolvidos:** `apps/web/lib/supabase/*`
  - **Critério de conclusão:** Sessão lida no server e no client.
  - **Dependências:** Nenhuma (002 concluída)
  - **Estimativa:** Pequena

- [x] **T-002:** Tela 01 — Login
  - **Descrição:** Página `(auth)/login` fiel ao protótipo (split navy/papel, banner de erro, tokens Public Sans/IBM Plex Mono); signIn por e-mail/senha; sem signup.
  - **Arquivos envolvidos:** `apps/web/app/(auth)/login/page.tsx`, `components/ui/*`
  - **Critério de conclusão:** Login funciona; credencial inválida e campos vazios mostram erro pt-BR.
  - **Dependências:** T-001
  - **Estimativa:** Média

- [x] **T-003:** Middleware de sessão e papel
  - **Descrição:** Proteger `(app)/*`; resolver papel via `profiles`; sem sessão → `/login`; sem papel → página de acesso negado.
  - **Arquivos envolvidos:** `apps/web/middleware.ts`
  - **Critério de conclusão:** Rotas protegidas inacessíveis sem login/papel (CA-001 parcial).
  - **Dependências:** T-001
  - **Estimativa:** Média

- [x] **T-004:** App shell com sidebar
  - **Descrição:** Layout `(app)` com sidebar do protótipo (logo NAABSA, Relatórios, Novo relatório, Specs, usuário/papel) e estados ativos de navegação.
  - **Arquivos envolvidos:** `apps/web/app/(app)/layout.tsx`, `components/ui/sidebar.tsx`
  - **Critério de conclusão:** Shell idêntico ao protótipo; navegação funcional.
  - **Dependências:** T-003
  - **Estimativa:** Média

### Fase 2: Máquina de estados e auditoria (PRD T-13)

- [x] **T-005:** Módulo `state-machine.ts`
  - **Descrição:** Grafo do PRD §3.2 como dados; `transition(reportId, to, actor)` valida, atualiza e audita; transição inválida lança erro pt-BR e audita a tentativa.
  - **Arquivos envolvidos:** `apps/web/lib/state-machine.ts`, `apps/web/lib/audit.ts`
  - **Critério de conclusão:** Tabela 7×7 de transições testada (CA-003).
  - **Dependências:** T-001
  - **Estimativa:** Média

### Fase 3: Dashboard (PRD T-12)

- [x] **T-006:** Badge de status e componentes de tabela
  - **Descrição:** Badge dos 7 estados com as cores exatas do `statusMap` do protótipo; célula de ID/data em IBM Plex Mono.
  - **Arquivos envolvidos:** `apps/web/components/ui/status-badge.tsx`
  - **Critério de conclusão:** 7 badges visualmente conferidos com o board estático.
  - **Dependências:** T-004
  - **Estimativa:** Pequena

- [x] **T-007:** Tela 02 — Dashboard com filtros e busca
  - **Descrição:** Listagem server-side (tipo, variante, navio, status, data, autor); filtros tipo/status/período por query params; busca por navio; empty-state; clique roteia pela etapa do status (mapa `openReport` do protótipo); CTA "Novo relatório".
  - **Arquivos envolvidos:** `apps/web/app/(app)/dashboard/page.tsx`
  - **Critério de conclusão:** CA-004 atendido com dados reais do banco.
  - **Dependências:** T-005, T-006
  - **Estimativa:** Grande

### Fase 4: Wizard de criação (PRD T-12)

- [x] **T-008:** Tela 03 — Etapas tipo e variante
  - **Descrição:** Stepper + cards dos 5 tipos (slug mono, contagem de variantes) + seleção de variante obrigatória quando houver; "Continuar" desabilitado até seleção válida; cria relatório `draft` com `spec_id` congelado (RF-05).
  - **Arquivos envolvidos:** `apps/web/app/(app)/reports/new/page.tsx`, Server Action `createReport`
  - **Critério de conclusão:** CA-005 e CA-006 atendidos.
  - **Dependências:** T-004, T-005
  - **Estimativa:** Grande

- [x] **T-009:** Upload da planilha + disparo da extração
  - **Descrição:** Route handler multipart (.xlsx, ≤ 20 MB, 413/415), upload ao Storage, rodar extractor (003), persistir `extracted_data`/`extraction_issues` (imutáveis) + `vessel_name`, transicionar `draft→extracted`, auditar; UI com barra de progresso e spinner "Extraindo…" fiel ao protótipo.
  - **Arquivos envolvidos:** `apps/web/app/api/reports/[id]/spreadsheet/route.ts`, wizard
  - **Critério de conclusão:** Planilha válida chega a `extracted` e redireciona à revisão; fingerprint errado exibe erro RF-09 mantendo `draft`.
  - **Dependências:** T-008
  - **Estimativa:** Grande

### Fase 5: Testes e Validação

- [x] **T-010:** E2E de login e acesso
  - **Descrição:** Playwright: login feliz, credencial errada, rota protegida sem sessão, usuário sem papel (aceite do PRD T-11).
  - **Arquivos envolvidos:** `tests/e2e/login.spec.ts`
  - **Critério de conclusão:** CA-001 verde.
  - **Dependências:** T-003
  - **Estimativa:** Média

- [ ] **T-011:** E2E de criação até `extracted`
  - **Descrição:** Playwright: criar relatório com variante e sem variante, upload de fixture, verificar status e trilha de auditoria (aceite do PRD T-12).
  - **Arquivos envolvidos:** `tests/e2e/create-report.spec.ts`
  - **Critério de conclusão:** CA-002 e CA-007 verdes.
  - **Dependências:** T-009
  - **Estimativa:** Média

### Fase 6: Documentação e Finalização

- [ ] **T-012:** Verificação final
  - **Descrição:** Conferir CA-001..CA-007, casos de borda (reinício→draft, uploads simultâneos, sessão expirada, tipos sem variante); atualizar progresso e índice.
  - **Arquivos envolvidos:** `implementation/005*/`, `implementation/README.md`
  - **Critério de conclusão:** Todos os CA marcados; bordas cobertas por teste ou decisão documentada.
  - **Dependências:** T-010, T-011
  - **Estimativa:** Média

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | ✅ Concluída | 2026-06-12 | @supabase/ssr: client/server/middleware tipados com Database; NEXT_PUBLIC_* no env; seed-dev (2 usuários + spec ativo) rodado no cloud |
| T-002  | ✅ Concluída | 2026-06-12 | Login fiel ao protótipo (split navy/papel, fontes Public Sans/IBM Plex Mono via next/font); signInWithPassword; erros pt-BR; build verde. Login ao vivo no E2E (T-010) |
| T-003  | ✅ Concluída | 2026-06-12 | middleware.ts: refresh de sessão + proteção de (app)/*; sem sessão→/login, sem papel→/acesso-negado; /login e /reports/*/print públicos; api/estáticos fora do matcher |
| T-004  | ✅ Concluída | 2026-06-12 | (app)/layout server lê user+profile; Sidebar client (nav ativa por path, Specs só admin, logout); fiel ao protótipo. Nota: cast de resultados supabase-js (parser yields never com strict TS) |
| T-005  | ✅ Concluída | 2026-06-12 | state-machine.ts (grafo §3.2, isValidTransition, transition c/ guarda otimista + audit) + audit.ts; vitest no web; 4 testes (7×7) verdes (CA-003) |
| T-006  | ✅ Concluída | 2026-06-12 | StatusBadge + STATUS_MAP com as cores exatas dos 7 estados (statusMap do protótipo) |
| T-007  | ✅ Concluída | 2026-06-12 | Dashboard server-side: tabela fiel ao protótipo, filtros tipo/status/período + busca por navio (query params), empty-state, roteamento por status, CTA. dotenv-cli carrega o .env da raiz no dev/start |
| T-008  | ✅ Concluída | 2026-06-12 | Wizard (stepper, cards dos 5 tipos, variante obrigatória, tipos sem spec ativo desabilitados); createReport congela spec ativo (RF-05) + audita. Refactor ServerClient unifica o tipo do cliente |
| T-009  | ✅ Concluída | 2026-06-12 | Route handler /api/reports/[id]/spreadsheet: valida .xlsx/20MB, extrai (motor 003), erro de fingerprint mantém draft, sobe ao Storage (service), persiste extracted_data/issues/vessel_name, audita + draft→extracted; dropzone real → redireciona à revisão |
| T-010  | ✅ Concluída | 2026-06-12 | Playwright configurado; 4 testes de login E2E verdes ao vivo (redirect, credencial inválida, campos vazios, login feliz). Login refatorado para Server Action (cookie confiável) — corrige o race do cliente |
| T-011  | ⬜ Pendente | — | — |
| T-012  | ⬜ Pendente | — | — |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
