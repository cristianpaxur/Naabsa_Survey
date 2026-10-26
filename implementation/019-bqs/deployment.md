# Homologação e ativação BQS

## Autorização e escopo

Em 23/10/2026, o usuário autorizou: “Pode seguir com a homologação do BQS no
Collabora e, estando tudo certo, ativar no sistema para eu testar o fluxo completo.”
Isso cobre a publicação compatível, ensaio identificado e ativação do novo tipo
após o aceite. Não inclui alterações de credenciais, permissões, DNS, outros
modelos ou documentos existentes.

## Destino identificado

- Aplicação: `https://surveyors.paxur.com.br`.
- Painel conforme registro anterior: Dokploy `http://76.13.234.129:3000`, projeto
  Naabsa_Surveys, production. Worker reconfirmado após autenticação.
- Branch remota consultada nesta execução: `codex/msc-video-feedback` em
  `f110aa0d249392c4a872e16e854855de47ae8699`; `main` em `37622e5...`.
- O histórico informa autodeploy de web e worker no push à branch acima. Nenhum
  push deve preceder a identificação dos serviços atuais e a preparação de reversão.
- O dashboard autenticado mostra 30 relatórios e os cinco tipos legados; BQS
  ainda não consta. Nenhum desses relatórios foi aberto para edição nesta inspeção.
- Os `.env` locais apontam para serviços de desenvolvimento em localhost;
  não são credenciais do ambiente de destino. Não usar o runner geral no banco
  legado sem reconciliação do histórico.

## Sequência

1. Conferir revisão/digest de web, worker e Collabora, conversor configurado,
   health e filas. Registrar a configuração relevante com segredos redigidos.
2. Preservar os vínculos dos tipos e inventário de specs/relatórios; registrar
   estado de BQS e ausência de alteração dos demais tipos. Manter revisão anterior
   dos containers disponível para reversão.
3. Renderizar o candidato pelo Collabora de destino, conferir todas as páginas,
   fontes, tabelas, contatos e sumário antes da habilitação geral.
4. Publicar somente a alteração BQS e os ajustes compartilhados testados. Aplicar
   apenas o cadastro 0029, com spec e tipo inativos; não rodar seed/migrations gerais.
5. Criar um relatório identificado de homologação vinculado explicitamente ao
   spec candidato. Usar a planilha fornecida e o override confirmado. Não modificar um
   relatório existente para transformá-lo em teste.
6. Exercitar upload/extrator, revisão, alocação de fotos de teste identificadas,
   abertura Collabora, digitação de marca única, save, close/reopen, troca de fotos
   e persistência da edição, aprovação e geração. Conferir a marca no PDF,
   revisão/hash do snapshot e auditoria do fluxo.
7. Só após o aceite, atualizar `active_spec_id` do tipo `bqs`, em transação com
   guardas de IDs, versão/conteúdo e estado prévio. Registrar auditoria da ativação.
8. Verificar BQS selecionável em Novo relatório e deixar essa tela ao usuário.

## Reversão

Se falhar o aceite, manter BQS inativo e preservar evidências. Se houver regressão
compartilhada de web/worker, voltar ambos à revisão previamente registrada.
Reverter apenas o ponteiro ativo BQS se necessário, com comparação do estado
atual. Preservar specs imutáveis, relatórios de teste, snapshots e auditoria;
não apagar dados nem alterar os vínculos dos relatórios existentes.

## Estado desta execução

- Build de produção completo: `pnpm build`, exit 0; evidência em
  `tmp/bqs-homologation-20261023/build.log`.
- Aplicação autenticada no Chrome, acesso ao dashboard confirmado.
- Usuário autenticou o Dokploy. Worker: branch codex/msc-video-feedback,
  autodeploy On Push, Dockerfile.worker, container anterior 2c4f1c8e348e.
- Nenhum push, deploy, cadastro no banco ou ativação executado até este registro.
- Aceite Collabora e ativação em execução.
- Repositório público: originais e evidências privadas excluídos da publicação.
  Testes usam fixture sintética criada sem ler material do cliente.

## Interrupção de conectividade — 23/10/2026

Após a autenticação, foi possível ler a configuração do worker e abrir seu
terminal. Node v22.23.4; container 2c4f1c8e348e; runtime /app/apps/worker.
Uma consulta simples de runtime/fontes funcionou. Depois, a conexão do terminal
parou de responder, e navegar para o serviço web resultou em
`ERR_CONNECTION_TIMED_OUT`.

