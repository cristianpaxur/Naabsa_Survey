# Gestão de Identidade e Acesso (SSO Microsoft Entra ID)

> **ID:** 013
> **Status:** 🟡 Planejada
> **Prioridade:** 🟠 Alta
> **Criada em:** 2026-06-27
> **Última atualização:** 2026-06-27
> **Autor:** Agente AI

---

## 1. Resumo Executivo

Maturar a camada de **identidade e acesso** do app para padrão de produção, adotando **SSO via
Microsoft Entra ID** (decisão do usuário em 2026-06-27). A autenticação passa a ser delegada ao
Entra: o operador entra com a **conta Microsoft** da empresa, e a Microsoft cuida de **senha, MFA
e desligamento**. O app mantém só o que é seu: **autorização** (quem pode acessar e com qual
papel), **administração de usuários** (uma tela de admin), **perfil**, **auditoria de
autenticação** e um **acesso de contingência** (break-glass). Substitui o provisionamento atual
por `seed` (impl. 005), que não tem como criar/gerir usuários em produção.

## 2. Contexto e Motivação

### 2.1 Problema Atual
A impl. 005 entregou o **mínimo**: login e-mail/senha (Supabase), logout, papéis admin/operator
com middleware, e auditoria de **ações**. Os usuários só existem porque um **script de seed** os
cria (`operador@naabsa.dev`, `admin@naabsa.dev`). Em produção **não há** como um admin criar/gerir
usuários, o usuário **não troca a própria senha**, não há MFA, recuperação de senha, desativação
de conta, nem auditoria de **autenticação**. Falta toda a camada que qualquer app sério precisa.

### 2.2 Impacto do Problema
Sem isso o sistema não é operável por terceiros: onboarding/offboarding manual no banco, senhas
geridas "no susto", e nenhuma trilha de quem entrou/saiu. É risco de segurança e de operação.

### 2.3 Soluções Consideradas

#### Estratégia de identidade
| Estratégia | Prós | Contras | Decisão |
|---|---|---|---|
| **Microsoft Entra ID (SSO)** | Microsoft gere senha/MFA/offboarding; menos a construir; login corporativo; alinhado a quem já usa M365 | Depende de App Registration no tenant do cliente; papel ainda mapeado pelo app | ✅ **Escolhida** |
| Contas locais + autoatendimento | Sem dependência externa | App assume senha, reset, MFA, política — mais a construir e manter | ❌ Só como **break-glass** |
| Híbrido (local + Entra) | Flexível | Dobra a superfície de auth; provável Supabase Pro p/ SAML | ❌ Fora de escopo agora |

#### Mecanismo técnico do Entra (sub-decisão)
| Mecanismo | Prós | Contras | Decisão |
|---|---|---|---|
| **Entra via provider Azure do Supabase (OIDC/OAuth)** | **Grátis** (qualquer plano), simples, login real com Microsoft, restringível por **tenant** | Não é SAML "enterprise"; sem SCIM (provisionamento automático) | ✅ **Escolhida** |
| Entra via **SAML SSO** (Supabase Pro) | SSO enterprise, IdP-initiated | Custo (Pro ~US$25/mês), config SAML mais pesada | ⏸️ Upgrade futuro se exigirem |

> **Separação que guia tudo:** **autenticação** (provar quem é) = Entra; **autorização** (pode
> acessar? qual papel?) = app. O Entra diz "é a Maria da empresa"; o app diz "a Maria é operadora
> e está ativa".

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura

```
  Browser (operador)         Microsoft Entra ID            Supabase + App
 ┌─────────────────┐  OIDC   ┌──────────────────┐         ┌────────────────────────────┐
 │ "Entrar com a   │────────▶│  login + MFA +    │  code   │ Supabase Auth (provider     │
 │  Microsoft"     │◀────────│  Conditional Acc. │────────▶│ Azure, tenant do cliente)   │
 └─────────────────┘         └──────────────────┘         │            │                │
        │ sessão (cookie)                                  │            ▼                │
        ▼                                                  │  /auth/callback → sessão    │
   middleware ── autoriza ──▶ profiles.status/role ◀──────│  allowlist (e-mail→papel)   │
        │  (nega inativo/não-autorizado)                   │  profiles + auditoria       │
        ▼                                                  └────────────────────────────┘
   (app)/* protegido
```

