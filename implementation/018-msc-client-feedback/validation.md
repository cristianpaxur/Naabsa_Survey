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
