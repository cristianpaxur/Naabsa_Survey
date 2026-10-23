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
