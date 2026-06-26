# Infraestrutura Collabora Online e WOPI Host

> **ID:** 011
> **Status:** 🟢 Concluída
> **Prioridade:** 🔴 Crítica
> **Criada em:** 2026-06-26
> **Última atualização:** 2026-06-26
> **Autor:** Agente AI

---

## 1. Resumo Executivo

Provisionar o **Collabora Online (CODE)** self-hosted e implementar um **WOPI host** no app
Next.js, para que o **LibreOffice rode dentro do browser** editando o `.docx` real do relatório.
Entrega a fundação técnica: o Collabora abre, edita e salva um `working.docx` por relatório,
autenticado por token WOPI de curta duração, com os blobs no Supabase Storage. É pré-requisito
do editor nativo (impl. 012) e não altera ainda o fluxo de geração de PDF.

## 2. Contexto e Motivação

### 2.1 Problema Atual
O editor TipTap (008) renderiza o `document_json` com um motor (ProseMirror/CSS) **diferente**
do que gera o PDF final — o `.docx` nativo do `buildDocx` convertido por LibreOffice (004, pivot
2026-06-24). Pior: o `document_json` **nem é lido** na geração do PDF
([`loadReport`](../../apps/worker/src/jobs/generatePdf.ts) não o seleciona). Resultado: o operador
edita um artefato que diverge visualmente do final e que sequer alimenta o PDF.

### 2.2 Impacto do Problema
O cliente exige que o documento editado seja **idêntico** ao PDF entregue. Hoje o operador
trabalha "às cegas", o que quebra a UX e a regra de negócio. Fidelidade 100% só é possível usando
**o mesmo motor** (LibreOffice) na edição e na geração.

### 2.3 Soluções Consideradas

| Solução | Prós | Contras | Decisão |
|---------|------|---------|---------|
| Collabora Online (LibreOffice no browser, via WOPI) | Edição nativa, **mesmo motor do PDF → fidelidade exata**, open source (MPL-2.0) | Serviço a mais (container ~2GB), integração WOPI | ✅ Escolhida |
| docx-preview (render do `.docx` no browser) | Leve, sem infra | **Read-only** (não edita), ~95% (paginação/TOC divergem) | ❌ Descartada |
| TipTap + CSS de impressão (paged.js) | Edição nativa leve | **Nunca pixel-exato** vs. LibreOffice; esteira de fidelidade infinita | ❌ Descartada |
| ZetaOffice (LibreOffice em WASM, client-side) | Sem servidor | **Beta aberto** (2025) — imaturo para entrega | ❌ Descartada (revisitar) |

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura

```
  Browser (operador)                    VPS / docker-compose
 ┌──────────────────┐         ┌───────────────────────────────────┐
 │  <iframe>        │  WS/HTTP│  caddy ──▶ collabora/code :9980    │
 │  Collabora UI    │◀───────▶│              │  (LibreOffice LOK)  │
 └──────────────────┘         │              │ WOPI (server→server)│
        ▲                     │              ▼                    │
        │ discovery + token   │      app (Next.js) WOPI host       │
        │                     │   /api/wopi/files/{id}[/contents]  │
        └─────────────────────┤              │                    │
                              │              ▼                    │
                              │      Supabase Storage             │
                              │      reports/{id}/working.docx    │
                              └───────────────────────────────────┘
```

O Collabora carrega/salva o documento **falando WOPI com o nosso app** (server-to-server) — por
isso o WOPI host autentica por **access_token** próprio (não pela sessão Supabase do browser).

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|-----------|------|------|-----------|
| `docker-compose.yml` | Arquivo | Modificar | Serviço `collabora` (imagem `collabora/code`), aliasgroup do domínio do app, `ssl.enable=false` (TLS no Caddy) |
| `Caddyfile` | Arquivo | Modificar | Rota para o Collabora (`/browser/*`, `/hosting/*`, `/cool/*`) → `reverse_proxy collabora:9980`, com upgrade de WebSocket |
| `.env.example` | Arquivo | Modificar | `COLLABORA_URL`, `WOPI_PUBLIC_URL`, `WOPI_TOKEN_SECRET`, `COLLABORA_ALIASGROUP` |
| `apps/web/lib/wopi/token.ts` | Arquivo | Criar | Assina/verifica access_token (HMAC) com `{reportId, userId, canWrite, exp}` |
| `apps/web/lib/wopi/discovery.ts` | Arquivo | Criar | Busca e cacheia `/hosting/discovery`; resolve o `urlsrc` do `.docx` |
| `apps/web/app/api/wopi/files/[id]/route.ts` | Arquivo | Criar | **CheckFileInfo** (GET) + **Lock/Unlock/RefreshLock/GetLock** (POST, `X-WOPI-Override`) |
| `apps/web/app/api/wopi/files/[id]/contents/route.ts` | Arquivo | Criar | **GetFile** (GET) e **PutFile** (POST) — lê/grava `working.docx` no Storage |
| `packages/db/migrations/0006_collabora.sql` | Arquivo | Criar | Colunas `working_docx_path`, `wopi_lock`, `wopi_lock_expires_at` em `reports` |
| `packages/db/types/database.ts` | Arquivo | Modificar | Tipos das novas colunas |

