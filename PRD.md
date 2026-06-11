# PRD — Sistema de Relatórios Automatizados Naabsa

> **Como usar este documento (AI-driven development):** este PRD é a fonte de verdade do projeto. Cada requisito tem um ID (`RF-xx`, `RNF-xx`) e cada tarefa do plano (seção 12) referencia os requisitos que implementa e tem critérios de aceite verificáveis por teste ou inspeção. Implemente **uma tarefa por vez**, na ordem dos milestones, rodando os testes antes de considerar a tarefa concluída. Em caso de conflito entre este PRD e qualquer outra fonte, este PRD prevalece; se uma decisão necessária não estiver coberta aqui, registre a dúvida e pergunte antes de implementar.

---

## 1. Visão geral

**Produto:** sistema web interno que automatiza a produção dos relatórios de inspeção marítima da Naabsa Marine Surveyors & Consultants.

**Problema:** hoje 5 tipos de relatório são montados manualmente — copiar dados de planilhas para o documento, posicionar fotos uma a uma, gerar PDF. Lento, repetitivo e sujeito a erro.

**Solução:** o operador sobe a planilha pré-moldada; o sistema extrai e valida os dados, distribui as fotos (com sugestão de IA), abre o documento num editor rico para ajustes finais e gera o PDF — com auditoria completa e o operador como autoridade final sobre tudo.

**Volume:** 30–50 relatórios/mês, 1–3 operadores internos.

**Não-objetivos (fora de escopo):** upload de fotos pelo surveyor em campo; edição colaborativa simultânea; geração de DOCX; multi-tenancy; qualquer decisão autônoma de IA sem confirmação humana.

---

## 2. Stack e decisões técnicas (fixas — não reavaliar)

| Camada | Tecnologia | Observações |
|---|---|---|
| Frontend + API | Next.js 15+ (App Router) + TypeScript estrito | Server Actions para mutações simples; Route Handlers para upload/stream |
| Banco / Auth / Storage | Supabase (hosted) | Postgres com RLS; Storage com URLs assinadas |
| Fila de jobs | pg-boss (sobre o Postgres do Supabase) | Sem Redis. Jobs: `process_photo`, `generate_pdf`, `retention_purge`, `ai_review` |
| Worker | Processo Node separado (container próprio) | Consome pg-boss; roda Playwright/Chromium; concorrência 1 |
| Editor | TipTap OSS (MIT) | Modo pageless + preview paginado. NÃO usar extensões pagas (@tiptap-pro) |
| Leitura de planilha | ExcelJS | |
| Processamento de imagem | sharp | EXIF orientation, resize, compressão, thumbnails |
| Geração de PDF | Playwright (Chromium headless) no worker | `page.pdf()` sobre rota interna de impressão |
| IA (Fase 4) | API Anthropic (modelo com visão) | Somente sugestões; sistema funciona sem IA |
| Crop de fotos na UI | react-easy-crop | |
| Deploy | Docker Compose em VPS (Hostinger KVM2: 2 vCPU, 8 GB) | Containers: `app`, `worker`, `caddy` (TLS) |
| Testes | Vitest (unit) + Playwright (e2e) + golden tests de PDF | |

**Princípios invioláveis:**
1. **Extração determinística.** A leitura de dados da planilha NUNCA usa IA. IA só analisa dados já extraídos (pós-motor) e fotos.
2. **Motor genérico.** Nenhum código conhece um relatório específico; todo conhecimento de relatório vive nos specs (JSONB) e nos templates de documento.
3. **Operador decide.** Toda sugestão de IA chega marcada (`ai_suggested`) e exige confirmação explícita.
4. **Fotos não quebram layout.** Slots de foto têm dimensão fixa; a imagem se adapta ao frame (`object-fit: cover`), nunca o contrário.
5. **Preview = PDF.** O preview paginado e o PDF final usam o mesmo componente React e o mesmo engine (Chromium). Divergência entre eles é bug crítico.

---

## 3. Domínio

### 3.1 Tipos de relatório e variantes

