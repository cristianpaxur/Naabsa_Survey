# Validação — 017: MSC igual à referência Word

Data: **09/10/2026**. Estado: **gerador e fidelidade local concluídos**; publicação, aceite no Collabora de destino e diagnóstico específico do DAMLA permanecem externos.

## Resultado visual final

O builder usa uma cópia do próprio pacote Word, em `templates/msc.clean.docx`. A referência é o original com as anotações de preenchimento removidas. O ensaio do builder utiliza explicitamente os mesmos valores e as mesmas 31 fotos da referência, incluindo a capa e o logo institucional padrão; esses exemplos não viram valores de fallback em relatórios reais.

**Microsoft Word 16.0, build 16.0.20430: nove páginas, 9/9 pixel idênticas a 144 DPI, zero pixels diferentes.** Referência e saída foram exportadas novamente no mesmo ambiente para a comparação final. Todas as páginas foram examinadas visualmente.

- Referência final: `tmp/video-review-20261009/exact-runtime/source-current.word.pdf`.
- Saída real do builder: `tmp/video-review-20261009/exact-runtime/msc.docx` e `msc.word.pdf`.
- Evidência final: `tmp/video-review-20261009/exact-runtime/word-pixel-comparison-final.json`.
- PNGs: `word-reference-final/` e `render/`, no mesmo diretório.
- Prévia entregue: `output/docx/msc-previa-017.docx` e `output/pdf/msc-previa-017.pdf`, com os dados/fotos do exemplo. O PDF entregue foi exportado pelo Word.

A iteração removeu regras adicionais de `keepNext` em títulos, que deslocavam Time log e Survey attendance. Os títulos conservam agora exatamente suas propriedades originais. O texto com logbook e VRS preserva inclusive os espaços/NBSP do Word. Números do sumário continuam variáveis e medidos em duas passagens nos relatórios reais; o ensaio de identidade usa os números apresentados no exemplar.

O renderer da skill documents também converteu o candidato final em LibreOffice: **nove páginas, Contents na 2, sem página intermediária vazia**. Foi corrigido o transbordamento de um parágrafo vazio entre contatos e Contents, removendo somente esse vazio, com guards para texto, desenhos, bookmarks e seção. As nove páginas do LibreOffice foram inspecionadas em `exact-runtime/lo-final/compare-{1-3,4-6,7-9}.png`. A saída LO tem diferenças métricas nos textos das páginas 2–5 em relação à própria referência LO; páginas 1 e 6–9 são pixel iguais. Essa observação não é prova de identidade no Collabora: o aceite no motor de destino continua separado.

## Fonte e preservação

- Original: `C:/Users/CristianPaxur/Downloads/MSC Report - revisado.docx`, 8.130.362 bytes.
- SHA-256 original, confirmado novamente por leitura compartilhada ao final: `837c43da11ec830b2d11d26c5a2c2b533c8a7d7a05fc2e5b264a9a933fe7fcd0`.
- SHA-256 do template reproduzível: `953bb17bd63576a9c1127dfa7bd2b166b83da148b29d202c798152bb57836056`.
- Script: `scripts/build_msc_template.py`; contrato rastreável, slots e exemplos QA: `templates/msc.artifact.md`; reprodução: `templates/README.md`.
- 197 campos lógicos; 206 blocos e 351 parágrafos de corpo no template. Geometria de seções, desenhos, tabelas e referências de numeração verificada.
- 62 partes preserve-only continuam byte idênticas. Além de `word/document.xml`, três partes de metadados foram sanitizadas para remover identidade do exemplar e vínculo externo de template.
- Regeneração idempotente, original intacto. A exportação Word usa cópias somente leitura e instância dedicada, preservando as janelas do usuário.
- Template incluído no Docker do worker e permitido no Git. Headers/styles/numbering/footer/sectPr são preservados pelo builder; o helper e os snapshots Draft Survey permanecem inalterados.

## Regressões e checks finais

