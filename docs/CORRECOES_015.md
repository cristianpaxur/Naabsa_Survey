# Aplicação e validação das correções 015

Código preparado em 14/09/2026. As migrations **não foram aplicadas em banco externo**.
A lista do que foi executado e do que depende do ambiente está em
[validation.md](../implementation/015-correcao-integrada/validation.md).

## O que muda para o operador

| Problema | Comportamento corrigido |
|---|---|
| IA desligada apesar da configuração local | Web, worker e comandos de banco seguem a mesma precedência de configuração. O diagnóstico mostra o provedor efetivamente selecionado. |
| IA parecia não responder | Revisão mostra avisos persistidos, andamento e repetição; alterações nos dados invalidam resultados antigos. |
| Upload travava | Erros de rede, timeout e resposta inválida aparecem na tela; sucessos parciais são preservados e o envio pode ser repetido. |
| IA alterava escolhas nas fotos | Sugestões precisam de confirmação e não substituem decisões manuais; processamento possui estado por foto. |
| Organização de fotos incompleta | Há remoção, desalocação, reordenação, repetição de processamento e renovação de URLs. Fotos continuam opcionais. |
| Aprovação podia usar arquivo errado | Salvamento precisa de confirmação e revisão persistida; timeout exige recuperar a sessão do editor. A aprovação fixa um arquivo imutável. |
| Falha de fila deixava a tela esperando | Falhas são registradas e a interface oferece nova tentativa. Jobs antigos não substituem edições/aprovações posteriores. |
| Acentos corrompidos nos modelos | Novas versões das specs corrigem os textos. Arquivos já eram UTF-8; ativar charset não repararia os textos gravados. |
| Divergência de 0,5% era aceita até 5% | O limite passa de 0,05 para 0,005, com regressão testada. |
| Desativação de usuário incompleta | RLS, ações administrativas e WOPI verificam acesso ativo; mudar acesso revoga sessões existentes. |

## Ordem para atualizar o ambiente

1. Prepare uma **homologação isolada**, com banco, Auth, bucket e filas próprios. Faça backup do banco e Storage antes de atualizar qualquer ambiente com dados reais.
2. Pare web e worker antigos durante a atualização. A primeira execução do novo runner registra as migrations históricas em um único lote transacional; os próximos comandos aplicam apenas scripts novos e verificam seus checksums.
3. Configure as variáveis no processo correto. No desenvolvimento: processo > `.env.local` da raiz > `.env`. No Compose: `.env`. No EasyPanel: variáveis de runtime. Use o mesmo projeto Supabase em web e worker.
4. Execute `pnpm --filter @naabsa/worker diagnose`. Se IA estiver ligada, selecione provedor/modelo e a chave correspondente. Não há chamada paga nesse comando. `WOPI_TOKEN_SECRET` precisa ter **pelo menos 32 caracteres em produção**; gere e armazene um segredo aleatório apropriado. Alterá-lo invalida os tokens WOPI existentes.
5. Com `DATABASE_URL` apontando explicitamente para a homologação, execute `pnpm db:migrate`. Não rode seeds de demonstração sobre dados reais.
6. Recrie a imagem do worker para instalar o decoder HEIC, além do LibreOffice. Publique web e worker da mesma revisão; inicie Collabora com a URL WOPI e o domínio permitidos corretos.
7. Confira `/api/health`; autenticado como administrador ativo, confira `/api/health/ready`. Liveness verde, sozinho, não garante fila/IA/editor funcionando.
8. Execute os aceites abaixo. Só depois repita o procedimento no ambiente real.

| Migration | Finalidade |
|---|---|
| `0009_active_access.sql` | Revogação de sessões, sincronização de acesso e RLS ativo. |
| `0010_repair_specs.sql` | Novas versões com textos corrigidos e limite de 0,5%; mantém referências históricas. |
| `0011_editor_integrity.sql` | Geração e revisão do Word; referência imutável do arquivo aprovado. |
| `0012_photo_ai_state.sql` | Estado da IA por foto, remoção lógica, revisão de fotos e proteção de alocação. |
| `0013_ai_review_state.sql` | Revisão dos dados, estado da análise e heartbeat do worker. |