| `report_type.slug` | Nome | Variantes (`variant`) | Variante muda |
|---|---|---|---|
| `draft_survey` | Draft Survey | `loading` \| `discharge` | texto estático |
| `bunker_surveyor` | Bunker Surveyor | `loading` \| `discharge` | texto estático |
| `msc` | MSC | — (`null`) | — |
| `on_off_hire` | On/Off-Hire | `on_hire` \| `off_hire` | texto estático **e** mapeamento de dados |
| `rob` | ROB | — (`null`) | — |

A variante é escolhida na criação do relatório, **antes** do upload da planilha.

### 3.2 Máquina de estados do relatório (`reports.status`)

```
draft ──upload planilha──▶ extracted ──operador abre revisão──▶ in_review
in_review ──dados confirmados + fotos completas──▶ editing
editing ──operador aprova──▶ approved ──worker gera PDF──▶ generated
generated ──job de retenção (30d)──▶ purged
qualquer estado (exceto generated/purged) ──operador──▶ draft (reiniciar com nova planilha)
```

Transições fora desse grafo devem ser rejeitadas com erro. Toda transição gera linha no `audit_log`.

---

## 4. Requisitos funcionais

### Módulo A — Autenticação e acesso
- **RF-01** Login por e-mail/senha via Supabase Auth. Sem cadastro público; usuários criados por admin.
- **RF-02** Dois papéis: `operator` (fluxo de relatórios) e `admin` (operator + gestão de specs e usuários). RLS reflete os papéis.

### Módulo B — Gestão de relatórios
- **RF-03** Dashboard lista relatórios com tipo, variante, navio, status, data, autor; filtros por tipo/status/período; busca por nome do navio.
- **RF-04** Criação de relatório: seleção de tipo → se o tipo tem variantes, seleção obrigatória da variante → upload da planilha (.xlsx, máx. 20 MB).
- **RF-05** O relatório referencia a versão exata do spec ativo no momento da criação (`reports.spec_id`); mudanças posteriores de spec não afetam relatórios existentes.

### Módulo C — Motor de extração e validação
- **RF-06** O motor lê a planilha conforme o spec (seção 8): localiza a aba, confere o `fingerprint`, lê cada campo (`common` + `by_variant[variant]`), coage tipos (string, number com decimais, date a partir de serial Excel, enum, boolean).
- **RF-07** Validações por campo (`required`, `min`, `max`, `pattern`, `enum`) e regras cruzadas (`validations[]`), cada uma com nível `error` (bloqueia avanço) ou `warning` (exibe e permite seguir).
- **RF-08** Saída do motor: `{ data: Record<string, unknown>, issues: Issue[] }` onde `Issue = { field, cell, level, message }` com mensagens em pt-BR apontando a célula (ex.: `"Campo 'Data do survey' vazio na célula B7"`).
- **RF-09** Fingerprint incompatível (planilha de outro tipo/variante) gera `error` específico identificando o tipo detectado.
- **RF-10** Resultado da extração é persistido em `reports.extracted_data` (imutável após gravado; correções vão em `operator_overrides`).

### Módulo D — Revisão de dados
- **RF-11** Tela de revisão exibe todos os campos do spec agrupados por `section`, com valor extraído, célula de origem e issues coloridas por nível.
- **RF-12** Operador edita valores inline; cada edição grava em `reports.operator_overrides[field]` (nunca sobrescreve `extracted_data`) e registra no `audit_log`.
- **RF-13** Valor efetivo de um campo = `operator_overrides[field] ?? extracted_data[field]`. Função utilitária única `resolveFieldValue()` usada em todo o sistema.
- **RF-14** Avanço para a etapa de fotos bloqueado enquanto houver issue de nível `error` não resolvida.

### Módulo E — Fotos
- **RF-15** Upload em lote (multi-arquivo, jpg/png/heic, máx. 15 MB/foto). Cada foto entra na fila `process_photo`.
- **RF-16** Processamento (worker): corrigir EXIF orientation, converter para JPEG, limitar lado maior a 2500 px, qualidade 82, gerar thumbnail 400 px. Salvar original e processada no Storage.
- **RF-17** Tela de alocação: galeria de fotos à esquerda; slots do spec à direita com label, aspect ratio, obrigatoriedade e contagem `min/max`; drag-and-drop de foto para slot; reordenação dentro do slot.
- **RF-18** Crop: ao clicar na foto alocada, modal com react-easy-crop travado no aspect ratio do slot; crop salvo como `{x, y, width, height}` relativo à imagem processada.
- **RF-19** Avanço para edição bloqueado enquanto slots `required`/`min` não estiverem satisfeitos.

