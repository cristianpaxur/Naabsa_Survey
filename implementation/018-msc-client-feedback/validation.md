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

## Produção

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