Relatórios existentes continuam apontando para sua spec histórica. A reparação vale
para novos relatórios; não altera silenciosamente documentos históricos. Uma mudança
de versão nos relatórios antigos exige avaliação específica.

As versões de Word e os arquivos aprovados são preservados. A remoção de uma foto na
interface não apaga o objeto que um documento pode referenciar. Monitore o crescimento
do Storage; a coleta de versões órfãs não faz parte desta correção.

O worker usa a base explícita `node:22-trixie-slim`, alinhada aos pacotes de decoder
declarados no Dockerfile. Isso ainda exige build e teste na plataforma de destino.
Referências de empacotamento: [imagem oficial Node](https://hub.docker.com/_/node)
e [libheif no Debian Trixie](https://packages.debian.org/trixie/libheif-examples).

## Aceites no ambiente isolado

1. Entre com operador ativo, desative-o por um administrador e tente novamente API e editor já aberto. Reative-o e exija novo login. Confira outro operador para evitar confundir uma sessão expirada com indisponibilidade geral.
2. Extraia Draft Survey (carga/descarga) e MSC. Confira `São Luís`, `ação`, números e datas. Teste divergência de 0,5% e uma maior que o limite.
3. Com IA ligada, aguarde análise, confira avisos na revisão, altere um campo e repita. Desligue IA e confirme que a revisão manual continua disponível. Interrompa o worker durante uma análise e valide a recuperação.
4. Envie 25 JPEGs, PNG, HEIC de celular com orientação e arquivo inválido. Simule perda de conexão. Confirme sucesso parcial, repetição, orientação, sugestões, confirmação manual, remoção, ordem e fotos opcionais.
5. Edite uma frase identificável no Collabora. Salve, aprove e confira essa frase no PDF baixado. Interrompa a fila; repita. Force timeout de salvamento e confirme que a aprovação fica bloqueada até recuperação explícita.
6. Reenvie um job antigo de montagem/PDF em teste e confirme que as edições e a versão aprovada permanecem intactas. Verifique histórico e permissões do bucket.

## Comandos dos testes opcionais

Exemplos PowerShell, **somente com ambiente isolado configurado**:

```powershell
# SQL/RLS contra Supabase real: altera dados de teste.
$env:RUN_DB_TESTS = '1'
$env:NAABSA_TEST_DATABASE = 'isolated'
pnpm --filter @naabsa/db test:integration

# Navegador: requer usuários de teste, specs, worker e Collabora.
$env:NAABSA_TEST_DATABASE = 'isolated'
$env:E2E_BASE_URL = 'http://localhost:3000'
pnpm e2e

# Conversão local real: não usa banco nem provedor de IA.
$env:RUN_LO_TESTS = '1'
pnpm --filter @naabsa/worker exec vitest run src/lib/soffice.integration.test.ts

# HEIC na imagem do worker: substitua o diretório pela fixture local real.
docker build -f Dockerfile.worker -t naabsa-worker:015 .
docker run --rm --entrypoint node --mount 'type=bind,source=C:\caminho\fixtures,target=/fixtures,readonly' -e HEIC_FIXTURE=/fixtures/portrait.heic -e HEIC_EXPECT_PORTRAIT=1 naabsa-worker:015 node_modules/vitest/vitest.mjs run src/jobs/heic.container.test.ts
```

Os scripts E2E usam contas de teste (`@naabsa.dev` por padrão); não configure essas
contas em produção. A suíte de navegador ainda precisa ser executada com a stack
completa. O teste de fluxo abre/aprova o documento; inserir uma alteração no canvas
do Collabora e conferir seu texto no PDF permanece um aceite manual obrigatório.
Mock, SQL em memória e build não substituem esse aceite.

## Recuperação de uma atualização

O runner reverte todo o lote SQL quando uma migration falha. Depois do commit, as novas
colunas/specs e a revogação de acesso permanecem. Não remova essas proteções para fazer
uma versão antiga iniciar. Se o aceite falhar, mantenha o ambiente fora de uso, preserve
logs e corrija a versão. Restauração de backup requer considerar banco **e** objetos do
Storage criados depois do backup; não execute rollback de dados sem essa avaliação.
