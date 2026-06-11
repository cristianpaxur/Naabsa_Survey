# Logo Brand Screens

_Started 2026-06-11 18:34 UTC_

---

## User

<system-info comment="Only acknowledge these if relevant">
Project title is now "Naabsa Survey"
Project is currently empty (no files)
Current date is now June 11, 2026
</system-info>

<default aesthetic_system_instructions>
The user has not attached a design system. If they have ALSO not attached references or art direction, and the project is empty, you must ASK the user what visual aesthetic they want. Use the questions_v2 tool to ask about preferred vibe, audience, colors, type, mood, etc. Do NOT just pick your own visual aesthetic without getting the user's aesthetic input -- this is how you get slop!

Once answered, use this guidance when creating designs:
- Choose a type pairing from web-safe set or Google Fonts. Helvetica is a good choice. Avoid hard-to-read or overly stylized fonts. Use 1-3 fonts only.
- Foreground and background: choose a color tone (warm, cool, neutral, something in-between). Use subtly-toned whites and blacks; avoid saturations above 0.02 for whites.
- Accents: choose 0-2 additional accent colors using oklch. All accents should share same chroma and lightness; vary hue.
- NEVER write out an SVG yourself that's more complicated than a square, circle, diamond, etc.
- For imagery, never hand-draw SVGs; use subtly-striped SVG placeholders instead with monospace explainers for what should be dropped there (e.g. “product shot”)

CRITICAL: ignore default aesthetic entirely if given other aesthetic instructions like reference images, design systems or guidance, or if there are files in the project already.
</default aesthetic_system_instructions>

<pasted_text name="Pasted text (427 lines)">
# PRD — Sistema de Relatórios Automatizados Naabsa

&gt; **Como usar este documento (AI-driven development):** este PRD é a fonte de verdade do projeto. Cada requisito tem um ID (`RF-xx`, `RNF-xx`) e cada tarefa do plano (seção 12) referencia os requisitos que implementa e tem critérios de aceite verificáveis por teste ou inspeção. Implemente **uma tarefa por vez**, na ordem dos milestones, rodando os testes antes de considerar a tarefa concluída. Em caso de conflito entre este PRD e qualquer outra fonte, este PRD prevalece; se uma decisão necessária não estiver coberta aqui, registre a dúvida e pergunte antes de implementar.

---

## 1. Visão geral