O login vira **OIDC com o Entra** (via provider Azure do Supabase). Depois da volta, o
**middleware** (já existente) passa a checar, além da sessão, o **status** e o **papel** do usuário
na `profiles`/allowlist — negando quem não foi autorizado, mesmo sendo do tenant.

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|---|---|---|---|
| Supabase Auth (config) | Infra | Configurar | Habilitar provider **Azure** (client id/secret + **tenant do cliente**); desabilitar signup público; manter e-mail/senha só p/ break-glass |
| Azure App Registration | Infra (cliente) | Criar | No tenant Entra do cliente: app + redirect `https://<proj>.supabase.co/auth/v1/callback`; client secret |
| `apps/web/app/(auth)/login/page.tsx` | Arquivo | Modificar | Botão **"Entrar com a Microsoft"** (primário) + form e-mail/senha recolhido (contingência) |
| `apps/web/app/auth/callback/route.ts` | Arquivo | Criar | Troca o `code` por sessão (`exchangeCodeForSession`); roteia p/ dashboard ou "acesso negado" |
| `apps/web/middleware.ts` | Arquivo | Modificar | Além de sessão+papel: barrar `status != active` e e-mail fora da allowlist; registrar último acesso |
| `apps/web/lib/actions/users.ts` | Arquivo | Criar | Admin: convidar/pré-autorizar, trocar papel, ativar/desativar, revogar sessões (service role) |
| `apps/web/app/(app)/admin/users/page.tsx` | Arquivo | Criar | Tela de admin de usuários (lista, papel, status, último acesso, ações) — admin-only |
| `apps/web/app/(app)/conta/page.tsx` | Arquivo | Criar | Perfil do usuário: ver e-mail/papel, editar nome, "sair de todos os dispositivos" |
| `apps/web/lib/audit.ts` | Arquivo | Modificar | Novos eventos de **autenticação** (login/logout/negação/papel/ativação) |
| `packages/db/migrations/0007_identity.sql` | Arquivo | Criar | `profiles` += `status`,`last_login_at`,`email`,`auth_provider`; tabela `user_access` (allowlist) |
| `packages/db/types/database.ts` | Arquivo | Modificar | Tipos das novas colunas/tabela |
| `apps/web/lib/supabase/middleware.ts` | Arquivo | Modificar | Propagar a checagem de autorização no refresh de sessão |
| `.env.example` / Supabase | Arquivo/Infra | Modificar | Doc das chaves do provider Azure (ficam no Supabase, não no app) |

### 3.3 Interfaces e Contratos

#### Login (OIDC)
- `supabase.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'openid email profile', redirectTo: '<app>/auth/callback' } })`.
- Provider Azure configurado com o **tenant do cliente** (não `common`) → só contas daquele tenant autenticam.

#### Autorização (allowlist + status)
- `user_access(email)` → `{ role, status }`. **Regra:** só entra quem tem `status='active'` na
  allowlist **e** e-mail no tenant. Não-autorizado → sessão encerrada + `/acesso-negado` (pt-BR).
- JIT: 1º login autorizado vincula `auth.users.id` ao registro e popula/atualiza `profiles`.

#### Admin (Server Actions, admin-only, auditadas)
- `inviteUser(email, role)` — pré-autoriza um e-mail (cria/ativa em `user_access`).
- `setUserRole(userId, role)` / `setUserStatus(userId, active)` — papel/ativação; desativar **revoga sessões** (`auth.admin.signOut`).
- `revokeSessions(userId)` — "sair de todos os dispositivos".
- Self: `updateProfileName(name)`, `signOutEverywhere()`.

### 3.4 Modelos de Dados

Migration `0007_identity.sql`:
- `profiles` += `status text not null default 'active'` (`active|inactive|pending`),
  `last_login_at timestamptz`, `email text`, `auth_provider text` (`entra|password`).
- **`user_access`** (allowlist/pré-autorização, chaveada por **e-mail** porque o `auth.users`
  só nasce no 1º login):
  `email text primary key`, `role text not null` (`admin|operator`),
  `status text not null default 'active'`, `invited_by uuid`, `created_at timestamptz default now()`,
  `linked_user_id uuid` (preenchido no 1º login), `last_login_at timestamptz`.
