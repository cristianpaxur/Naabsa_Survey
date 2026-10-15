# Validação

- Core: 215 testes aprovados na execução completa anterior à adição do serializador de alocações; o novo serializador também é exercitado nos testes de web/worker.
- Banco: 28 testes aprovados, incluindo cópia de specs, preservação de dados/documentos, personalizações, históricos, idempotência e revisão de alocações.
- Web: 235 testes aprovados. A ação de avanço é coberta para montagem pendente, conclusão, retentativa após falha, falha tardia de job antigo e alteração concorrente de fotos durante a transição.
- Golden: 7 testes aprovados.
- Build de produção: compilação, tipos e build concluídos com sucesso. Typecheck do monorepo também passou separadamente.
- Interface local: componentes reais com 29 fotos; alocação reduziu a galeria de seis para cinco fotos, desalocação restaurou seis; Capa respeitou uma foto. Em viewport de 1304 px, document.scrollWidth=1304 e todos os grupos tiveram scrollWidth=clientWidth.
- Worker: 252 testes aprovados; seis testes de integração desativados por requisitos externos. A sincronização comprova retenção do texto manual e da versão anterior e rejeição de mudanças concorrentes de documento, fotos ou sessão. A execução concorrente com build/banco sofreu timeouts de 5 s; a repetição completa com um worker passou sem alterar os limites dos testes existentes.

Total: **737 testes aprovados**, mais seis casos de integração desativados. ESLint e `git diff --check` passaram. `pnpm check:specs` confirmou consistência das fixtures e da migration corretiva anterior.

Evidências privadas em `tmp/client-feedback-20261015/`: transcrições, quadros dos vídeos, `original-client.docx`, `current-text.json`, teste local da UI e logs `*-final.log`/`worker-verified.log`.

## Situação inicial de produção, antes da publicação

O diagnóstico pelo terminal do Dokploy foi somente de leitura. Nenhuma migration deste lote, alteração de valores/fotos ou substituição de Word foi executada em produção. O Chrome perdeu a conexão de controle antes da ativação; mesmo após o aviso do usuário de que está online, a ferramenta retornou `Debugger unattached` e depois `Browser is not available: chrome`. O inventário voltou a listar o Chrome, mas a obtenção da aba e a reconexão do navegador continuaram terminando por timeout.

Não publicar a branch acompanhada pelo Autodeploy antes de aplicar a 0025: isso faria o código consultar uma coluna ainda ausente. A publicação, a ativação dos novos specs e o aceite real permanecem pendentes de restabelecer esse acesso.

## Ensaio real posterior à publicação — 15/10/2026

