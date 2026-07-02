# Tarefas: Gestão de Identidade e Acesso (SSO Microsoft Entra ID)

> **Implementação:** 013 - Gestão de Identidade e Acesso
> **Spec:** [spec.md](./spec.md)
> **Progresso:** 0/12 tarefas concluídas (0%)
> **Última atualização:** 2026-06-27

---

## Legenda

- `[ ]` — Pendente
- `[x]` — Concluída
- `[!]` — Bloqueada (ver observação)
- `[-]` — Cancelada

---

## Tarefas

### Fase 1: Login SSO com Entra (RF-001)

- [!] **T-001:** Provider Azure (Entra) + App Registration
  - **Descrição:** Habilitar o provider **Azure** no Supabase com o **tenant do cliente** (não `common`); doc "o que pedir à TI do cliente" (App Registration, redirect `…/auth/v1/callback`, client id/secret). Desabilitar signup público. Para dev, usar **tenant de teste**.
  - **Arquivos envolvidos:** Supabase (config), `implementation/013*/` (doc do App Registration), `.env.example`
  - **Critério de conclusão:** Provider ativo; login OIDC volta uma sessão num tenant de teste.
  - **Dependências:** Nenhuma (002/005 concluídas)
  - **Estimativa:** Média
  - **Observações:** 🔴 Bloqueio externo (PRD §15): App Registration no **tenant Entra do cliente**. Desenvolver contra tenant de teste destrava.

- [ ] **T-002:** Botão "Entrar com a Microsoft" + contingência
  - **Descrição:** No `(auth)/login`, botão primário **"Entrar com a Microsoft"** (`signInWithOAuth({provider:'azure', redirectTo:'…/auth/callback'})`); manter o form e-mail/senha **recolhido** como acesso de contingência (break-glass).
  - **Arquivos envolvidos:** `apps/web/app/(auth)/login/page.tsx`, `components/ui/*`
  - **Critério de conclusão:** Clique inicia o OIDC; form local segue funcional p/ break-glass.
  - **Dependências:** T-001
  - **Estimativa:** Pequena

- [ ] **T-003:** Rota `/auth/callback`
  - **Descrição:** Route handler que troca o `code` por sessão (`exchangeCodeForSession`), seta o cookie e roteia: autorizado → dashboard; negado → `/acesso-negado`. Erro de callback → login com erro pt-BR.
  - **Arquivos envolvidos:** `apps/web/app/auth/callback/route.ts`
  - **Critério de conclusão:** Volta do Entra cria sessão e roteia corretamente (CA-001).
  - **Dependências:** T-002, T-005

### Fase 2: Autorização e modelo de dados (RF-002, RF-003)

- [ ] **T-004:** Migration `0007_identity.sql`
  - **Descrição:** `profiles` += `status`,`last_login_at`,`email`,`auth_provider`; tabela **`user_access`** (allowlist por e-mail: `role`,`status`,`invited_by`,`linked_user_id`,`last_login_at`). RLS: `user_access` só admin/service; tipos em `packages/db`.
  - **Arquivos envolvidos:** `packages/db/migrations/0007_identity.sql`, `packages/db/types/database.ts`
  - **Critério de conclusão:** Migration idempotente aplicada ao cloud; tipos atualizados.
  - **Dependências:** Nenhuma
  - **Estimativa:** Média

- [ ] **T-005:** Regra de autorização + JIT
  - **Descrição:** Lib pura: `autorizar(email, tenant, allowlist) → allow|deny` (normaliza caixa) e `upsertProfileFromEntra` (vincula `auth.users.id`, sincroniza papel/nome/`last_login_at`). Default = **negado** sem allowlist.
  - **Arquivos envolvidos:** `apps/web/lib/auth/authorize.ts` (+ `.test.ts`)
  - **Critério de conclusão:** Unit verdes (autorizado/negado, normalização, JIT idempotente).
  - **Dependências:** T-004
  - **Estimativa:** Média

- [ ] **T-006:** Middleware enforça status/allowlist
  - **Descrição:** Estender o middleware (005): além de sessão+papel, barrar `status!='active'` e e-mail fora da allowlist; gravar `last_login_at`; negados → `/acesso-negado` (pt-BR) + auditoria. Página `/acesso-negado` fiel ao tom do app.
  - **Arquivos envolvidos:** `apps/web/middleware.ts`, `apps/web/lib/supabase/middleware.ts`, `app/(auth)/acesso-negado/page.tsx`
  - **Critério de conclusão:** Não-autorizado nunca acessa `(app)/*` (CA-002).
  - **Dependências:** T-005
  - **Estimativa:** Média

### Fase 3: Administração de usuários (RF-004, RF-005)