Às 15:34, 15:36 e 15:38 (America/Sao_Paulo), conexões TCP ao painel:3000 e ao
sistema:443 falharam por timeout; GitHub:443 respondeu. Isso comprova a falha
vista desta máquina, mas não determina se a origem é o VPS, firewall ou rota.
Nenhuma configuração de serviço foi salva, nenhum push/deploy foi executado,
e o cadastro/ativação BQS não foi alterado. A leitura de vínculos do banco não
retornou e, portanto, o inventário anterior à ativação ainda precisa ser obtido.

A versão local foi preparada para publicação pública com fixture sintética e
exclusão dos arquivos privados. Revisão final encontrou e corrigiu uma falha da
guarda do PDF: cada seção agora exige exatamente uma entrada de sumário, mesmo
quando o operador remove um hyperlink. O teste reproduziu a falha antes da
correção e passou depois. Quantidades sintéticas de navio, barcaça e BDN são
distintas para detectar trocas entre fontes.

Verificação local atual: 18 testes BQS de core/worker e 1 de cadastro no banco
passaram; lint, typecheck, check:specs e build completos sem erros. A guarda de
paginação aceitou tanto o PDF local de entrega quanto o PDF do ensaio com edição
e troca de fotos. Evidências em `tmp/bqs-homologation-20261023/` e
`tmp/bqs-intake/`, mantidas somente na máquina do usuário.

Homologação real e ativação permanecem pendentes da restauração do acesso.
A autorização do usuário continua válida; não solicitar novamente autorização
para a sequência já aprovada. Reconfirmar serviços/branches e estado do banco
antes de publicar, pois o estado remoto pode mudar durante a interrupção.

## Retomada e recuperação do conversor — 23/10/2026

O acesso voltou. O Collabora estava parado (exit 255 anterior à intervenção).
Após iniciá-lo, a descoberta interna HTTP respondia 200, enquanto o proxy
respondia 404. A inspeção mostrou healthcheck tentando HTTPS em um serviço
configurado para HTTP interno com TLS no proxy.

Foi preservado backup privado da configuração e aplicado somente:
`pull_policy: never` e healthcheck nativo
`["CMD", "/usr/bin/coolwsd", "--probe", "--disable-ssl"]`, mantendo interval
30s, timeout 10s, start_period 120s e retries 3. Não foram alterados TLS externo,
credenciais, permissões, portas ou volumes. A imagem local antes do redeploy
foi conferida como a mesma imagem em execução (`6b70f91f0b6e`).

Deploy Collabora concluído às 19:40 UTC em 6s; container `c7eaec3fc764`
saudável. A descoberta HTTPS externa passou a responder 200. Pré-conversão
BQS no worker gerou 7 páginas, 190094 bytes, SHA-256
`304d131fd47dd9be66ed8fa58d84d5855297f56d9a96c4b5c85842cc254727a2`.
Identidade, totais de navio/barcaça/BDN e 19:10 presentes no texto extraído.
Evidências privadas: `collabora-healthy.png` e `preflight-pass.png`.

Código `914eccf2ce988118feaefcf335bccd07c8fbbb3f` publicado na branch
existente. O Git estava usando outra conta armazenada; o push foi executado
com a sessão existente do proprietário e a seleção anterior do CLI foi
restaurada. Autodeploy web/worker acompanhado; homologação completa e
ativação ainda não concluídas neste ponto.

### Publicação e cadastro concluídos; upload de homologação pendente

Web e worker concluíram o build da revisão `914eccf` em 23/10/2026.
Worker observado em execução: `abce9e05116b`.
O cadastro 0029 foi aplicado sozinho em transação com guarda de igualdade
semântica do spec, bloqueio e preservação dos ponteiros dos demais tipos.
Nenhum runner geral ou seed foi executado.

- BQS type: `c6b8cca1-7867-416d-a04c-3917c7754017`.
- BQS spec v1: `65906a78-88d4-4a54-9d2b-7807ed4f374a`.
- Relatório QA: `a2331055-7ed8-4b52-b9ec-c3594b187220`, dono Cristian admin,
  título inicial HOMOLOGACAO BQS, status draft.
- `active_spec_id` BQS permanece NULL; demais ponteiros conferidos inalterados.
- Evento auditado: `bqs_homologation_created`, com baseline dos tipos legados.
- Tela de upload do QA aberta no navegador autenticado.

