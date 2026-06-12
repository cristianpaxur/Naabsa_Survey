# tests/golden

Golden tests de PDF por tipo × variante (PRD §11, RNF-02).

Cada caso vive em `tests/golden/{slug}.{variant}/` com:

- `input.xlsx` — planilha de entrada
- `photos/` — fotos do relatório
- `expected.pdf` — PDF de referência

Pipeline: extrai → monta documento → gera PDF → rasteriza ambos → diff de
pixels (falha se > 0,5%). Roda no CI a cada mudança em `packages/core`,
templates ou CSS de impressão.

> Vazio na fundação (impl 001) — primeiro caso na implementação 004.
