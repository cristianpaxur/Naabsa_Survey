# Ativação das correções da geração online

Estado: Supabase de produção identificado e consultado; serviços web/worker e revisão publicada ainda precisam ser identificados. Não houve migration, deploy ou substituição do Word do relatório inspecionado.

## Conferência após o push — 10/10/2026

- O GitHub recebeu `2587df07e5529b460cd3aa78ac021470a423b062` em `codex/msc-video-feedback`. O workflow `Qualidade` terminou com sucesso: <https://github.com/cristianpaxur/Naabsa_Survey/actions/runs/38062580354>.
- A branch remota `main` permanece em `37622e5f91e0766d0f06f23ace076cdfc48cbb20`. Não foi identificado qual branch o ambiente de produção acompanha; não assumir que acompanha `main` ou a branch das correções.
- `.github/workflows/quality.yml` executa checks e build, sem etapa de publicação. Os comandos de inicialização dos Dockerfiles também não executam migrations; `docs/DEPLOY_EASYPANEL.md` exige executar o runner separadamente.
- O relatório `cc1e98bc-d3c3-4a3c-8a13-f5bcbe30df66`, aberto em `/photos` no navegador conectado após o push, continua com zero fotos e somente `vessel`, `engine_room` e `survey_attendance`. Isso comprova que o spec usado por esse relatório ainda não tem ECR; não comprova, sozinho, qual revisão do worker está publicada ou qual histórico de migrations foi aplicado.
- `PhotosPage` lê `report_specs.spec.photo_slots` pelo `reports.spec_id`, e a criação de relatórios copia `report_types.active_spec_id`. A correção requer confirmar a migration 0021 e os vínculos no banco utilizado por esse domínio. Recarregar a página ou publicar somente os containers não altera esses vínculos.
- O conector EasyPanel disponível lista projetos `innerworks`, `monitoramento` e `glpi`, sem Naabsa. A conexão de navegador fornece apenas o Chrome; a aba de publicação `Environment: pr…` da captura está no Edge e não está disponível nessa conexão. Foi solicitado seu endereço para identificar o ambiente correto.
- O usuário informou `https://naabsasurveys-supabase-61ca72-76-13-234-129.sslip.io`. O endereço responde HTTP 401 com `WWW-Authenticate: Basic realm="service"` e `Server: kong/3.9.3`; o navegador conectado também exige autenticação. Nenhum arquivo `.env*` do checkout consultado corresponde a esse host. A inspeção do banco aguarda login nesse endereço; o vínculo com a aplicação, o histórico de migrations e o backup ainda não foram verificados.

Próxima verificação: identificar o painel/serviços, revisão publicada, banco e backup; conferir migrations pendentes e alcance do Collabora. Depois apresentar a ativação específica para aprovação e executar o smoke test do ECR e de uma nova geração MSC. O Word editado existente exige a preservação descrita abaixo.

## Banco acessado e ativação isolada preparada — 10/10/2026

O Chrome autenticado permitiu consultar o Supabase informado. Os dois IDs dos relatórios inspecionados existem nesse banco, confirmando o destino. O tipo MSC é `7c47a900-858a-46ae-81b2-bf3559092485`; seu spec ativo é a versão 2, `4b813737-6931-4243-92c2-3b21eb86b31c`, com `vessel`, `engine_room` e `survey_attendance`, sem ECR. A versão 1 também é usada por um relatório aberto. Há sete relatórios abertos e três na lixeira; nenhum evento de ativação ECR foi registrado.

Esse banco não contém `naabsa_internal.migrations`. Os únicos históricos encontrados pertencem aos serviços internos do Supabase. Não executar o runner geral nem marcar migrations anteriores como aplicadas sem reconciliação: isso poderia reaplicar mudanças históricas além do ECR. Foi preparada somente a migration 0021, mantida literalmente dentro de uma operação atômica com guardas.

- Cópia exportada em `tmp/msc-production-activation-20261010/msc-before.json`: tipo MSC, duas specs, dez relatórios e 112 registros de fotos, incluindo hashes das linhas. SHA-256 `184f132e8793f0357efcfef1f3de57e511dd57cd69c23066393c36105eef0fba`. É uma cópia dos registros de banco desse escopo, sem os arquivos binários de fotos/Word, que a operação não modifica.
- `validate-recovery.mjs` restaurou os registros no PostgreSQL isolado com as migrations/triggers atuais. Os dados restaurados e seus hashes correspondem à origem. A execução de `activate-ecr.sql` passou: duas versões novas, sete vínculos atualizados, oito eventos de auditoria, duas specs antigas e 112 registros de fotos intactos; três relatórios na lixeira preservados. Nenhum campo de valores, formato numérico ou documento foi alterado.
- Os triggers reais de revisão incrementam `data_revision` e `photo_review_revision` na troca de spec. Também limpam quatro revisões de IA e 15 avisos com `origin=ai`, preservando os outros avisos. Esse efeito foi reproduzido e validado; uma nova análise de IA poderá ser solicitada pelos operadores. As revisões do Word e seus caminhos permanecem iguais.
- `activate-ecr.sql` verifica hashes/quantidades antes de alterar, mantém as cópias antigas e confere os efeitos antes de terminar. Foram testadas uma divergência de origem e uma falha proposital depois da migration; ambas interrompem e desfazem toda a operação. A migration original continua idempotente. O wrapper vinculado à cópia anterior aborta se a ativação já tiver ocorrido ou se os registros mudarem.
- A recuperação por vínculo usa os IDs anteriores registrados nos eventos de auditoria, após conferir o estado atual e ausência de fotos ECR nos relatórios a reverter. Preservar as revisões crescentes, dados atuais, novas specs e auditoria; não restaurar linhas inteiras sobre edições posteriores. A cópia integral foi validada para restauração isolada e conserva os estados de IA anteriores para consulta.

