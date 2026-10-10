# Validação — 017: MSC igual à referência Word

Data: **10/10/2026**, com verificações anteriores preservadas abaixo. Estado: **gerador, fidelidade local e diagnóstico DAMLA concluídos; ECR ativo; Dokploy identificado e nova correção de paginação validada no Collabora do destino**. Acompanhamento da publicação, ativação das âncoras DAMLA e aceite do documento pela interface permanecem pendentes.

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

## Revisão posterior da geração online — F-004/F-005

O relatório MSC SABRINA `21763dac-4136-472b-9a8e-db06c4ab0206` foi inspecionado no Collabora CODE 26.04.3.1. A tela de fotos mostrou somente três slots no spec congelado; o documento apresentou transbordamento dos contatos, números obsoletos no sumário e padding/corte das fotos. Evidência e diagnóstico em [online-review.md](online-review.md); aplicação da migration, publicação e preservação do Word existente em [deployment-online.md](deployment-online.md).

A migration 0021 cria versões novas dos specs MSC incompletos com ECR opcional e move somente relatórios abertos não excluídos. O teste PostgreSQL isolado (PGlite) mantém trigger de imutabilidade e confere todos os estados, versões distintas, tipo ativo, lixeira, campos/zero/overrides/documentos, auditoria e segunda execução idempotente. Nenhuma migration foi aplicada ao ambiente remoto.

O builder adapta a capa somente se o fim dos contatos sair da página 1; remove padding de fotos ausentes, mantém Photographic Report/Vessel/foto juntos, evita recortes herdados e usa linha automática integral nas fotos alteradas. A meia linha do exemplar recortava fotos inline apesar de extents corretos. A inspeção também encontrou a última linha de Attachment isolada; galerias parciais agora conservam título, espaçador e seis itens juntos. O exemplar completo conserva as propriedades originais.

A paginação usa o PDF do Collabora quando configurado, com extração pelo Poppler já presente no Docker. O fallback local exige todos os bookmarks de seção; a versão numerada é medida novamente. Capa sem espaço, medição incompleta ou instabilidade produzem erro recuperável. O teste reproduziu a medição final vazia que antes retornava um DOCX sem números no sumário.

| Verificação atual | Resultado |
|---|---|
| Suítes regulares por pacote | core **204**, db **26**, web **231**, worker **221**: **682 aprovados**; seis opt-in separados |
| Golden após as correções finais | **7 aprovados**, MSC e Draft Survey |
| Builder / paginação / montagem | **48 / 5 / 18 aprovados**, incluídos nas suítes regulares |
| Aceite nativo final em LibreOffice | **4/4 aprovados**, depois da última correção dos anexos; 379 s de testes |
| Lint normal e typecheck de todos os pacotes | Exit 0; somente tmp/output excluídos do lint de fonte |
| Build e consistência da migration corretiva anterior | `pnpm build` e `generate-spec-repair.mjs --check`: Exit 0; build conserva aviso do SDK Supabase no Edge Runtime |
| Identidade Word reconferida | **9/9 páginas pixel idênticas a 144 DPI**, todas inspecionadas |
| Pacote após a última correção | **66/66 payloads iguais** ao DOCX exportado na comparação Word |

Referência e candidato Word foram exportados novamente no mesmo ambiente: `tmp/msc-online-review-20261009/full-reference/source.word.pdf` e `msc.word.pdf`. A evidência `word-comparison.json` tem nove resultados `same_pixels=true`; `package-comparison-final.json` registra zero partes diferentes após o ajuste dos anexos. As nove páginas Word e todas as seis da prévia SABRINA foram renderizadas e inspecionadas.

A prévia SABRINA usa fotos do arquivo baixado, contatos visíveis e valores da fixture XLSX; comprova apresentação, não todos os valores do registro de produção. Em `sabrina-fixed/render-attachments/`, a capa contém os nomes completos, Contents está na 2, fotos inteiras na 5 e todos os anexos na 6. Os números do sumário conferem com o PDF renderizado. Não foi entregue como substituto do relatório do usuário.

| Cenário nativo atual | Páginas | Contents | Eventos do log | Photo/Vessel/primeira foto | Attachment completo |
|---|---:|---:|---|---:|---:|
| Compacto | 6 | 2 | 12 na 4 | 5 | 6 |
| Longo | 7 | 2 | 45 nas 4–5, cabeçalho repetido | 5 | 7 |
| Multilinha | 7 | 2 | 12 inteiros na 5 | 6 | 7 |
| Contatos longos | 6 | 2 | 12 na 4 | 5 | 6 |

Todas as 26 páginas desses PDFs foram renderizadas e inspecionadas. No último caso, as duas fotos Survey attendance têm **77.805 pixels visíveis** a 72 DPI, acima de 90% da área de dois quadros 80 × 60 mm; a imagem inteira é medida, não somente a caixa do desenho. Sumário confere com todos os títulos; ordem, proporção, quantidade e presença das fotos ECR também são verificadas. O ensaio do sumário pelo Collabora tem teste de contrato; o aceite visual no serviço remoto ainda depende da publicação.

Logs finais: `tmp-msc-online-worker-final.log` e `tmp-msc-online-native-final.log`; demais evidências em `tmp/msc-online-review-20261009/`. A suíte de fidelidade foi ajustada para conferir as regras originais com uma galeria completa; a galeria parcial tem seu próprio teste de agrupamento dos anexos. Não foram reduzidas assertions para aceitar imagens recortadas: o teste nativo mede pixels visíveis, além das dimensões OOXML/PDF.