- RLS: `user_access` legível/gravável só por admin (via service role nas actions); `profiles`
  mantém o RLS da 002 + leitura própria.

### 3.5 Fluxo de Execução
1. Operador clica **"Entrar com a Microsoft"** → OIDC no Entra (senha + MFA lá) → volta com `code`.
2. `/auth/callback` troca por sessão Supabase (cookie).
3. Middleware autoriza: e-mail no tenant **e** `user_access.status='active'`?
   - **Sim:** vincula/sincroniza `profiles` (papel+nome+`last_login_at`), segue p/ dashboard.
   - **Não:** encerra a sessão, audita "acesso negado", manda p/ `/acesso-negado`.
4. Admin gere usuários em `/admin/users` (convidar, papel, ativar/desativar, revogar sessões).
5. Usuário vê/edita o mínimo em `/conta` (nome; e-mail/papel são read-only; senha não existe).
6. **Break-glass:** se o Entra estiver fora, 1 admin local (e-mail/senha) ainda entra.

### 3.6 Tratamento de Erros
- E-mail fora do tenant/allowlist → `/acesso-negado` pt-BR; nenhuma sessão de app criada (audita).
- Usuário desativado com sessão viva → próxima navegação barra no middleware + revogação de sessão.
- Falha no callback (code inválido/expirado) → volta ao login com erro pt-BR.
- Entra/provider indisponível → usar break-glass; mensagem orienta o contingenciamento.
- Conflito de e-mail (já existe local + Entra mesmo e-mail) → vincular identidades por e-mail confirmado.

## 4. Requisitos

### 4.1 Requisitos Funcionais
- **RF-001:** Login **"Entrar com a Microsoft"** (OIDC/Entra) restrito ao **tenant do cliente**.
- **RF-002:** **Allowlist** por e-mail+papel (admin pré-autoriza); login não-autorizado é **negado**.
- **RF-003:** **JIT** — 1º login autorizado cria/vincula `profiles` (papel+nome), grava `last_login_at`.
- **RF-004:** **Tela de admin de usuários** (listar, papel, status, último acesso; convidar; ativar/desativar).
- **RF-005:** **Ativar/desativar** acesso no app (independe do Entra); desativado não loga e tem sessões revogadas.
- **RF-006:** **Perfil** (`/conta`): editar nome; ver e-mail/papel; **sem** campo de senha (delegado ao Entra).
- **RF-007:** **Break-glass** — manter 1 admin local (e-mail/senha), forte e rotacionável, auditado.
- **RF-008:** **Auditoria de autenticação**: login, logout, acesso negado, mudança de papel, ativação/desativação.
- **RF-009:** **"Sair de todos os dispositivos"** (revogar sessões) — pelo admin sobre um usuário e pelo próprio.

### 4.2 Requisitos Não-Funcionais
- **RNF-001:** **Senha, MFA e reset são do Entra** — o app **não** implementa esses fluxos (Conditional Access no Entra).
- **RNF-002:** Defesa em profundidade: restrição por **tenant** + **allowlist**; negação clara em pt-BR.
- **RNF-003:** Segredos (Azure client secret) só no **Supabase/env**, nunca em código (PRD §13).
- **RNF-004:** Papéis mínimos (admin/operator) preservados; **RLS da 002 inalterada**.
- **RNF-005:** Auditoria de auth retida conforme a política da 010 (retenção).
- **RNF-006:** Fluxos e mensagens em **pt-BR**; a tela do Entra segue o locale do navegador.

### 4.3 Restrições e Limitações
- **Bloqueio externo:** exige **App Registration no tenant Entra do cliente** (TI do cliente cria o app + consente + fornece client id/secret e tenant id).
- **MFA/política de senha** = responsabilidade do Entra (fora do app).
- **Sem SCIM** (provisionamento automático): a allowlist é gerida **manualmente** pelo admin.
- **SAML SSO** (IdP-initiated, enterprise) fica como **upgrade futuro** (requer Supabase Pro).

## 5. Critérios de Aceitação