| Verificação | Resultado |
|---|---|
| `pnpm test` | Exit 0: core 204, db 25, web 231, worker 212 = **672 aprovados**; cinco opt-in pulados |
| Worker completo após o ajuste final da capa, Vitest com dois workers | Exit 0: **212 aprovados**, cinco opt-in pulados |
| `pnpm test:golden --maxWorkers=2 --minWorkers=1` após a correção de capa | Exit 0: **7 aprovados**, incluindo MSC e snapshots Draft preservados |
| `generatePdf.test.ts` | Exit 0: **18 aprovados**, spec congelada, dados efetivos, overrides, zero, precisão e ausência |
| Fidelidade estática | Exit 0: **6 aprovados**, pPr de todos os títulos/TOC, partes institucionais, geometria e tabela Time log |
| Três cenários nativos + seis estáticos após a correção de capa | Exit 0: **9/9 aprovados** |
| `pnpm typecheck` e worker typecheck final | Exit 0 |
| ESLint do projeto com `--ignore-pattern 'tmp/**'` | Exit 0; os scripts temporários preexistentes do usuário permanecem preservados |
| Prettier dos cinco arquivos TS de builder/testes alterados | Exit 0 |
| `git diff --check` | Exit 0 |
| Validação da implementação e links internos | Exit 0: implementação válida, quatro links e zero inválidos |

Logs: `tmp-msc-all-tests.log`, `tmp-msc-worker-final.log`, `tmp-msc-golden-final.log`, `tmp-msc-exact-native-final-tests.log`, `tmp-msc-job-tests.log`, `tmp-msc-typecheck-final.log` e `tmp-msc-lint-final.log`. Uma execução nativa sofreu timeout durante suspensão da máquina; a repetição passou sem aumentar limite nem reduzir assertions.

| Cenário nativo final | Páginas | Contents | Time log | Fotografias |
|---|---:|---:|---|---|
| Compacto | 6 | 2 | 12 eventos completos na 4 | Títulos Photo/Vessel na 4, primeira foto na 5, respeitando propriedades originais |
| Longo | 7 | 2 | 45 eventos nas 4–5 (19 + 26), cabeçalho repetido | Photo/Vessel/foto na 5 |
| Multilinha | 7 | 2 | Título na 4, 12 eventos inteiros na 5 | Títulos na 5, primeira foto na 6 |

Evidência de páginas e dados: `tmp/video-review-20261009/exact-native/pages.json`. Fotos sintéticas identificadas por conteúdo RGB, com ordem, limites físicos e proporções verificadas. Retratos, quadrados e fotos mais estreitas que 4:3 permanecem em pares; as fotos nominais preservam os desenhos originais. Eventos contendo chaves, texto coincidente com cláusulas ROB e Unicode suplementar são preservados. Fotos e contatos exemplares não são reutilizados como fatos de outros relatórios.

Revisão independente encerrada: nenhum achado critical/high/medium aberto. Reproduções verificaram contatos, metadados, eventos, Unicode, IDs e o ajuste final da página vazia. A comparação pixel final foi realizada pelo agente principal.

## Limites e ativação

- O vídeo continua como fonte do feedback; sua narração foi analisada com quadros e transcrição local. A instrução posterior de identidade com o Word prevalece sobre o alinhamento/paginação da primeira versão.
- Anotações do documento são referência, não comandos ou autorização para remapear células. Summary B8 e Sludge K29/K30/K31 chegam corretamente pela fixture SABRINA; a data narrativa conserva a origem existente.
- Para campos realmente vazios, o validador informa avisos MSC sem fabricar números; zero e overrides continuam válidos. Nenhum novo seed/mapeamento histórico foi aplicado.
- A causa específica dos campos vazios do DAMLA depende de sua planilha/registro originais, não fornecidos. T-006 permanece aberta.
- Publicação não executada. T-009 conserva o aceite externo no Collabora, que pode ter fontes/paginação diferentes do Word; esta validação não comprova o ambiente remoto.

Ativação preparada: publicar worker/core pelo fluxo existente, incluindo o template no Docker; validar um novo relatório no Collabora do destino; investigar o DAMLA por fonte/spec congelada/extração/overrides; registrar a versão anterior para rollback. O DOCX editado/aprovado continua sendo a fonte do PDF; históricos não são reconstruídos silenciosamente.
