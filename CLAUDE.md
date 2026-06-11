# CLAUDE.md — Convenções do Agente · Sistema de Relatórios Automatizados Naabsa

> Fonte de verdade dos requisitos: [PRD.md](./PRD.md). Em conflito, o PRD prevalece —
> **exceto** identidade visual, onde os protótipos em `design/` (handoff do Claude Design,
> aprovados pelo usuário) prevalecem sobre o PRD §10.

## Documentos do projeto

| Documento | Papel |
|---|---|
| `PRD.md` | Requisitos (RF/RNF), domínio, stack fixa, plano T-01..T-28 |
| `design/naabsa-survey/project/Naabsa Protótipo.dc.html` | Protótipo interativo — referência primária de UI (9 telas) |
| `design/naabsa-survey/project/Naabsa Relatórios.dc.html` | Board estático hi-fi — design system + 9 telas |
| `design/naabsa-survey/chats/chat1.md` | Transcript do design — intenção e decisões visuais |
| `implementation/` | Specs e tarefas por implementação (Spec-Driven Development) |

## Tabela oficial de decomposição (001–010)

Decomposição dos milestones M0–M4 do PRD (tarefas T-01..T-28) em 10 implementações:

| # | Implementação | Tarefas PRD | Requisitos | Depende de | Bloqueio externo (PRD §15) |
|---|---|---|---|---|---|
| 001 | Fundação do Monorepo e Infraestrutura | T-01, T-03 | RNF-05, RNF-08, §7 | — | Acesso ao VPS (apenas deploy; dev local livre) |
| 002 | Banco de Dados, RLS e Seed | T-02 | RF-02, RF-35, §6 | 001 | — |
| 003 | Motor de Extração e Validação | T-04, T-05, T-06, T-07 | RF-05..RF-10, RNF-01, §8 | 001 | Tipo prioritário + planilha real (T-07) |
| 004 | Document-Builder e Geração de PDF | T-08, T-09, T-10 | RF-20, RF-27, RF-28, RNF-02, RNF-04, RNF-08, §9 | 001, 002, 003 | Modelos Word do 1º tipo (T-08) |
| 005 | Autenticação, Dashboard e Criação de Relatórios | T-11, T-12, T-13 | RF-01..RF-05, RF-32, §3.2 | 002, 003 | — |
| 006 | Revisão de Dados | T-14 | RF-11..RF-14, RNF-07 | 003, 005 | — |
| 007 | Pipeline de Fotos | T-15, T-16 | RF-15..RF-19, RNF-03, RNF-04 | 002, 005 | — |
| 008 | Editor TipTap e Aprovação | T-17, T-18 | RF-21..RF-26, RF-29, §9 | 004, 006, 007 | — |
| 009 | Demais Relatórios e Admin de Specs | T-19..T-23 | RF-05..RF-10, RF-20, RF-34, RF-35 | 004, 008 | Modelos Word + planilhas reais dos 4 tipos |
| 010 | Retenção, IA e Hardening | T-24..T-28 | RF-30, RF-31, RF-33, RF-36..RF-38, RNF-05, RNF-06 | 008 | Acesso ao VPS (T-28) |

## Mapeamento telas de design → implementações

| Tela (índice do board) | Rota | Implementação |
|---|---|---|
| 01 Login | `/login` | 005 |
| 02 Dashboard | `/dashboard` | 005 |
| 03 Novo relatório (wizard) | `/reports/new` | 005 |
| 04 Revisão | `/reports/[id]/review` | 006 |
| 05 Fotos | `/reports/[id]/photos` | 007 |
| 06 Editor | `/reports/[id]/edit` | 008 |
| 07 Preview/PDF | `/reports/[id]/print` | 004 (render) + 008 (integração na UI) |
| 08 Histórico | `/reports/[id]/history` | 010 |
| 09 Admin specs | `/admin/specs` | 009 |

## Identidade visual (tokens do design/)

- Cores: Navy `#16294D` (marca/ações), Vermelho `#BF2C30` (erros/crítico), Rocha `#7D7468` (apoio), Tinta `#151515` (texto), Papel `#FAF8F5` (fundo).
- Tipografia: **Public Sans** (UI) + **IBM Plex Mono** (células `B7`, IDs, fingerprints, contadores, dados).
- Badges de status (7 estados) e cores semânticas de erro/aviso/sucesso: ver design system no board estático.

## Convenções de trabalho

- Implementar **uma implementação por vez**, na ordem da tabela, respeitando dependências.
- Protocolo por tarefa (PRD §12): ler RFs → implementar → testes → `pnpm lint` + `pnpm test` verdes → marcar concluída.
- Commits pequenos referenciando a tarefa: `feat(core): 003/T-005 extractor de campos`.
- `packages/core` é TypeScript puro — nunca importa Next.js, Supabase ou worker.
- UI e mensagens **sempre em pt-BR**; nenhum segredo em código (env vars, PRD §13).
- Atualizar `implementation/<NNN>/tasks.md` e `implementation/README.md` a cada tarefa concluída.
