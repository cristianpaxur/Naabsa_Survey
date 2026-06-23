# Golden test — draft_survey.discharge

Fixture do primeiro tipo de relatório (variante Descarga) para o golden test de PDF (PRD §11, RNF-02).

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `input.json` | Dados extraídos da fixture (gerados pelo pipeline extractor) |
| `photos/` | Fotos alocadas (JPEG sintéticos) |
| `expected.pdf` | PDF de referência — gerado pelo `golden:generate` e comitado |

## Estado atual (2026-06-23)

O golden test estrutural (`golden-pipeline.test.ts`, 5 testes) está **verde com conteúdo real**:
- Dados extraídos da `draft_survey.real.v1.xlsx` via spec v2 multi-aba
- Conteúdo EN conforme `MV-PERSEUS-I.model.docx` (T-011)
- 14 grades range-based + tabelas Acting-as (T-012)
- Layout real: cabeçalho NAABSA, running header @page, estilos finais (T-013)

O `expected.pdf` (CA-004 definitivo, pixel-diff ≤ 0,5%) requer o worker Playwright rodando.

## Como gerar/atualizar o expected.pdf

```bash
# 1. Certifique-se de ter o stack rodando (pnpm dev + worker)
# 2. Execute o script de geração:
pnpm -w run golden:generate draft_survey discharge
# 3. Inspecione o PDF gerado e comite se correto:
git add tests/golden/draft_survey.discharge/expected.pdf
git commit -m "test(golden): atualiza baseline draft_survey.discharge (conteúdo real)"
```

## Critério de aceitação

O diff de pixels entre o PDF gerado e o `expected.pdf` deve ser ≤ 0,5% (CA-004).
Tolerância configurável em `tests/golden/golden.config.ts`.