Estado: aplicação no banco de produção aguardando aprovação explícita. Preparação e validação não equivalem a execução. A publicação das correções do worker e a verificação de uma nova geração Word/Collabora continuam pendentes.

O diagnóstico do DAMLA também foi concluído em leitura: os purificadores estão três linhas abaixo do mapeamento congelado. A leitura por rótulos e a migration 0022 foram preparadas e testadas localmente; [damla-diagnosis.md](damla-diagnosis.md) especifica o alcance. A aprovação pendente do ECR se restringe à 0021. A 0022 exige publicar o core/worker compatível antes de ativar o modelo, e não modifica relatórios existentes. A atualização dos três valores do DAMLA será uma intervenção separada com guarda de revisão e autorização.

## Prechecks

- Identificar os serviços web, worker, PostgreSQL/Supabase e Collabora de `surveyors.paxur.com.br`. O conector EasyPanel disponível não lista Naabsa; os arquivos de ambiente locais não acessam esse backend.
- Confirmar a revisão Git publicada e o histórico de migrations no banco correto. Não executar contra os ambientes apontados automaticamente pelos arquivos locais deste checkout.
- Registrar backup verificável do banco e, para qualquer reconstrução da MSC SABRINA, preservar seu registro, fotos, planilha, overrides e o objeto `working_docx_path` atual. Registrar geração e revisão antes da intervenção.
- Contar specs MSC sem ECR e relatórios abertos não excluídos que os usam. A migration 0021 bloqueia a linha do tipo MSC e as linhas de relatórios atualizadas; estimar volume e executar na janela acordada.
- Confirmar no worker que `COLLABORA_CONVERSION_URL` aponta para o mesmo serviço do editor e que o worker consegue converter para PDF. O acesso externo da estação respondeu HTTP 403; não alterar a lista de permissões para contornar esse bloqueio.

## Execução autorizada

1. Em ambiente com histórico reconciliado, aplicar somente migrations pendentes pelo runner normal (`pnpm db:migrate`) com `DATABASE_URL` identificado e autorizado. No banco legado identificado acima, usar somente a ativação isolada preparada da 0021, após aprovação e reconferência das guardas. Não alterar migrations já aplicadas, inventar checksums de histórico ou executar seed geral.
2. Publicar o worker com as correções MSC; a tela de fotos usa os slots do spec congelado e passa a mostrar ECR após carregar o novo vínculo. As demais configurações permanecem iguais.
3. Conferir auditoria `msc_ecr_spec_added` e `msc_ecr_report_spec_updated`, slots opcionais, IDs novos/anteriores e preservação dos dados/documentos. Verificar que approved/generated/purged e lixeira mantêm seus IDs originais.
4. Gerar um relatório de teste com contatos longos e fotos nos quatro grupos, incluindo ECR; abrir no Collabora e conferir capa, sumário, fotos completas, títulos e PDF. Confirmar erro recuperável quando a conversão/medição falha.

## Documento já existente

A nova montagem vale para novos DOCX. A migration preserva `working_docx_path`, e a entrada no editor só monta quando esse caminho está vazio. Reabrir a edição, voltar para fotos ou reabrir um PDF gerado não reconstrói o arquivo existente.

Para atualizar a MSC SABRINA, aprovar uma intervenção específica após salvar/preservar sua versão editada: produzir uma nova cópia a partir das fontes, conferir seus dados contra os do relatório e publicar com guarda de geração/revisão. Não apagar o objeto anterior ou limpar o caminho em uma sessão WOPI ativa. Essa reconstrução não foi executada durante a inspeção.

## Recuperação e critérios de interrupção

- Interromper se o backup não estiver verificável, a medição falhar, a auditoria/vínculos divergirem ou qualquer valor/célula/documento mudar inesperadamente.
- As cópias antigas de specs e os objetos Word ficam preservados. Reverter vínculos usando os IDs anteriores registrados na auditoria, somente para relatórios ainda abertos e depois de verificar se já existem fotos alocadas em ECR; um vínculo antigo não aceita esse slot.
- Reverter a revisão do worker se necessário. Preservar as novas specs e auditoria; não remover dados nem editar migrations aplicadas. Corrigir por migration nova quando um retorno simples não for seguro.