- Usuário informou aplicação das migrations e push. Conferido o worker pelo SHA256 do builder e a coluna `photo_assignment_revision`. Modelo ativo MSC v8, com 81 campos e seis grupos fotográficos.
- Criado pela interface o teste `5db77f1c-c00b-44df-8268-22ec328fd5c3`, baseado na planilha original do CAROLINA. Upload de arquivos pela extensão recusado mesmo após reconexão; o usuário selecionou a planilha e enviou 20 fotos manualmente.
- Extração, revisão e persistência dos ajustes numéricos passaram; quantidades dos três combustíveis e de sludge apareceram na revisão. Identificação do Word alterada para `MSC CAROLINA - TESTE FLUXO`. A data vazia da última descarga não foi preenchida com sucesso pela automação e não entra como caso aprovado.
- Encontrado deslocamento de um registro na aba Sludge. Os valores foram conferidos diretamente na planilha e ajustados pela revisão para continuar o ensaio. Correção local conferida com o arquivo real: temperatura 98, fluxo `1 x 2,0`, frequência 60, última descarga 2026-08-27, consumos 1741.0100000000002 e 1736.1340778983003, sem erros nos 15 campos com âncoras.
- Alocação manual de Capa independente de Vessel, confirmação de sugestões, recorte com zoom 1.01, ordenação, desalocação e realocação passaram. A galeria alternou entre zero e uma foto e voltou a zero. Em largura 1304, todos os grupos tiveram `scrollWidth=clientWidth=513`, inclusive Engine room com 12 fotos.
- Word inicial abriu com sete páginas; inserida e salva a identificação `TESTE DE PERSISTENCIA MSC - 15/10/2026`, resultando em oito páginas. Versão baixada antes de voltar às fotos.
- Ao mover uma foto de Hull para Vessel e avançar, a aplicação recusou a sincronização por `Paginação MSC: seção s5 (Photographic Report) ausente ou ambígua no PDF.` O documento anterior permaneceu intacto. Causa confirmada no Word salvo: o Collabora trocou o ID de numeração 15 por 2 e o estilo Ttulo por Title.
- Correção validada de forma isolada no mesmo worker/conversor: duas medições idênticas, s5 na página 6, s5_3/s5_4/s5_5 e s6 na página 8; edição manual preservada. Esse ensaio não publicou objeto nem alterou registros de produção. A conversão pelo endpoint público a partir da máquina local retornou 403; a validação foi executada dentro do worker autorizado.
- **Aprovação e PDF pela interface ainda não concluídos.** Dependem da publicação da correção da sincronização. A 0026 é para novas extrações; o teste atual mantém seus overrides e seu spec congelado.
- Verificação das correções do ensaio: core 218, banco 29 e worker 252 testes aprovados (499 no total; seis integrações ignoradas por dependências externas). Typecheck, ESLint dos arquivos alterados, Prettier e `pnpm check:specs` passaram. O teste de sincronização simula IDs de numeração e estilos trocados pelo editor, incluindo Hull acrescentado depois.
- Build de produção das correções concluído com sucesso; log `build-e2e-fixed.log`. O CAROLINA original segue na revisão Word 7, revisão de dados 26 e revisão de fotos 0. O teste está em revisão, com Word salvo na revisão 2 e alocações atuais preservadas, aguardando a publicação da correção.

## Conclusão do ensaio em produção — 15/10/2026

- Usuário confirmou a aplicação da 0026 e o push de `8d487e1`. Web já estava nessa versão; o worker ainda executava a anterior. Acionada sua publicação no Dokploy e conferido o término com sucesso. SHA256 do builder em execução: `4c2c55a41ed6ca980d5540e8cf7e33a462230c99f821d9862587a452d1098086`, igual ao código local validado.
- Spec ativo MSC v9 com 15 âncoras Sludge. Extração somente de leitura no worker, usando a planilha original, confirmou fluxo `1 x 2,0`, temperatura 98, frequência 60, última descarga 2026-08-27 e consumos 1741.0100000000002 e 1736.1340778983003. O teste existente preservou o spec v8 e os ajustes já revisados; o v9 não foi reimportado pela interface nesse relatório.
- Retentativa de avanço das fotos pela interface concluiu a sincronização na revisão Word 3. A identificação manual de teste permaneceu no documento. Depois da conferência, essa identificação grande foi removida no editor e o Word foi salvo; a identificação do navio como `MSC CAROLINA - TESTE FLUXO` foi mantida.
- Preview, aprovação e geração final concluídos pela interface. Relatório de teste `5db77f1c-c00b-44df-8268-22ec328fd5c3` em `generated`, Word atual e aprovado na revisão 6, PDF `5db77f1c-c00b-44df-8268-22ec328fd5c3/final-v1-r6.pdf`. O botão Baixar PDF abriu o arquivo final em outra aba, onde a abertura foi conferida.
- PDF final com oito páginas, revisadas visualmente: 20 fotos (Capa 1, Vessel 2, Engine room 12, Survey attendance 2, ECR 2, Hull 1), quantidades `2,342.063`, `565.491` e `486.021`, contato `Capt. Robert Masse`, seção Hull e Time log sem a grade anterior. Não foram encontrados `undefined`, `Invalid Date` ou `NaN` no texto extraído.
- Observação de diagramação: após as edições manuais desse ensaio, os dados de Vessel's Command ficaram na segunda página, com bastante espaço livre. O fluxo funcional passou, mas esse resultado não comprova uma capa restrita a uma página. O preenchimento manual da data da última descarga pela automação também continua fora dos casos aprovados; a extração automática corrigida dessa data foi validada separadamente.
- Consulta final confirmou o CAROLINA original intacto: `editing`, Word revisão 7, dados revisão 26, fotos revisão 0 e nenhum PDF final gerado por esse teste.