### Módulo F — Editor (TipTap)
- **RF-20** Ao entrar em `editing` pela primeira vez, o sistema monta `reports.document_json` a partir do template do tipo (componente de montagem por spec/variante) + dados efetivos + fotos confirmadas.
- **RF-21** Editor TipTap em modo contínuo (pageless) com toolbar: parágrafo/headings, bold/italic/underline, alinhamento, listas, tabela simples, undo/redo, localizar.
- **RF-22** Nós customizados travados: `photoFrame` (dimensão fixa, não editável, não deletável) e `dataTable` (tabela de dados estruturados, não editável). Tentativas de edição/deleção são bloqueadas por filtro de transação ProseMirror.
- **RF-23** Valores vindos da planilha são marcados com mark `dataField` (atributo `field`); visual sutil (highlight no hover).
- **RF-24** Autosave com debounce de 2 s para `document_json`; snapshot no `audit_log` a cada transição de status e no máximo a cada 5 min de edição contínua.
- **RF-25** Botão **Preview** abre a renderização paginada (rota `/reports/[id]/print`) em painel/iframe — mesma rota usada pelo worker para o PDF.
- **RF-26** Botão **Aprovar e gerar PDF** transiciona para `approved` e enfileira `generate_pdf`.

### Módulo G — Geração de PDF
- **RF-27** Rota interna `/reports/[id]/print` (protegida por token de serviço) renderiza o `document_json` com CSS de impressão: `@page` A4, margens 2 cm, `break-inside: avoid` em photoFrames e dataTables, rodapé com numeração.
- **RF-28** Worker: carrega a rota com Playwright, `page.pdf({ format: 'A4', printBackground: true })`, salva no Storage (`reports/{id}/final.pdf`), grava hash SHA-256 do `document_json` usado, transiciona para `generated`.
- **RF-29** UI faz polling do status; em `generated`, exibe botão de download (URL assinada).
- **RF-30** Ação **Regenerar** disponível em `generated`: volta a `editing` mantendo o `document_json` atual (nova edição → nova aprovação → novo PDF versionado `final-v{n}.pdf`).

### Módulo H — Retenção e auditoria
- **RF-31** Job diário `retention_purge`: relatórios `generated` há mais de 30 dias → apagar do Storage fotos (originais, processadas, thumbnails) e planilha; **manter** PDF(s) e dados no banco; status → `purged`, `purged_at` preenchido.
- **RF-32** `audit_log` registra: criação, upload, resultado de extração (resumo), cada override de campo, cada alocação/confirmação de foto, snapshots de edição, transições de status, geração, purge — com `actor`, `action`, `payload`, `created_at`.
- **RF-33** Tela de histórico do relatório exibe o `audit_log` em ordem cronológica legível.

### Módulo I — Administração de specs
- **RF-34** Admin lista specs por tipo com versões; cria nova versão colando JSON, validado contra o JSON Schema da seção 8 antes de salvar; ativa uma versão por tipo (`report_types.active_spec_id`).
- **RF-35** Specs são imutáveis após criação (updates negados por RLS/constraint).

### Módulo J — IA (Fase 4; tudo atrás de flag `AI_ENABLED`)
- **RF-36** Job `ai_review` (pós-extração): envia **somente** os dados extraídos + metadados do spec ao modelo; retorno vira issues de nível `warning` com origem `ai`, exibidas na revisão como as demais. Falha/timeout da IA não bloqueia o fluxo.
- **RF-37** Sugestão de fotos: ao concluir o processamento do lote, classificar cada foto (visão) sugerindo `slot_id` e flags de qualidade (`dark`, `blurry`, `possible_duplicate`); aplicar como pré-alocação com `ai_suggested = true`; operador confirma/move (confirmação zera a flag).
- **RF-38** Toda chamada de IA é registrada (`audit_log`, action `ai_call`) com finalidade e duração; nunca enviar a planilha bruta nem fotos originais sem redimensionar (usar versão processada).

---

## 5. Requisitos não funcionais

