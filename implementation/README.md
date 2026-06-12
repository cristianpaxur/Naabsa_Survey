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
| [003](./003%20-%20Motor%20de%20Extração%20e%20Validação/spec.md) | Motor de Extração e Validação | T-04..T-07 | 🟡 Planejada | 0/12 |
| [004](./004%20-%20Document-Builder%20e%20Geração%20de%20PDF/spec.md) | Document-Builder e Geração de PDF | T-08..T-10 | 🟡 Planejada | 0/11 |
| [005](./005%20-%20Autenticação,%20Dashboard%20e%20Criação%20de%20Relatórios/spec.md) | Autenticação, Dashboard e Criação de Relatórios | T-11..T-13 | 🟡 Planejada | 0/12 |
| [006](./006%20-%20Revisão%20de%20Dados/spec.md) | Revisão de Dados | T-14 | 🟡 Planejada | 0/8 |
| [007](./007%20-%20Pipeline%20de%20Fotos/spec.md) | Pipeline de Fotos | T-15, T-16 | 🟡 Planejada | 0/11 |
| [008](./008%20-%20Editor%20TipTap%20e%20Aprovação/spec.md) | Editor TipTap e Aprovação | T-17, T-18 | 🟡 Planejada | 0/12 |
| [009](./009%20-%20Demais%20Relatórios%20e%20Admin%20de%20Specs/spec.md) | Demais Relatórios e Admin de Specs | T-19..T-23 | 🟡 Planejada | 0/12 |
| [010](./010%20-%20Retenção,%20IA%20e%20Hardening/spec.md) | Retenção, IA e Hardening | T-24..T-28 | 🟡 Planejada | 0/13 |

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

| Insumo | Fornecedor | Bloqueia |
|---|---|---|
| Tipo de relatório prioritário | Cliente | 003/T-010..T-012 (spec real do 1º tipo — PRD T-07) |
| Modelos Word + exemplos preenchidos (todas as variantes) | Cliente | 004/T-001..T-004 (PRD T-08) e 009 (PRD T-19..T-22) |
| Planilhas pré-moldadas reais de cada tipo | Cliente | 003/T-010..T-012 (PRD T-07) e 009 (PRD T-19..T-22) |
| Chave PIX/recebimento e acesso ao VPS | Interno | 001 (apenas deploy no VPS — dev local livre; PRD T-03) e 010 (PRD T-28) |

> Enquanto os insumos não chegarem: 003 pode ser concluída até a tarefa do validador +
> extractor com fixtures sintéticas; 004 pode usar um modelo provisório baseado no protótipo
> de `design/` (tela 07 Preview/PDF) e trocar o conteúdo quando os modelos Word chegarem.

---

## Referências de design

- Protótipo interativo (primário): `design/naabsa-survey/project/Naabsa Protótipo.dc.html`
- Board estático hi-fi (design system + 9 telas): `design/naabsa-survey/project/Naabsa Relatórios.dc.html`
- Mapeamento tela → implementação: ver [CLAUDE.md](../CLAUDE.md)
