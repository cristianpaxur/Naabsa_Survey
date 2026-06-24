# Implementações — Sistema de Relatórios Automatizados Naabsa

> Índice oficial das implementações (Spec-Driven Development). Decomposição derivada do
> [PRD.md](../PRD.md) §12 (milestones M0–M4, tarefas T-01..T-28) conforme a tabela oficial
> do [CLAUDE.md](../CLAUDE.md). Atualize o **Status** aqui sempre que uma implementação mudar de estado.

---

## Índice

| # | Implementação | Tarefas PRD | Status | Progresso |
|---|---|---|---|---|
| [001](./001%20-%20Fundação%20do%20Monorepo%20e%20Infraestrutura/spec.md) | Fundação do Monorepo e Infraestrutura | T-01, T-03 | 🟢 Concluída | 10/10 |
| [002](./002%20-%20Banco%20de%20Dados,%20RLS%20e%20Seed/spec.md) | Banco de Dados, RLS e Seed | T-02 | 🟢 Concluída | 9/9 |
| [003](./003%20-%20Motor%20de%20Extração%20e%20Validação/spec.md) | Motor de Extração e Validação | T-04..T-07 | 🟢 Concluída | 16/16 |
| [004](./004%20-%20Document-Builder%20e%20Geração%20de%20PDF/spec.md) | Document-Builder e Geração de PDF | T-08..T-10 | 🟢 Concluída | 14/14 |
| [005](./005%20-%20Autenticação,%20Dashboard%20e%20Criação%20de%20Relatórios/spec.md) | Autenticação, Dashboard e Criação de Relatórios | T-11..T-13 | 🟢 Concluída | 12/12 |
| [006](./006%20-%20Revisão%20de%20Dados/spec.md) | Revisão de Dados | T-14 | 🟢 Concluída | 8/8 |
| [007](./007%20-%20Pipeline%20de%20Fotos/spec.md) | Pipeline de Fotos | T-15, T-16 | 🟢 Concluída | 11/11 |
| [008](./008%20-%20Editor%20TipTap%20e%20Aprovação/spec.md) | Editor TipTap e Aprovação | T-17, T-18 | 🟢 Concluída | 12/12 |
| [009](./009%20-%20Demais%20Relatórios%20e%20Admin%20de%20Specs/spec.md) | Demais Relatórios e Admin de Specs | T-19..T-23 | 🟡 Planejada | 0/12 |
| [010](./010%20-%20Retençã o,%20IA%20e%20Hardening/spec.md) | Retenção, IA e Hardening | T-24..T-28 | 🟢 Concluída (exceto deploy) | 12/13 |

---

## Ordem de execução e dependências

Executar **na ordem numérica**, respeitando o grafo abaixo. Não iniciar uma implementação
com pré-requisitos pendentes (regra do PRD §12: não iniciar milestone seguinte com tarefas
pendentes no atual).

```
001 ──▶ 002 ──▶ 005 ──▶ 006 ──┐
  │       │       │           ├──▶ 008 ──▶ 009 ──▶ 010
  ├──▶ 003 ──────┤            │
  │       │      └──▶ 007 ────┘
  └───────┴──▶ 004 ───────────┘
```

| Implementação | Depende de |
|---|---|
| 001 | — |
| 002 | 001 |
| 003 | 001 |
| 004 | 001, 002, 003 |
| 005 | 002, 003 |
| 006 | 003, 005 |
| 007 | 002, 005 |
| 008 | 004, 006, 007 |
| 009 | 004, 008 |
| 010 | 008 |

Paralelização possível: após 001, **002 e 003** podem andar em paralelo; após 005,
**006 e 007** podem andar em paralelo.

---

## Insumos do cliente que bloqueiam tarefas (PRD §15)

| Insumo | Fornecedor | Bloqueia | Status |
|---|---|---|---|
| Tipo de relatório prioritário | Cliente | 003 (spec real do 1º tipo — PRD T-07) | ✅ Recebido 2026-06-23 — **`draft_survey`** |
| Modelo Word + exemplo preenchido (1º tipo) | Cliente | 004 (conteúdo real — PRD T-08) | ✅ Recebido 2026-06-23 (`MV-PERSEUS-I.model.docx`) |
| Planilha pré-moldada real (1º tipo) | Cliente | 003/T-011..T-016 (PRD T-07) | ✅ Recebido 2026-06-23 (`draft_survey.real.v1.xlsx`) |
| Modelos Word + planilhas dos **demais** tipos | Cliente | 009 (PRD T-19..T-22) | 🔴 Pendente |
| Chave PIX/recebimento e acesso ao VPS | Interno | 001 (deploy no VPS — dev local livre; PRD T-03) e 010 (PRD T-28) | 🔴 Pendente |

> **1º tipo (`draft_survey`) destravado em 2026-06-23.** Insumos versionados em
> `tests/fixtures/{planilhas,specs,reports}/draft_survey/`. O spec real (`draft_survey.v1.json`)
> exigiu o **contrato v2 multi-aba** (lê 6 abas) — ver 003 §3.4.1 e tarefas 003/T-013..T-016 e
> 004/T-011..T-014. Conteúdo do PDF em **inglês**; UI em pt-BR.
>
> **Pivot 2026-06-24 — geração de PDF via `.docx` nativo.** Para fidelidade ao modelo Word, a
> 004 foi reescrita: o worker monta um `.docx` nativo (lib `docx`) e converte por LibreOffice,
> com sumário clicável e variantes. Preview e abertura de `approved`/`generated` mostram o PDF
> real (novo job `preview_pdf`); o caminho HTML (`/print`, `PrintDocument`) foi removido. O
> TipTap segue como editor (não é mais a fonte do PDF). Ver o callout no [spec 004](./004%20-%20Document-Builder%20e%20Geração%20de%20PDF/spec.md).

---

## Referências de design

- Protótipo interativo (primário): `design/naabsa-survey/project/Naabsa Protótipo.dc.html`
- Board estático hi-fi (design system + 9 telas): `design/naabsa-survey/project/Naabsa Relatórios.dc.html`
- Mapeamento tela → implementação: ver [CLAUDE.md](../CLAUDE.md)