- **RNF-01 Confiabilidade da extração:** para uma mesma planilha + spec, a saída do motor é byte-idêntica (determinismo testado).
- **RNF-02 Fidelidade do PDF:** preview e PDF usam a mesma rota; golden tests comparam render rasterizado (tolerância ≤ 0,5% de pixels).
- **RNF-03 Performance:** extração < 5 s para planilhas de até 5 MB; geração de PDF < 60 s; processamento de foto < 10 s/foto.
- **RNF-04 Concorrência:** worker com concorrência 1 para `generate_pdf`; até 4 para `process_photo`.
- **RNF-05 Segurança:** RLS em todas as tabelas; arquivos só por URL assinada (validade ≤ 10 min); rota `/print` exige token de serviço; secrets via env, nunca no repositório.
- **RNF-06 Resiliência de IA:** com `AI_ENABLED=false` ou IA fora do ar, todo o fluxo funciona; nenhum caminho crítico depende de IA.
- **RNF-07 Auditabilidade:** qualquer relatório `generated` permite responder "que dado veio da planilha, o que foi editado, por quem e quando".
- **RNF-08 Recursos do VPS:** app + worker + Chromium operando dentro de 8 GB RAM; Chromium reutilizado entre jobs (singleton no worker).
- **RNF-09 i18n:** toda a UI e mensagens em pt-BR; datas no formato definido pelo spec de cada campo.

---

## 6. Modelo de dados (DDL de referência)

```sql
create type report_status as enum
  ('draft','extracted','in_review','editing','approved','generated','purged');

create table report_types (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,            -- draft_survey | bunker_surveyor | msc | on_off_hire | rob
  name text not null,
  variants text[] not null default '{}',-- vazio = sem variantes
  active_spec_id uuid                   -- fk adicionada após report_specs
);

create table report_specs (
  id uuid primary key default gen_random_uuid(),
  report_type_id uuid not null references report_types(id),
  version int not null,
  spec jsonb not null,                  -- ver seção 8
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (report_type_id, version)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  report_type_id uuid not null references report_types(id),
  spec_id uuid not null references report_specs(id),
  variant text,
  status report_status not null default 'draft',
  vessel_name text,                     -- denormalizado p/ dashboard (preenchido pós-extração)
  spreadsheet_path text,
  extracted_data jsonb,
  extraction_issues jsonb,              -- Issue[]
  operator_overrides jsonb not null default '{}',
  document_json jsonb,                  -- documento TipTap
  pdf_paths text[] not null default '{}',
  document_hash text,                   -- sha256 do document_json usado no último PDF
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  purged_at timestamptz
);

create table report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  original_path text not null,
  processed_path text,
  thumb_path text,
  slot_id text,                         -- null = não alocada
  position int not null default 0,
  crop jsonb,                           -- {x,y,width,height} relativo à processada
  quality_flags text[] not null default '{}',
  ai_suggested boolean not null default false,
  confirmed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  report_id uuid references reports(id) on delete set null,
  actor uuid references auth.users(id), -- null = sistema/worker
  action text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table profiles (                  -- papel do usuário
  user_id uuid primary key references auth.users(id),
  role text not null check (role in ('operator','admin')),
  display_name text not null
);
```

RLS (resumo): `profiles` legível pelo próprio usuário e por admin; `reports`/`report_photos`/`audit_log` acessíveis a usuários autenticados com papel; `report_specs` e `report_types` leitura para todos autenticados, escrita só admin; updates em `report_specs` proibidos (imutável). O worker usa service role.

---

## 7. Estrutura de pastas (monorepo simples)

```
/
├── docker-compose.yml          # app, worker, caddy
├── PRD.md                      # este documento
├── CLAUDE.md                   # convenções para o agente
├── apps/
│   ├── web/                    # Next.js
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (app)/dashboard/
│   │   │   ├── (app)/reports/[id]/{review,photos,edit,history}/
│   │   │   ├── (app)/admin/specs/
│   │   │   ├── reports/[id]/print/   # rota de impressão (token de serviço)
│   │   │   └── api/...
│   │   ├── components/{editor,photos,review,print}/
│   │   └── lib/
│   └── worker/                 # processo pg-boss + Playwright + sharp
│       └── src/jobs/{processPhoto,generatePdf,retentionPurge,aiReview}.ts
├── packages/
│   ├── core/                   # MOTOR: extração, validação, tipos, resolveFieldValue
│   │   └── src/{extractor,spec-schema,document-builder}/
│   └── db/                     # migrations SQL, tipos gerados do Supabase
└── tests/
    ├── golden/                 # planilhas + fotos + PDFs de referência por tipo
    └── fixtures/
```