### 3.3 Interfaces e Contratos

#### Entradas
- `access_token` (query/header) emitido pelo app, validado em toda chamada WOPI.
- `fileId` = `reports.id` (UUID) no path.
- Corpo binário `.docx` no PutFile.

#### Saídas / Contratos WOPI
- **CheckFileInfo** `GET /api/wopi/files/{id}` → JSON:
  `{ BaseFileName, Size, OwnerId, UserId, UserFriendlyName, UserCanWrite, Version, LastModifiedTime, PostMessageOrigin }`.
- **GetFile** `GET /api/wopi/files/{id}/contents` → `application/octet-stream` (bytes do `working.docx`).
- **PutFile** `POST /api/wopi/files/{id}/contents` (`X-WOPI-Override: PUT`, header `X-WOPI-Lock`) → grava no Storage; 200 com novo `LastModifiedTime`; **409** se o lock não confere.
- **Lock/Unlock/RefreshLock/GetLock** `POST /api/wopi/files/{id}` (`X-WOPI-Override`, `X-WOPI-Lock`) → 200/409 conforme o estado do lock.

#### Token (formato)
HMAC-SHA256 sobre `base64url({reportId, userId, canWrite, exp})` usando `WOPI_TOKEN_SECRET`.
TTL ≤ 60 min (`access_token_ttl` informado ao Collabora na montagem do iframe — feito na 012).

### 3.4 Modelos de Dados

Migration `0006_collabora.sql` (em `reports`):
- `working_docx_path text` — caminho do `.docx` editável no Storage (convenção `{id}/working.docx`).
- `wopi_lock text` — lock WOPI corrente (string opaca do Collabora) ou `null`.
- `wopi_lock_expires_at timestamptz` — expiração do lock (≈ 30 min, renovado por RefreshLock).

Layout no Storage (bucket `reports`, já existente): `reports/{id}/working.docx` (novo, editável).
**Não** altera `final-v{n}.pdf`/`final.docx`/`preview.pdf` (geridos pela 004/012).

### 3.5 Fluxo de Execução
1. (Na 012) o app monta a URL do iframe via `discovery` + `WOPISrc` + `access_token`.
2. Collabora chama **CheckFileInfo** → app valida o token, devolve metadados do `working.docx`.
3. Collabora chama **GetFile** → app baixa do Storage e devolve os bytes.
4. Operador edita; Collabora autossalva chamando **PutFile** → app grava no Storage (valida lock).
5. **Lock** na abertura para escrita; **RefreshLock** periódico; **Unlock** ao fechar.

### 3.6 Tratamento de Erros
- Token inválido/expirado → **401**; Collabora encerra a sessão.
- Lock divergente no PutFile/Unlock → **409** com `X-WOPI-Lock` atual (protocolo WOPI).
- Falha de Storage no GetFile/PutFile → **500**; Collabora reapresenta erro e mantém a cópia local.
- Collabora indisponível → o iframe (012) mostra estado de erro; o relatório permanece em `editing`.

## 4. Requisitos

