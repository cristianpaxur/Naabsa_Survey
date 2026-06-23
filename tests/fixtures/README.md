# tests/fixtures

Fixtures compartilhadas dos testes (PRD §7/§11).

- Planilhas `.xlsx` sintéticas e reais para o extractor (implementação 003).
- Specs JSON de exemplo (válidos e inválidos) para `validateSpec`.
- Demais insumos determinísticos de teste.

## Insumos reais do cliente — Draft Survey (1º tipo)

Recebidos em 2026-06-23 (PRD §15). Estrutura:

| Caminho | Conteúdo |
|---|---|
| `planilhas/draft_survey/draft_survey.real.v1.xlsx` | Planilha-modelo pré-moldada real (dados de exemplo "HG ANTWERP") |
| `specs/draft_survey.v1.json` | Spec real do `draft_survey` (contrato v2: multi-aba, `variant_source`, `tables`) |
| `reports/draft_survey/MV-PERSEUS-I.model.docx` | Relatório final modelo, anotado célula a célula |
| `reports/draft_survey/cliente-instrucoes.md` | Transcrição do e-mail + decisões de produto |
| `reports/draft_survey/field-map.md` | Mapa reconciliado célula → seção do relatório |

> ⚠️ O spec `draft_survey.v1.json` mira o **contrato v2** do schema (multi-aba). O `validateSpec`
> e o extractor atuais são v1 (aba única) — precisam ser estendidos antes de validar/extrair este
> spec (ver `implementation/003 .../tasks.md`, T-013..T-016).