Regra: **`packages/core` não importa nada de Next.js, Supabase ou worker** — é TypeScript puro, 100% testável por unit test. O document-builder (template → TipTap JSON) também vive aqui.

---

## 8. Formato do report spec (contrato JSONB)

JSON Schema completo em `packages/core/src/spec-schema/spec.schema.json` (criar na T-04). Estrutura:

```jsonc
{
  "report_type": "on_off_hire",
  "version": 1,
  "variants": ["on_hire", "off_hire"],     // [] quando não há variantes
  "source": {
    "sheet": "DADOS",
    "fingerprint": { "cell": "A1", "expect": "NAABSA-ONOFF" },
    "common": {
      "fields": {
        "vessel_name": { "cell": "B4", "type": "string", "required": true,
                          "label": "Nome do navio", "section": "Identificação" },
        "port":        { "cell": "B5", "type": "string", "required": true,
                          "label": "Porto", "section": "Identificação" }
      }
    },
    "by_variant": {
      "on_hire":  { "fields": { "delivery_date":   { "cell": "B9", "type": "date",
                      "format": "DD/MMM/YYYY", "required": true,
                      "label": "Data de entrega", "section": "Operação" } } },
      "off_hire": { "fields": { "redelivery_date": { "cell": "B9", "type": "date",
                      "format": "DD/MMM/YYYY", "required": true,
                      "label": "Data de devolução", "section": "Operação" } } }
    }
  },
  "validations": [
    { "rule": "compare", "left": "completion_date", "op": ">=", "right": "start_date",
      "level": "error", "message": "Data de conclusão anterior à de início" },
    { "rule": "range", "field": "cargo_weight", "min": 0, "max": 200000,
      "level": "warning", "message": "Peso de carga fora do intervalo usual" }
  ],
  "photo_slots": [
    { "id": "draft_fwd", "label": "Calado de proa", "aspect": "4:3", "required": true, "max": 1 },
    { "id": "holds", "label": "Porões", "aspect": "16:9", "min": 2, "max": 6 }
  ]
}
```

Tipos de campo: `string | number | date | enum | boolean`. `number` aceita `decimals`; `date` exige `format`; `enum` exige `options[]`.

---

## 9. Documento TipTap (schema do editor)

Extensões OSS: StarterKit, Table, TextAlign, Underline. Custom nodes (em `apps/web/components/editor/nodes/`):

- **`photoFrame`** — atrs: `{ slotId, photoId, src, widthMm, heightMm }`. Atom, `selectable: false`, `draggable: false`. Render: frame de dimensão fixa com `object-fit: cover`. Deleção/edição barrada por `filterTransaction`.
- **`dataTable`** — atrs: `{ tableId, rows }`. Atom não editável; render de tabela estilizada.
- **mark `dataField`** — atrs: `{ field }`. Sem efeito de edição; highlight no hover.

**Montagem (document-builder):** para cada `report_type` existe um builder em `packages/core/src/document-builder/{slug}.ts` que recebe `{ spec, variant, data, photos }` e retorna o JSON TipTap completo (texto fixo + condicionais por variante + photoFrames + dataTables + dataFields). Texto estático dos relatórios vive em `packages/core/src/document-builder/content/{slug}.{variant}.ts` (a partir dos modelos Word fornecidos pelo cliente).

**Impressão:** componente `PrintDocument` renderiza o mesmo JSON com CSS `@media print` / classes de página. Nenhuma lógica de conteúdo duplicada entre editor e print — ambos derivam do mesmo JSON.

---

## 10. Telas (resumo de aceitação visual)