Publicação/aceite remoto continuavam pendentes nessa verificação: os conectores e ambientes locais não acessavam o backend desse domínio, e o endpoint público de conversão respondia HTTP 403 para a estação. O Word editado existente foi preservado e não muda automaticamente com deploy/migration. Sua atualização requer cópia preservada e conferência das fontes/edições com guarda de revisão/geração.

## Diagnóstico real DAMLA e preparação do banco — 10/10/2026

O Chrome autenticado permitiu consultar o Supabase de destino e baixar o XLSX DAMLA. O diagnóstico comprovou que os três purificadores estão em K32/K33/K34, enquanto o spec lê K29/K30/K31; a viagem 635S já está salva. Fonte, hashes, valores e limites estão em [damla-diagnosis.md](damla-diagnosis.md).

O teste de deslocamento falhou com três nulos antes da correção e passou depois. A extração real com uma cópia do spec e somente as três âncoras alterou exatamente esses três campos; todos os demais campos/tabelas ficaram iguais. Os quatro valores esperados apareceram no OOXML do ensaio local. Esse ensaio não é um documento completo para entrega. A migration 0022 ativa uma cópia para novos relatórios, mantém todos os registros existentes/Word/slots e tem teste de idempotência em PostgreSQL isolado.

As suítes regulares passaram: core 215, db 27, web 231, worker 221, total **694**, com seis opt-in separados. Os **sete golden** passaram. Typecheck e consistência das migrations de reparo passaram. O lint normal passou; o format:check geral detectou arquivos anteriores fora da alteração e arquivos de evidência em tmp. A conferência de formatação dos arquivos de fonte modificados é feita separadamente. Nenhum conversor remoto foi acessado nem arquivo de produção substituído nesta etapa.

A execução isolada ECR foi validada contra a cópia real, incluindo hashes, triggers de revisão, rollback de falha posterior e idempotência. Foi aprovada e aplicada em produção conforme a verificação seguinte. T-006 concluída localmente; T-009 cobre as ativações restantes, publicação e atualização autorizada do DAMLA.

## Aceite ECR em produção — 10/10/2026

Após a autorização explícita do usuário, a transação isolada da 0021 foi executada uma vez no Supabase identificado. Retornou sete relatórios atualizados, modelo ativo versão 4 e ECR habilitado no relatório da captura original. A conferência posterior às 16:12:58 de Brasília retornou quatro checks verdadeiros: relatórios/documentos preservados, specs antigas e conteúdo das cópias conferidos, hashes das fotos preservados e demais colunas do tipo preservadas. Quantidades: quatro specs, dez relatórios, 112 fotos e oito eventos de ativação; zero revisões antigas de IA nos sete relatórios abertos.

O navegador abriu a página `/photos` de `cc1e98bc-d3c3-4a3c-8a13-f5bcbe30df66` e mostrou **ECR (Engine Control Room)** com o botão “Alocar”, junto aos três grupos anteriores. Evidências em `tmp/msc-production-activation-20261010/production-verification.json`, `database-after.jpg` e `ecr-photos-after.jpg`; alcance, preservação e recuperação em [deployment-online.md](deployment-online.md). Valores, Word e lixeira foram conferidos contra a cópia anterior; não foram gerados novos arquivos nem enviadas fotos de teste. As quatro revisões antigas de IA e os 15 avisos IA foram invalidados conforme aprovado.

Esse aceite conclui a ativação ECR. As correções do Word/Collabora e a leitura por rótulos ainda dependem de publicar o worker; a 0022 e a atualização do DAMLA existente não foram executadas.

## Superscrito separado pelo Collabora — 10/10/2026

O Dokploy mostrou web/worker na branch das correções, com `057b566` concluído. O log da geração real `fae24adc-81aa-473b-bbb3-b93519b615c0` comprovou falha ao ler Gross volume. Um ensaio com dados vazios passou; com os dados reais falhou porque o `3` sobrescrito de `m³` saiu em outra linha no topo da página 4. O parser usa os runs sobrescritos do próprio OOXML para reconhecer somente essa separação adjacente, mantendo os checks de presença, unidade e página única.

TDD: os dois casos de expoente destacado falharam antes da alteração, assim como a detecção de ambiguidade envolvendo um deles. Depois, os 12 testes de paginação passaram; os casos de unidade ausente/diferente e expoente em outra página também passaram. A fonte modificada foi compilada e executada somente em memória no worker para um ensaio completo com os dados/planilha/fotos reais, sem publicar Word nem editar registros. O parser anterior reproduziu o erro; o candidato gerou seis páginas, 12 eventos, sete fotos (1 Vessel, 2 Engine room, 2 Survey attendance, 2 ECR), todas as 18 seções e números estáveis. Dados e fotos permaneceram com os mesmos hashes. Evidência em `tmp/msc-production-activation-20261010/collabora-full-recheck.json`.

Core **215**, db **27**, web **231**, worker **228**: **701 testes aprovados**, seis opt-in separados; **sete golden** aprovados. A primeira execução conjunta teve seis timeouts na montagem/fidelidade; a suíte inteira do worker repetida isoladamente com dois workers passou com os mesmos limites. Typecheck do worker, lint, Prettier dos dois arquivos alterados, `git diff --check` e build completo passaram. O template e o builder não foram modificados. Logs em `pagination-regression-tests.log`, `pagination-worker-isolated-tests.log`, `pagination-golden-tests.log` e `pagination-build.log` no diretório privado de evidências.