- [ ] **CA-001:** "Entrar com a Microsoft" autentica um usuário do **tenant do cliente** e cria sessão.
- [ ] **CA-002:** E-mail fora do tenant/allowlist é **negado** com mensagem pt-BR (sem criar acesso) e auditado.
- [ ] **CA-003:** Admin pré-autoriza e-mail+papel; no **1º login** o usuário entra com o **papel certo**.
- [ ] **CA-004:** Admin **desativa** um usuário → ele não loga mais e a sessão viva é **revogada**.
- [ ] **CA-005:** Usuário edita o **nome** em `/conta`; vê e-mail/papel; **não há** campo de senha.
- [ ] **CA-006:** **Break-glass**: o admin local (e-mail/senha) loga mesmo com o Entra indisponível.
- [ ] **CA-007:** Eventos de auth (login/negação/papel/ativação) aparecem na **auditoria**.

## 6. Plano de Testes

### 6.1 Testes Unitários
Regra de autorização (`autorizado(email, tenant, allowlist) → allow|deny`); sincronização JIT
(`upsertProfileFromEntra`); guarda admin-only das actions; shape dos eventos de auditoria de auth.

### 6.2 Testes de Integração
`inviteUser`→login JIT cria `profiles` com papel; `setUserStatus(inactive)` revoga sessão e barra
no middleware; e-mail não-allowlisted → negado; `revokeSessions` invalida o refresh token.

### 6.3 Testes de Aceitação
Roteiro CA-001..CA-007 com um tenant Entra de teste (ou mock do provider) + a allowlist.

### 6.4 Casos de Borda (Edge Cases)
- Usuário do tenant **sem** allowlist (negado, não vira "pending" silencioso).
- Troca de papel **enquanto logado** (próxima navegação reflete; sessão pode exigir refresh).
- Desativar o **próprio** admin (bloquear auto-lockout do último admin ativo).
- Break-glass desabilitado por engano (garantir ao menos 1 admin local sempre).
- E-mail do Entra com caixa diferente (normalizar lower-case na allowlist).

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Cliente demora/dificulta o App Registration no Entra | **Alta** | Alto | Documento de "o que pedir à TI"; usar tenant de teste p/ desenvolver; break-glass destrava operação |
| Auto-lockout (desativar o último admin / Entra mal configurado) | Média | Alto | Break-glass local sempre ativo; impedir desativar o último admin; testar CA-006 cedo |
| Qualquer conta do tenant logar sem autorização | Média | Alto | Allowlist obrigatória + negação default; nunca auto-provisionar como operator |
| Vazamento do client secret do Azure | Baixa | Alto | Secret só no Supabase; rotação documentada; sem secret em código (PRD §13) |
| Custo/escopo do SAML se exigirem enterprise | Baixa | Médio | OIDC entrega o SSO agora; SAML como upgrade isolado (Supabase Pro) |

## 8. Dependências

### 8.1 Dependências Internas
**002** (DB/RLS/`profiles`), **005** (login/middleware/papéis/auditoria de ações). Liga com **010**
(retenção da auditoria de auth). Não bloqueia 009/012.

### 8.2 Dependências Externas
- **App Registration no tenant Microsoft Entra ID do cliente** (client id/secret, tenant id, redirect).
- Provider **Azure** do Supabase (config no dashboard).
- Eventualmente Supabase **Pro** se evoluir p/ SAML (não agora).

## 9. Observações e Decisões de Design
- **OIDC, não SAML, por ora:** o provider Azure do Supabase entrega "Entrar com a Microsoft" grátis
  e suficiente p/ 1–N operadores; SAML é upgrade isolado se o cliente exigir SSO enterprise.
- **Papel no app, não em grupo do Entra:** mantém o modelo da 005 (`profiles`) e evita acoplar a
  estrutura de grupos do cliente. Mapear de **grupos do Entra** (claim `groups`) fica como evolução.
- **Allowlist, não auto-JIT:** num sistema fechado, **nem todo** usuário do tenant deve acessar o
  app de survey; a autorização é **opt-in** pelo admin (default = negado).
- **Break-glass é decisão de resiliência:** mantém 1 admin local p/ não depender 100% do Entra
  (config errada/indisponibilidade não pode trancar todo mundo para fora).
- **Senha/MFA somem do app:** com Entra, esses fluxos são da Microsoft — reduz superfície e
  responsabilidade. Se um dia voltar a "contas locais", reabrir como impl. à parte.
- **`email` denormalizado em `profiles`:** o admin precisa listar/buscar por e-mail sem cruzar com
  `auth.users` (schema gerido pelo Supabase).

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