- [ ] **T-007:** Actions de admin
  - **Descrição:** `inviteUser(email,role)`, `setUserRole`, `setUserStatus` (desativar **revoga sessões** `auth.admin.signOut`), `revokeSessions`. Guarda admin-only, validação pt-BR, auditadas. Impedir desativar/rebaixar o **último admin ativo**.
  - **Arquivos envolvidos:** `apps/web/lib/actions/users.ts` (+ `.test.ts`)
  - **Critério de conclusão:** Ações funcionam com service role e auditam; guarda do último admin (CA-004).
  - **Dependências:** T-004
  - **Estimativa:** Média

- [ ] **T-008:** Tela `/admin/users`
  - **Descrição:** Lista de usuários (nome, e-mail, papel, status, último acesso), busca; ações **convidar**, trocar papel, ativar/desativar; admin-only (rota negada a operator). Fiel ao design system do app.
  - **Arquivos envolvidos:** `apps/web/app/(app)/admin/users/page.tsx`, `components/admin/*`
  - **Critério de conclusão:** Admin gere o ciclo de vida pela UI (RF-004/005).
  - **Dependências:** T-007
  - **Estimativa:** Grande

### Fase 4: Perfil, sessão e break-glass (RF-006, RF-007, RF-009)

- [ ] **T-009:** Perfil `/conta` + break-glass
  - **Descrição:** `/conta`: editar **nome**; ver e-mail/papel (read-only); **"sair de todos os dispositivos"** (`signOutEverywhere`). Sem campo de senha (Entra). Garantir ≥1 admin local break-glass (senha forte, rotacionável) e documentar.
  - **Arquivos envolvidos:** `apps/web/app/(app)/conta/page.tsx`, `lib/actions/users.ts`
  - **Critério de conclusão:** Usuário edita nome e encerra sessões; break-glass loga sem Entra (CA-005, CA-006).
  - **Dependências:** T-007
  - **Estimativa:** Média

### Fase 5: Auditoria, testes e E2E (RF-008)

- [ ] **T-010:** Auditoria de autenticação
  - **Descrição:** Novos eventos em `audit.ts`/tabela de auditoria: `auth_login`, `auth_logout`, `auth_denied`, `role_changed`, `user_activated`/`user_deactivated` (com ator/alvo/provider).
  - **Arquivos envolvidos:** `apps/web/lib/audit.ts`, callback/middleware/actions
  - **Critério de conclusão:** Eventos aparecem na auditoria (CA-007); retenção segue a 010.
  - **Dependências:** T-003, T-006, T-007
  - **Estimativa:** Pequena

- [ ] **T-011:** Testes unitários e de integração
  - **Descrição:** Suítes 6.1/6.2: autorização/JIT, guarda admin-only, `inviteUser`→login JIT, `setUserStatus(inactive)` revoga+barra, e-mail não-allowlisted negado. `pnpm lint`/`pnpm test` verdes.
  - **Arquivos envolvidos:** `apps/web/lib/**/*.test.ts`
  - **Critério de conclusão:** Suítes verdes; lint limpo.
  - **Dependências:** T-005, T-006, T-007, T-009
  - **Estimativa:** Média

- [ ] **T-012:** E2E + verificação final
  - **Descrição:** E2E CA-001..CA-007 (tenant de teste ou mock do provider): login Entra, negação, convite→papel, desativação→revogação, perfil, break-glass, auditoria. Atualizar `implementation/README.md` e este tracking.
  - **Arquivos envolvidos:** `tests/e2e/identity.spec.ts`, `implementation/013*/`, `implementation/README.md`
  - **Critério de conclusão:** Todos os CA verdes; índice atualizado.
  - **Dependências:** T-008, T-010, T-011
  - **Estimativa:** Grande

---

## Registro de Progresso

| Tarefa | Status | Data de Conclusão | Observações |
|--------|--------|-------------------|-------------|
| T-001  | 🔴 Bloqueada | — | Aguarda App Registration no tenant Entra do cliente (PRD §15); dev contra tenant de teste |
| T-002  | ⬜ Pendente | — | — |
| T-003  | ⬜ Pendente | — | — |
| T-004  | ⬜ Pendente | — | — |
| T-005  | ⬜ Pendente | — | — |
| T-006  | ⬜ Pendente | — | — |
| T-007  | ⬜ Pendente | — | — |
| T-008  | ⬜ Pendente | — | — |
| T-009  | ⬜ Pendente | — | — |
| T-010  | ⬜ Pendente | — | — |
| T-011  | ⬜ Pendente | — | — |
| T-012  | ⬜ Pendente | — | — |

---

> **📌 NOTA:** Atualize este documento conforme as tarefas forem concluídas.
> Marque `[x]` nas tarefas finalizadas e atualize a tabela de progresso.