O envio por filechooser foi bloqueado pela extensão do ChatGPT no Chrome:
ela requer a opção "Permitir acesso a URLs de arquivo". A abertura automatizada
de chrome://extensions também foi bloqueada pela política do navegador.
Foi solicitado ao usuário habilitar essa permissão pela interface do Chrome.
Não contornar essa restrição por CDP, configuração de perfil ou outros métodos.
Não declarar upload/edição/PDF final homologados antes de executá-los.

Retomada: confirmar que a permissão foi habilitada; reenviar a planilha pelo
filechooser no relatório QA existente; continuar etapas 6–8 acima. Reutilizar
o relatório e os IDs já registrados, sem cadastrar outro. Comandos privados
preparados em tmp/bqs-homologation-20261023, inclusive verify-command.txt.

O usuário autorizou e informou ter habilitado o acesso a arquivos na extensão.
Mesmo após recarregar a aplicação, fileChooser.setFiles continuou recusando
com a mesma mensagem de permissão. Browser confirmado: Chrome, perfil Cristian,
id 3. Não alterar a configuração por métodos indiretos. Próxima alternativa:
o usuário selecionar a planilha manualmente na tela QA já aberta; depois
retomar a extração e demais ensaios. A planilha ainda não foi enviada.

## Revisão com os originais Word/XLSX — 26/10/2026

Novos exemplos originais analisados sem alteração. A planilha tem Capa, Vessel,
Barge, Sample Report, Time Log, Letter of Protest e VacuoAr, portanto não é
compatível com as coordenadas da spec1. Criada spec2 imutável (128 campos) e
migration0030 aditiva sem alteração do ponteiro ativo.

O Word original é a autoridade de layout v2: estilos, numeração, tema e geometria
foram preservados. Figuras de tabelas substituídas por quatro grades nativas;
cinco áreas de fotos e 21 links de sumário. Removidos dados e fotos demonstrativos,
carimbo, objetos OLE opacos e metadados pessoais. Rodapé da capa corrigido de
literal4 para PAGE. Cliente usa operador da Capa, não contato da empresa.

Mudanças de runtime: seleção por spec.version, denominador percentual recebido
em v2, sinal logbook menos abertura, comparação de barcaça declarada, suporte
estrito a mês inglês e N/A ou hífen em data/hora opcional, revalidação após
overrides, medidas de títulos com numeração nativa, capa540x330 e preservação de
edições ao trocar fotos. V1 permanece disponível para relatórios congelados.
LOA é texto de exibição: 229.00 não vira22900 por interpretação de separadores.

Validação local:808 testes passaram,7skips; lint,typecheck,check:specs e build
passaram. Revisão independente da tarefa1 e revisão final não encontraram
novos defeitos. Correção visual posterior da legenda órfã foi revisada e testada.
Word:6páginas sem fotos,7comfotos de teste. Collabora de produção:8páginas com
fotos de teste; a guarda aceitou capa1página e todas21entradas do sumário.
PNG anterior/final é idêntico em1,2,3,4,7,8; alterações de5/6 conferidas. O
sumário usa a paginação real do conversor; não se exige a contagem do exemplar.

Código publicado até62e022e; deploy web/worker acompanhado em produção.
Cadastro spec2/QA e ciclo WOPI ainda em execução neste ponto. BQS segueinativo.
A extensão do Chrome continua rejeitando filechooser.setFiles por permissão
local. Não contornar pela alteração de perfil,CDP ou APIs de navegador ocultas.
A planilha sintética coerente para o envio manual está em
output/bqs-v2/BQS_HOMOLOGACAO.xlsx; conferência privada do material fornecido
em output/bqs-v2/BQS_CONFERENCIA_DO_EXEMPLO.md. São8conflitos de revisão e
1inconsistência de soma VAC; nenhum valor foi inventado para conciliá-los.

Deploy confirmado em web e worker: commit
`62e022e810b67deacd4d6f421523f5d8aba6e411`, ambos Done no Dokploy.
Worker em execução `5194ef47f31c`. Executado somente o cadastro controlado
0030, em transação, com guarda de spec imutável e ponteiros legados.

- Spec BQS v2: `1540c475-26d2-490f-9fd4-36ecf47a60cc`.
- Novo QA v2: `fb04830c-48be-4498-80e4-552ae1ade910`, Cristian admin,
  título HOMOLOGACAO BQS V2, draft, congelado na spec2.