**Produto:** sistema web interno que automatiza a produção dos relatórios de inspeção marítima da Naabsa Marine Surveyors &amp; Consultants.

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
- **RF-08** Saída do motor: `{ data: Record&lt;string, unknown&gt;, issues: Issue[] }` onde `Issue = { field, cell, level, message }` com mensagens em pt-BR apontando a célula (ex.: `"Campo 'Data do survey' vazio na célula B7"`).
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
- **RNF-03 Performance:** extração &lt; 5 s para planilhas de até 5 MB; geração de PDF &lt; 60 s; processamento de foto &lt; 10 s/foto.
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
    { "rule": "compare", "left": "completion_date", "op": "&gt;=", "right": "start_date",
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
- **Golden tests de PDF:** para cada tipo × variante, fixture em `tests/golden/{slug}.{variant}/` com `input.xlsx`, `photos/`, `expected.pdf`. Pipeline de teste: extrai → monta documento → gera PDF → rasteriza ambos (pdf2image/pdfium) → diff de pixels (falha se &gt; 0,5%). Roda no CI a cada mudança em core, templates ou CSS de impressão.
- **E2E (Playwright):** fluxo feliz completo de 1 relatório (criar → upload → revisar → fotos → editar → aprovar → baixar PDF) contra Supabase local/branch.
- **Determinismo (RNF-01):** teste que roda o extractor 3× sobre a mesma fixture e exige igualdade profunda.

---

## 12. Plano de implementação AI-driven (milestones e tarefas)

&gt; **Protocolo por tarefa:** (1) ler os RFs referenciados; (2) implementar; (3) escrever/atualizar testes da tarefa; (4) rodar `pnpm test` e o lint; (5) só então marcar concluída e seguir para a próxima. Não iniciar tarefa de milestone seguinte com tarefas pendentes no atual. Commits pequenos, mensagem referenciando a tarefa (`feat(core): T-05 extractor de campos`).

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
</pasted_text>

<!-- The user explicitly selected the following skills for this project, as attachments to their message. These are not optional context — they define how you work. Use them. -->
<attached-skill name="Hi-fi design">
Create a high-fidelity, polished design.

Follow this general design process (use the todo list to remember):
(1) ask questions, (2) find existing UI kits and collect design context — copy ALL relevant components and read ALL relevant examples; ask the user if you can't find them, (3) start your file with assumptions + context + design reasoning (as if you are a junior designer and the user is your manager), with placeholders for the designs, and show it to the user early, (4) build out the designs and show the user again ASAP; append some next steps, (5) use your tools to check, verify and iterate on the design.

Good hi-fi designs do not start from scratch — they are rooted in existing design context. Ask the user to Import their codebase, or find a suitable UI kit / design resources, or ask for screenshots of existing UI. You MUST spend time trying to acquire design context, including components. If you cannot find them, ask the user for them. In the Import menu, they can link a local codebase, provide screenshots or Figma links; they can also link another project. Mocking a full product from scratch is a LAST RESORT and will lead to poor design. If stuck, try listing design assets and ls'ing design system files — be proactive! Some designs may need multiple design systems — get them all. Use the starter components (device frames and the like) to get high-quality scaffolding for free.

When presenting several options or explorations side-by-side, lay them out clearly: give the page a neutral gray background, put each option in its own labeled frame (a small heading + a white rounded card sized to its content), and group related options into sections.

When designing, asking many good questions is ESSENTIAL.

Give options: try to give 3+ variations across several dimensions. Mix by-the-book designs that match existing patterns with new and novel interactions, including interesting layouts, metaphors, and visual styles. Have some options that use color or advanced CSS; some with iconography and some without. Start your variations basic and get more advanced and creative as you go! Try remixing the brand assets and visual DNA in interesting ways — play with scale, fills, texture, visual rhythm, layering, novel layouts, type treatments. The goal is not the perfect option; it's exploring atomic variations the user can mix and match.

CSS, HTML, JS and SVG are amazing. Users often don't know what they can do. Surprise the user.

If you do not have an icon, asset or component, draw a placeholder: in hi-fi design, a placeholder is better than a bad attempt at the real thing.
</attached-skill>

<attached-skill name="Interactive prototype">
Create a fully interactive prototype with realistic state management and transitions. Use React useState/useEffect for dynamic behavior. Include hover states, click interactions, form validation, animated transitions, and multi-step navigation flows. It should feel like a real working app, not a static mockup.
</attached-skill>

<attached-skill name="Design Components">
This project uses Design Components: every design is a single streaming `Name.dc.html` file. The full authoring spec is in your system prompt under "Writing code — Design Components" — follow it. Author and edit `.dc.html` content ONLY with the `dc_write`, `dc_html_str_replace`, and `dc_js_str_replace` tools (never `write_file` or `str_replace_edit`); template edits stream into the live preview as you type.
</attached-skill>


<system-reminder>Auto-injected reminder (ignore if not relevant): do not recreate copyrighted or branded UI unless the user's email domain matches that company. Create original designs instead.</system-reminder>

## Assistant

_[tool: questions_v2]_

I've read through the Naabsa PRD carefully — it's a thorough spec for an internal web tool that automates maritime inspection reports (upload spreadsheet → extract/validate data → allocate photos → edit in TipTap → generate PDF), with 9 screens defined in section 10 and a defined palette (white, `#141414`, rock-gray `#7d7468`).

Before I design, a few questions so I build the right thing rather than guessing.

## User

Questions answered:
- scope: todas
- deliverable: Static hi-fi screens (one per state)
- variations: No — one strong direction, applied consistently
- aesthetic: a cor do logo deles é vermelho e azul navy
- type: Decide for me
- density: Comfortable — balanced
- language: Portuguese (pt-BR) — as specified

## Assistant

_[tool: update_todos]_

Got it — all 9 screens, static hi-fi, one consistent direction, navy + red brand (their logo), rock-gray support, pt-BR, comfortable density. Let me lock the system and start building.

My design system:
- **Navy `#16294d`** = structural brand (nav, primary actions, data emphasis). **Vermelho `#bf2c30`** = critical only (errors, destructive, alerts). **Cinza-rocha `#7d7468`** = secondary/support. **Tinta `#151515`** on warm off-white.
- **Public Sans** for UI, **IBM Plex Mono** for everything spreadsheet-origin (cell refs like `B7`, IDs, fingerprints, counters) — reinforces the "data came from a planilha" concept.
- Status badges for the 7-state machine; red/amber for issue levels.

Let me set up the todo and build the foundation + first screens.

_[tool: dc_write]_

Let me check it renders cleanly before continuing.

_[tool: show_html]_

_[tool: show_html]_

_[tool: save_screenshot]_

Header looks great. Let me verify the login + dashboard rendered with data.

_[tool: save_screenshot]_

_[tool: dc_html_str_replace]_

Login and dashboard render cleanly — badges, mono data, navy/red all landing well. Now I'll build the rest. Let me append the **Novo relatório** wizard (type/variant + upload states).

_[tool: dc_js_str_replace]_

Now the **Revisão** screen. First add field data to the logic class.

_[tool: dc_js_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: save_screenshot]_

_[tool: dc_js_str_replace]_

Wizard and review are in. Now **Fotos** — add photo/slot data, then build the screen with gallery, slots, AI banner, and a crop modal.

_[tool: dc_js_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

I left a stray `<sc-id>` tag — let me remove it.

_[tool: dc_html_str_replace]_

Now **06 Editor** (TipTap) — pageless canvas, toolbar, autosave, locked nodes, dataField marks.

_[tool: dc_html_str_replace]_

**07 Preview/print** — paginated A4, same route the worker uses.

_[tool: dc_html_str_replace]_

**08 Histórico** (audit_log timeline) and **09 Admin specs** — the last two.

_[tool: update_todos]_

Let me visually verify the newer screens (fotos, editor, print, admin) before handoff.

_[tool: save_screenshot]_

_[tool: save_screenshot]_

scrollIntoView didn't move the page. Let me scroll by computed offset instead.

_[tool: save_screenshot]_

_[tool: save_screenshot]_

The DC renders in shadow DOM, so my queries miss. Let me scroll by document fractions instead.

_[tool: get_webview_logs]_

At 90% scroll I still see the dashboard — the appended screens may not be rendering. Let me check logs.

_[tool: save_screenshot]_

_[tool: grep]_

Screens 3–9 aren't rendering — the page ends at the dashboard. Let me inspect the file source around the dashboard/novo boundary.

_[tool: show_html]_

Source is complete and well-formed. The preview may be a stale streaming render. Let me force a fresh load.

_[tool: save_screenshot]_

_[tool: sleep]_

_[tool: save_screenshot]_

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: sleep]_

_[tool: save_screenshot]_

_[tool: done]_

The preview pane is temporarily unavailable for screenshots. The source file is complete and well-formed. Let me hand off via `done`, which loads it fresh in your tab and reports any console errors.

_[tool: fork_verifier_agent]_

No console errors. Let me have the verifier confirm all 9 screens actually render (I couldn't screenshot the lower ones).I've built all 9 screens of the Naabsa reports tool as one consistent hi-fi system. Handing off now — the verifier is confirming the lower screens render cleanly and will report back.

**What's there (pt-BR, navy + vermelho brand, rock-gray support, Public Sans + IBM Plex Mono):**
- **Design-system header** — palette, type specimens, screen index
- **01 Login** with error state · **02 Dashboard** with filters + 7-state status badges · **03 Novo relatório** wizard (tipo → variante) + upload-progress state · **04 Revisão** with section grouping, inline error/aviso issues, override badges, blocked "Confirmar" · **05 Fotos** with gallery, spec slots, AI pre-allocation banner, quality flags, and crop modal · **06 Editor** TipTap (toolbar, autosave, locked `photoFrame`/`dataTable` nodes, `dataField` highlights) · **07 Preview/PDF** as two paginated A4 pages · **08 Histórico** audit timeline · **09 Admin specs** with versions + validated JSON editor

The whole product vocabulary leans on the spreadsheet origin — mono for every cell ref (`B7`), ID, fingerprint and counter — and keeps the operator-in-control principle visible (blocked advances, AI marked as suggestions only).

A couple of things worth your call before I go deeper:
- I used realistic placeholder content (vessels, ports, a Draft Survey as the featured type). Send real samples and I'll swap them in.
- Photos are striped placeholders by design — drop in real inspection shots when ready.
- Want me to add hover/active interaction states or wire any screen into a clickable flow? You picked static screens, so I kept these as states — happy to make a key flow interactive.

## User

No issues found

## Assistant

The verifier confirmed all 9 screens render cleanly — Editor, the two A4 preview pages, the Histórico timeline, and the Admin JSON editor are all present and populated. Everything's in place and there were no console errors.

The deliverable is ready in **Naabsa Relatórios.dc.html**. Whenever you have real vessel/spreadsheet samples or want a key flow made interactive, just say the word.

## User

agora deixe interativo

## Assistant

_[tool: update_todos]_

On it. Making it a real clickable prototype is a meaningful transformation, so I'll build it as a **new file** (`Naabsa Protótipo.dc.html`) and keep the static design board intact. It'll drive the full operator happy-path with real state: login → dashboard → wizard (type/variant/upload with animated progress) → extraction → review (fix the blocking error to unlock) → photos (allocate, confirm AI, crop) → editor → approve → PDF generation polling → download, plus working search/filters, history, and admin.

Let me set up the todo and write the foundation + first screens.

_[tool: dc_write]_

Now the build. First the full logic class plus shell, login, and dashboard.Let me verify login + dashboard interactivity works before adding more screens.

_[tool: show_html]_

_[tool: save_screenshot]_

Login renders. Let me drive it through to the dashboard to confirm the flow works (inputs + button are in shadow DOM, so I'll deep-query).

_[tool: dc_js_str_replace]_

Login→dashboard flow works, URL updates. Now I'll extend the logic with all the screen computations, then append the screen blocks. First the logic additions.Now the big computation block before `return`:

_[tool: dc_js_str_replace]_

Now expand the return object with all the new keys:

_[tool: dc_js_str_replace]_

_[tool: dc_html_str_replace]_

Now append the wizard and review screens:

_[tool: dc_js_str_replace]_

I referenced a few helper holes — let me add them to `renderVals`.

_[tool: dc_html_str_replace]_

Now the final screens — photos, editor, preview, history, admin:

_[tool: dc_js_str_replace]_

I referenced `pendColor`/`pendLabel` in photos — let me add them.

_[tool: get_webview_logs]_

Let me check for errors and drive through the full flow.

_[tool: save_screenshot]_

_[tool: save_screenshot]_

Let me drive it in smaller steps. Login → wizard:

_[tool: save_screenshot]_

The app state persisted at dashboard (hot-reload keeps state). Let me continue the flow from there — wizard → upload → extract → review.

_[tool: get_webview_logs]_

The wizard content area is blank. Let me check logs for a render error.

_[tool: save_screenshot]_

Let me probe whether the wizard's type cards exist in the DOM.

_[tool: save_screenshot]_

The probe ran after the flow advanced. Let me restart the wizard cleanly to the type step and look:

_[tool: save_screenshot]_

_[tool: save_screenshot]_

Let me inspect the actual rendered structure to find where it breaks.

_[tool: show_html]_

Even the app grid is gone — the template likely broke during the big append. Let me reload fresh (resets to login) and confirm the baseline renders.

_[tool: save_screenshot]_

_[tool: save_screenshot]_

Login is fine. Let me log in and check whether the dashboard (first screen, before any appends) still renders.

_[tool: grep]_

Dashboard renders fine (my grid selector was just wrong). The wizard block specifically is empty. Let me read that part of the file to check tag balance.

_[tool: read_file]_

Structure looks balanced. Let me read the full wizard block to find the issue.

_[tool: save_screenshot]_

The template looks balanced. Let me test whether the *review* screen renders (open an in-review report) to see if it's wizard-specific or all appended screens.

_[tool: save_screenshot]_

Review works — so it's wizard-specific. Let me check `navNovo` active state when on wizard to confirm `screen==='wizard'` at render:

_[tool: save_screenshot]_

The wizard renders fine now (escolha=9, navNovo active) — the earlier blanks were stale hot-reload state. Let me do a clean visual pass through the flow. First the wizard:The wizard renders beautifully. Everything's working — the earlier blanks were just stale hot-reload state. Let me run the full happy path and capture the key transitions.

_[tool: save_screenshot]_

_[tool: save_screenshot]_

The dropzone click hit an ancestor. Let me click the exact element and continue through upload → extract → review:

_[tool: save_screenshot]_

Excellent — upload animation, extraction, and review all work. Now resolve the blocking error → confirm → photos → editor → approve → PDF:

_[tool: save_screenshot]_

Review error-resolution, photos allocation, and editor all work. Now the final leg — approve → PDF generation → download:

_[tool: delete_file]_

The entire happy path works end-to-end — approve → "Gerando PDF…" spinner → "PDF pronto" → download, with all data carried through to the A4 preview. Let me clean up test screenshots and hand off.

_[tool: update_todos]_

Now hand off the interactive prototype.

_[tool: done]_

_[tool: fork_verifier_agent]_

Done. The Naabsa tool now exists in two files:

- **`Naabsa Relatórios.dc.html`** — the static hi-fi design board (all 9 screens + design system), untouched.
- **`Naabsa Protótipo.dc.html`** — the new clickable prototype.

The prototype drives the real operator happy-path with live state, verified end-to-end:

**Login** (validates fields) → **Dashboard** (working search + Tipo/Status filter dropdowns + clickable rows that open each report at its correct stage) → **Novo relatório** wizard (pick type → variant appears → upload with an *animated* progress bar → extraction spinner) → **Revisão** (every field is an editable input; the empty "Data do survey" shows a blocking red error and disables *Confirmar* — fill it and it flips to green and unlocks) → **Fotos** (allocate into the pending slot, confirm AI suggestions, crop modal, advance gate) → **Editor** → **Aprovar e gerar PDF** → **Preview** with a "Gerando PDF…" → "PDF pronto" polling transition → download. The URL chip and sidebar active-state update at every step, and a toast confirms key actions.

The verifier is running the whole chain now and will flag anything; I'll fix if it reports back.

One note: the in-app inputs (search, login, review fields) are fully typeable, but the "select planilha" is a simulated upload (no real file picker) — appropriate for a prototype. Want me to wire the dashboard's **Histórico** and **Admin · Specs** entries to a nav affordance too (Specs is reachable from the sidebar; History currently opens only via a purged report), or adjust any transition timing?

## User

No issues found

## Assistant

The verifier confirmed the full operator flow works end-to-end with no console errors.

_[tool: snip]_

Both files are ready and verified:

- **`Naabsa Relatórios.dc.html`** — static hi-fi board (all 9 screens + design system).
- **`Naabsa Protótipo.dc.html`** — the clickable prototype, full operator happy-path working: login → dashboard (search/filters/row-open) → wizard (type/variant + animated upload + extraction) → review (editable fields; blocking error unlocks Confirmar) → photos (allocate, confirm AI, crop) → editor → approve → PDF generation polling → download, with live URL + nav state + toasts.

Open next steps whenever you want them:
- Surface **Histórico** more directly (it's currently only reachable via a purged report).
- Drop in real vessel/spreadsheet content or brand logo.
- Adjust any transition timings, or make a second report *type* flow (e.g. On/Off-Hire) clickable to show the variant-driven data mapping.

