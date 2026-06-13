# Golden test — draft_survey.discharge

Fixture do primeiro tipo de relatório (variante Descarga) para o golden test de PDF (PRD §11, RNF-02).

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `input.json` | Dados extraídos da fixture (gerados pelo pipeline extractor) |
| `photos/` | Fotos alocadas (JPEG sintéticos) |
| `expected.pdf` | PDF de referência — gerado na primeira execução e comitado |

## Como gerar/atualizar o expected.pdf

```bash
# 1. Certifique-se de ter o stack rodando (pnpm dev + worker)
# 2. Execute o script de geração:
pnpm -w run golden:generate draft_survey discharge
# 3. Inspecione o PDF gerado e comite se correto:
git add tests/golden/draft_survey.discharge/expected.pdf
git commit -m "test(golden): atualiza baseline draft_survey.discharge"
```

## Critério de aceitação

O diff de pixels entre o PDF gerado e o `expected.pdf` deve ser ≤ 0,5% (CA-004).
Tolerância configurável em `tests/golden/golden.config.ts`.

## ⚠️ Nota

O conteúdo do `expected.pdf` é **provisório** — será atualizado quando o cliente
fornecer os modelos Word reais (004/T-011, PRD §15).