Artefato local: `output/pdf/msc-carolina-fluxo-5db77f1c.pdf`, SHA256 `b8742250178b9bd8c8a4c619b890de64224be6128329521c59b5c6452db1583e`. Evidências privadas em `tmp/client-feedback-20261015/`: `e2e-pdf-ready.jpg`, `e2e-word-refreshed.jpg`, `e2e-final-pdf-checks.json`, `e2e-final-contact.jpg` e oito páginas renderizadas em `e2e-final-pages/`.

## Correção da quebra da capa — 15/10/2026

- Pedido adicional: manter os contatos do comando na capa, testar novamente o PDF e fazer commit.
- A atualização das fotos importava o estilo `SemEspaamento` da capa nova, embora o Collabora tivesse renomeado o estilo salvo para `NoSpacing`. Também podia recolocar uma foto maior do que o espaço já ajustado no Word. Agora preserva as propriedades do parágrafo salvo e limita proporcionalmente o novo quadro à altura anterior.
- A atualização passa a medir o Word editado, reduzir somente o quadro da capa em tentativas limitadas a 104, 88 e 72 mm quando necessário e recalcular o sumário. Transbordamento persistente ou após a última medição impede a publicação; o objeto e a revisão anteriores permanecem disponíveis. Textos, recorte e bitmaps são preservados.
- Teste nativo de regressão com planilha de referência e fotos sintéticas aprovado: estilo renomeado, edição manual mantida, contatos inicialmente fora da capa, ajuste para a página 1 e números do sumário conferidos no PDF final. Evidência: `cover-fix/native-tests.log` e `cover-fix/fixture-native/pages.json`.
- Ensaio local do CAROLINA baseado no Word salvo antes da sincronização, removendo somente o marcador de persistência. As 20 fotos e sua ordem foram recuperadas do PDF final anterior para reproduzir as alocações atuais. Conversão nativa pelo LibreOffice local: oito páginas antes, sete depois; contatos `DUDKO VIACHESLAV`, `ZARZECKI DARIUSZ ROBERT` e `Capt. Robert Masse` completos na primeira página; Contents na segunda; duas medições finais iguais com s1=3, s5=5 e s6=7.
- Inspeção visual das sete páginas, quantidades e contagem das 20 fotos aprovada. Comparação sequencial dos bitmaps renderizados com o PDF anterior: RMSE máximo 0,539 em amostras RGB de 64×64, confirmando a mesma ordem e conteúdo fotográfico. Evidências: `cover-fix/final-checks.json`, `cover-fix/native-pagination.json`, `cover-fix/contact.jpg` e páginas renderizadas em `cover-fix/pages/`.
- Novo artefato: `output/pdf/msc-carolina-capa-corrigida.pdf`, SHA256 `ade1b47e424db13ceb032371dbcfcc814b265a0e215e8befc8e92a99f3d01b23`. Este ensaio é local; o PDF aprovado no servidor continua sendo a versão anterior. Para aplicar após publicar o commit no worker: Gerar novamente → voltar às Fotos → avançar para atualizar o Word → aprovar e gerar o novo PDF.
- Verificação final: 257 testes do worker aprovados, com sete casos opt-in ignorados nessa execução; a nova regressão nativa foi executada separadamente e passou (os outros quatro cenários do arquivo não foram selecionados). Typecheck do worker, ESLint dos sete arquivos TypeScript alterados, Prettier e `git diff --check` passaram. Logs `cover-fix/worker-final.log` e `cover-fix/native-tests.log`.
