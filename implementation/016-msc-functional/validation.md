# Validação — 016

Em andamento. Serão registrados aqui os comandos locais, resultados e limitações de integração externa.

## MSC-02 — edição numérica localizada

- `pnpm --filter @naabsa/web test -- localized-number.test.ts` — aprovado: 26 arquivos, 141 testes.
- `pnpm --filter @naabsa/web typecheck` — aprovado.
- Cobertura criada para vírgula, ponto, separadores de milhar e entrada inválida. A persistência ocorre somente em `blur` ou `Enter`; `Escape` restaura o valor anterior.

## MSC-01, MSC-03 a MSC-08 — contrato, documento, fotos e PDF

- `pnpm --filter @naabsa/core test -- msc-extract.test.ts` — aprovado: 13 arquivos, 139 testes. Confirma as abas e campos MSC da planilha SABRINA.
- `pnpm --filter @naabsa/worker test -- buildDocxMsc.test.ts` — aprovado: 17 arquivos, 93 testes e 2 integrações de LibreOffice ignoradas por indisponibilidade local. Confirma índice, grupos ECR/Hull, anexos e condição ROB.
- `pnpm --filter @naabsa/worker test -- generatePdf.test.ts` — aprovado: 17 arquivos, 93 testes e 2 integrações ignoradas. Inclui falha contextualizada do conversor PDF.
- `pnpm --filter @naabsa/web typecheck`, `pnpm --filter @naabsa/core typecheck` e `pnpm --filter @naabsa/worker typecheck` — aprovados.
- `pnpm test:golden` ainda falha em três verificações do Draft Survey já alteradas no diretório de trabalho (snapshot/numeração/percentual); o caso MSC passa. Não foram alterados os artefatos desse relatório fora do escopo.
- A conversão real DOCX→PDF depende do LibreOffice configurado no worker e não pôde ser exercitada nesta máquina: a integração correspondente foi ignorada pelo teste. Não houve ativação nem seed da configuração na nuvem; isso permanece uma ação posterior explícita.