- BQS continua inativo; ponteiros dos demais tipos conferidos inalterados.
- Evento `bqs_v2_homologation_created`, com baseline dos tipos legados.
- QA v1 anterior não foi alterado nem repinado.

Tela real v2 mostrou Aguardando planilha. Seleção manual solicitada para
`C:\Apps\Naabsa_Survey\output\bqs-v2\BQS_HOMOLOGACAO.xlsx`; o bloqueio
continua sendo a permissão de arquivos da extensão, não uma falha de extração.
Não simular upload bem-sucedido nem ativar enquanto esse aceite não ocorrer.
Tela salva em output/bqs-v2/BQS_HOMOLOGACAO_TELA.png. Prévia de oito páginas
gerada pelo conversor de produção está em BQS_PREVIA_DE_HOMOLOGACAO.pdf;
SHA256 `71f00974027c183bc33688b17e3b98b998dc50c413544134fd3775b8ac6990b3`.
Essa prévia não comprova o ciclo WOPI real, que permanece pendente.

## Homologação pelo servidor — continuação de 26/10/2026

Usuário solicitou diagnóstico por código/logs e aceite sem depender do controle
nativo do Windows. Sessão Dokploy renovada pelo usuário. Collabora c7eaec3fc764
segue saudável, versão26.04.3.1; logs lidos no painel. Os erros de URI sem WOPI,
recursos opcionais404, clipboard EXDEV e desconexões foram registrados, sem
alterar configuração com base apenas nesses sintomas.

No worker5194ef47f31c, preparado Chromium headless de teste e bibliotecas em
/tmp, sem alteração do processo ou imagem do serviço. Primeiro ensaio com
iframe/CSP do destino e WOPI somente leitura abriu o BQS em7páginas. Segundo
ensaio autenticou sessão temporária da mesma conta já autorizada, sem criação
de usuário nem envio de e-mail, abriu a página real do Naabsa e comprovou
iframe carregado e botão Aprovar habilitado. Cada sessão de teste é encerrada
localmente ao final, preservando sessões normais do usuário.

O aceite completo usa somente o QAfb04830c-48be-4498-80e4-552ae1ade910 e as
rotas/ações reais do app. Diálogo informativo de boas-vindas do CODE foi fechado
pelo próprio controle visível do diálogo. Até este registro: marca nativa
BQS QA V2 20261026 EDITION SAVED gravada por WOPI na revisão2, documento
reaberto com a mesma versão e foto retrato realocada de sampling para
vessel_tanks. A atualização encontrou uma falha reproduzível: o Collabora
removeu os SDTs de cover/sounding_tables e reduziu outros a controles inline.
O worker recusou a troca, preservando a revisão2 e a edição manual. A correção
usa cinco ranges de bookmarks nativos, sem acrescentar blocos de layout;
valida limites e preserva texto fora do range, inclusive no mesmo parágrafo.
Um ensaio isolado no conversor real confirmou que os cinco ranges e a marca
editada sobrevivem a DOCX → DOCX. Não houve alteração de configuração baseada
na tela branca: a página real carregou no navegador Linux, enquanto o controle
Chrome/Windows interrompia a leitura do iframe.

A recuperação é restrita ao QA e à revisão2 identificada por SHA256. Os três
arquivos de foto foram encontrados por igualdade exata dos bytes com a revisão1;
os ranges vazios foram localizados pelos controles remanescentes únicos. A
candidata manteve todo o texto e todas as outras partes do pacote. Publicar
revisão imutável com CAS, repetir o ciclo nativo e inspecionar o PDF antes de
ativar. Nenhum relatório de cliente será reconstruído por posição/título.
Atualização de fotos, PDF e ativação ainda em execução.
Evidências privadas em tmp/bqs-intake-20261026/server-*.mjs e, no bucket privado,
<QA>/diagnostics/. Nenhuma spec ou vínculo legado foi alterado nesta etapa.

Correção concluída em 4205a34/a614dcc, revisão independente sem achados pendentes. Duas rodadas reais de troca de fotos → convert-to/docx passaram com todos os cinco ranges válidos e texto nativo preservado. Evidências privadas no QA/diagnostics/native-photo-cycles.{log,docx}. Suíte completa do worker em execução serial: 301 aprovados e7 skips; a primeira execução paralela excedeu5s em14 testes, sem falhas de asserção, e foi repetida com concorrência1 e20s. Tipos, lint e check:specs passaram. Ciclo final publicado/PDF/ativação ainda pendente.