### 4.1 Requisitos Funcionais
- **RF-001:** Subir o `collabora/code` via `docker-compose`, acessível atrás do Caddy (WS + HTTP).
- **RF-002:** `/hosting/discovery` do Collabora acessível e parseado pelo app (resolver `urlsrc` do `.docx`).
- **RF-003:** Endpoint **CheckFileInfo** conforme contrato WOPI, autenticado por token.
- **RF-004:** Endpoints **GetFile**/**PutFile** lendo/gravando `working.docx` no Storage.
- **RF-005:** **Lock/Unlock/RefreshLock/GetLock** implementados (persistidos em `reports.wopi_lock`).
- **RF-006:** Emissão/validação de access_token assinado, com `canWrite` e expiração.
- **RF-007:** Migration com as colunas `working_docx_path`, `wopi_lock`, `wopi_lock_expires_at`.

### 4.2 Requisitos Não-Funcionais
- **RNF-001:** TLS terminado no Caddy; Collabora roda com `ssl.enable=false` atrás do proxy.
- **RNF-002:** Token TTL ≤ 60 min; segredo só em env var (PRD §13).
- **RNF-003:** `frame-ancestors`/CSP permitindo o iframe do Collabora apenas no mesmo domínio.
- **RNF-004:** Mensagens de erro do app em pt-BR; UI do Collabora segue o locale do browser.

### 4.3 Restrições e Limitações
- Apenas **CODE** (open source, MPL-2.0). Versão paga é opcional (suporte/SLA) — fora de escopo.
- **Não** altera `generate_pdf`/`preview_pdf` nem a tela do editor — isso é a impl. 012.
- Edição colaborativa simultânea continua não-objetivo (PRD §1): lock simples de 1 escritor.

## 5. Critérios de Aceitação

- [ ] **CA-001:** `docker compose up` sobe o Collabora e o `/hosting/discovery` responde 200.
- [ ] **CA-002:** Um `working.docx` de fixture (ex.: `.tmp_report.docx`) **abre** no Collabora via iframe de teste e renderiza fiel.
- [ ] **CA-003:** Editar no Collabora e a alteração é **persistida** no Storage (PutFile grava `working.docx`).
- [ ] **CA-004:** access_token inválido/expirado é **rejeitado** (401) em CheckFileInfo/GetFile.
- [ ] **CA-005:** Com lock ativo, uma 2ª sessão de escrita recebe **409** (não sobrescreve).

## 6. Plano de Testes

### 6.1 Testes Unitários
`token.ts` (assinar/verificar, expiração, adulteração → inválido); shape do CheckFileInfo;
parser do discovery (extrai `urlsrc` do `.docx`).

### 6.2 Testes de Integração
PutFile grava no Storage e CheckFileInfo reflete o novo `Size`/`LastModifiedTime`; ciclo
Lock→PutFile(ok)→Unlock; PutFile com lock errado → 409.

### 6.3 Testes de Aceitação
Roteiro manual CA-001..CA-005 com o container local e um `working.docx` de fixture.

### 6.4 Casos de Borda (Edge Cases)
- GetFile de relatório sem `working.docx` (404 controlado).
- PutFile concorrente (dois saves) — o lock serializa; o 2º recebe 409.
- Token válido mas `canWrite=false` (preview/aprovado) → PutFile barrado (403).
- Reinício do container Collabora durante edição (reabrir recupera do Storage).

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Collabora não alcança o WOPI host (aliasgroup/allow-list) | Média | Alto | Configurar `aliasgroup1` com o domínio do app; testar discovery+CheckFileInfo cedo (CA-001/002) |
| Segurança do access_token (vazamento/replay) | Média | Alto | HMAC + TTL curto + `canWrite` por relatório; validar em toda chamada |
| iframe bloqueado por CSP/`X-Frame-Options` | Média | Médio | Ajustar `frame-ancestors` no Caddy/next.config para o domínio do Collabora |
| Consumo de RAM no VPS | Média | Médio | 1–3 operadores → poucos docs; monitorar `docker stats`; limite de memória no serviço |
| CODE "não recomendado p/ produção" (sem suporte) | Baixa | Médio | Aceito p/ ferramenta interna atrás de login; updates de imagem aplicados manualmente |

## 8. Dependências

### 8.1 Dependências Internas
**002** (Storage/DB/RLS), **004** (o `buildDocx` produz o `working.docx` — consumido na 012; aqui
basta um `.docx` de fixture). Não depende da 008.

### 8.2 Dependências Externas
Imagem `collabora/code` (Docker Hub). Lib de assinatura (`jose` ou `node:crypto` HMAC nativo).
Protocolo WOPI (documentação Collabora SDK).

## 9. Observações e Decisões de Design
- **Subdomínio vs. path:** o Collabora opera bem em path (`/browser`, `/cool`, `/hosting`) atrás do
  Caddy; usar subdomínio (`office.<domínio>`) é alternativa mais limpa em produção. Decisão default:
  **path no mesmo domínio** (sem DNS extra no dev); reavaliar no deploy (impl. 001/VPS).
- **Token:** HMAC nativo (`node:crypto`) evita dependência nova; migrar p/ `jose`/JWT se precisar de claims ricos.
- **Locale:** a barra do Collabora segue o navegador; a chrome do app (botões Preview/Aprovar) é da 012, em pt-BR.
- `document_json` permanece no schema como **legado** (não usado pelo editor a partir da 012); não é dropado aqui.

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