1. **Login** — e-mail/senha, erros claros.
2. **Dashboard** — tabela com filtros (RF-03), badge de status colorida, CTA "Novo relatório".
3. **Novo relatório** — wizard: tipo → variante (se houver) → upload com barra de progresso.
4. **Revisão** (`/reports/[id]/review`) — campos por seção, issues inline, edição com indicação visual de override, botão "Confirmar dados" (RF-14).
5. **Fotos** (`/photos`) — galeria + slots, drag-and-drop, modal de crop, contadores, banner de sugestões de IA quando houver (RF-37).
6. **Editor** (`/edit`) — canvas pageless, toolbar, indicador de autosave, botões Preview e Aprovar.
7. **Preview/print** — render paginado fiel.
8. **Histórico** (`/history`) — timeline do audit_log.
9. **Admin specs** — listagem, editor JSON com validação, ativação de versão.

Identidade visual: fundo branco, preto `#141414` e cinza-rocha `#7d7468` como cor de apoio (mesma paleta dos documentos comerciais do projeto).

---

## 11. Estratégia de testes

- **Unit (Vitest):** `packages/core` com cobertura alta — extractor (tipos, datas seriais do Excel, fingerprint, issues), validações, `resolveFieldValue`, document-builders (JSON esperado por fixture).
- **Golden tests de PDF:** para cada tipo × variante, fixture em `tests/golden/{slug}.{variant}/` com `input.xlsx`, `photos/`, `expected.pdf`. Pipeline de teste: extrai → monta documento → gera PDF → rasteriza ambos (pdf2image/pdfium) → diff de pixels (falha se > 0,5%). Roda no CI a cada mudança em core, templates ou CSS de impressão.
- **E2E (Playwright):** fluxo feliz completo de 1 relatório (criar → upload → revisar → fotos → editar → aprovar → baixar PDF) contra Supabase local/branch.
- **Determinismo (RNF-01):** teste que roda o extractor 3× sobre a mesma fixture e exige igualdade profunda.

---

## 12. Plano de implementação AI-driven (milestones e tarefas)

> **Protocolo por tarefa:** (1) ler os RFs referenciados; (2) implementar; (3) escrever/atualizar testes da tarefa; (4) rodar `pnpm test` e o lint; (5) só então marcar concluída e seguir para a próxima. Não iniciar tarefa de milestone seguinte com tarefas pendentes no atual. Commits pequenos, mensagem referenciando a tarefa (`feat(core): T-05 extractor de campos`).

### M0 — Fundação (sem UI)
| Tarefa | Escopo | Refs | Aceite |
|---|---|---|---|
| T-01 | Monorepo (pnpm workspaces), TS estrito, ESLint/Prettier, Vitest, estrutura da seção 7 | — | `pnpm test` e `pnpm lint` verdes no esqueleto |
| T-02 | Migrations do schema (seção 6) + seed dos 5 `report_types` + RLS | RF-02, RF-35 | Migrations aplicam em Supabase limpo; testes de RLS básicos |
| T-03 | Docker Compose (app, worker, caddy) + Dockerfiles + envs de exemplo | RNF-05, RNF-08 | `docker compose up` sobe app e worker localmente |
| T-04 | JSON Schema do spec + validador (`validateSpec`) | seção 8 | Fixtures válidas passam; 10+ casos inválidos rejeitam com mensagem |

### M1 — Motor (núcleo de maior risco)
| Tarefa | Escopo | Refs | Aceite |
|---|---|---|---|
| T-05 | Extractor: leitura ExcelJS, coerção de tipos, datas seriais, fingerprint | RF-06, RF-09 | Unit tests por tipo de campo; determinismo (RNF-01) |
| T-06 | Validações de campo e cruzadas, geração de `Issue[]` em pt-BR | RF-07, RF-08 | Fixtures com erros conhecidos produzem issues exatas |
| T-07 | Spec real do **primeiro relatório do cliente** + fixture de planilha real | RF-05 | Extração da planilha real sem issues inesperadas |
| T-08 | Document-builder do primeiro relatório (texto fixo + variantes + nodes custom em JSON) | RF-20, seção 9 | Snapshot test do JSON TipTap por variante |
| T-09 | Rota `/print` + `PrintDocument` + CSS de impressão | RF-27 | Render manual fiel ao modelo do cliente |
| T-10 | Worker: pg-boss + job `generate_pdf` com Playwright singleton | RF-28, RNF-04, RNF-08 | PDF gerado da fixture; golden test inicial do tipo 1 |

### M2 — Fluxo do operador
| Tarefa | Escopo | Refs | Aceite |
|---|---|---|---|
| T-11 | Auth (login, profiles, middleware de papel) | RF-01, RF-02 | E2E de login; acesso negado sem papel |
| T-12 | Dashboard + criação de relatório (wizard tipo/variante/upload) | RF-03, RF-04, RF-05 | E2E: criar relatório chega a `extracted` |
| T-13 | Máquina de estados + audit_log de transições | seção 3.2, RF-32 | Transições inválidas rejeitadas; log gravado |
| T-14 | Tela de revisão com overrides e bloqueio por `error` | RF-11..RF-14 | E2E: corrigir campo e avançar |
| T-15 | Upload de fotos + job `process_photo` (sharp) + thumbnails | RF-15, RF-16 | Fotos com EXIF rotacionado saem corretas |
| T-16 | Tela de alocação (drag-and-drop, contadores) + crop | RF-17..RF-19 | E2E: alocar e cropar; bloqueio por slot obrigatório |
| T-17 | Editor TipTap: extensões, nodes travados, autosave, snapshots | RF-21..RF-24 | Tentar deletar photoFrame não altera o doc; autosave persiste |
| T-18 | Preview integrado + aprovação + polling + download | RF-25, RF-26, RF-29 | E2E do fluxo feliz completo (1 relatório de ponta a ponta) |

### M3 — Demais relatórios (teste da abstração)
| Tarefa | Escopo | Refs | Aceite |
|---|---|---|---|
| T-19..T-22 | Para cada um dos 4 tipos restantes: spec + conteúdo do builder + fixtures + golden test | RF-05..RF-10, RF-20 | **Nenhuma alteração em `packages/core` fora de `document-builder/content` e specs**; golden dos 5 tipos verdes |
| T-23 | Admin de specs (CRUD versão + ativação + validação) | RF-34, RF-35 | Spec inválido rejeitado na UI; relatório antigo intacto após nova versão |

### M4 — Robustez e IA
| Tarefa | Escopo | Refs | Aceite |
|---|---|---|---|
| T-24 | Job `retention_purge` + status `purged` + tela de histórico | RF-31, RF-33 | Fixture com data retroativa purga blobs e preserva PDF |
| T-25 | Regenerar PDF versionado | RF-30 | `final-v2.pdf` criado; hash atualizado |
| T-26 | `ai_review` pós-extração (flag `AI_ENABLED`) | RF-36, RF-38, RNF-06 | Com IA off, fluxo idêntico; com IA on, warnings aparecem na revisão |
| T-27 | Sugestão de slots e qualidade de fotos por visão | RF-37, RF-38 | Pré-alocação marcada `ai_suggested`; confirmação zera flag |
| T-28 | Hardening: rate limit de upload, headers de segurança, backup check, README de operação | RNF-05 | Checklist de deploy concluído no VPS |

---

## 13. Variáveis de ambiente

```
# apps/web e apps/worker
SUPABASE_URL=
SUPABASE_ANON_KEY=            # web
SUPABASE_SERVICE_ROLE_KEY=    # worker e rotas de serviço
DATABASE_URL=                 # pg-boss (Postgres do Supabase)
PRINT_SERVICE_TOKEN=          # autenticação da rota /print
APP_BASE_URL=                 # usada pelo worker para abrir /print
AI_ENABLED=false
ANTHROPIC_API_KEY=            # somente quando AI_ENABLED=true
```

---

## 14. Definição de Pronto (global)

Uma tarefa só está pronta quando: implementa integralmente os RFs referenciados; possui testes cobrindo o aceite; `pnpm lint`, `pnpm typecheck` e `pnpm test` passam; nenhum segredo em código; strings de UI em pt-BR; e o `audit_log` cobre as ações introduzidas. O projeto só está pronto quando os golden tests dos 5 tipos passam e o fluxo E2E completo roda contra o ambiente do VPS.

---

## 15. Pendências de insumo (bloqueiam tarefas específicas)

| Insumo | Fornecedor | Bloqueia |
|---|---|---|
| Tipo de relatório prioritário | Cliente | T-07 |
| Modelos Word + exemplos preenchidos (todas as variantes) | Cliente | T-08, T-19..T-22 |
| Planilhas pré-moldadas reais de cada tipo | Cliente | T-07, T-19..T-22 |
| Chave PIX/recebimento e acesso ao VPS | Interno | T-03, T-28 |
