# Ativação das correções da geração online

Estado: ECR aplicado e confirmado na página de fotos. Dokploy de produção identificado em 10/10/2026: web e worker acompanham `codex/msc-video-feedback` com publicação automática após push e registram o commit `057b566` concluído. Uma falha real de paginação por superscrito destacado no PDF foi reproduzida e corrigida; o candidato passou no Collabora do destino e está preparado para o próximo push. Nenhum Word existente foi substituído nesta preparação.

## Conferência após o push — 10/10/2026

- O GitHub recebeu `2587df07e5529b460cd3aa78ac021470a423b062` em `codex/msc-video-feedback`. O workflow `Qualidade` terminou com sucesso: <https://github.com/cristianpaxur/Naabsa_Survey/actions/runs/38062580354>.
- A branch remota `main` permanece em `37622e5f91e0766d0f06f23ace076cdfc48cbb20`. Não foi identificado qual branch o ambiente de produção acompanha; não assumir que acompanha `main` ou a branch das correções.
- `.github/workflows/quality.yml` executa checks e build, sem etapa de publicação. Os comandos de inicialização dos Dockerfiles também não executam migrations; `docs/DEPLOY_EASYPANEL.md` exige executar o runner separadamente.
- O relatório `cc1e98bc-d3c3-4a3c-8a13-f5bcbe30df66`, aberto em `/photos` no navegador conectado após o push, continua com zero fotos e somente `vessel`, `engine_room` e `survey_attendance`. Isso comprova que o spec usado por esse relatório ainda não tem ECR; não comprova, sozinho, qual revisão do worker está publicada ou qual histórico de migrations foi aplicado.
- `PhotosPage` lê `report_specs.spec.photo_slots` pelo `reports.spec_id`, e a criação de relatórios copia `report_types.active_spec_id`. A correção requer confirmar a migration 0021 e os vínculos no banco utilizado por esse domínio. Recarregar a página ou publicar somente os containers não altera esses vínculos.
- O conector EasyPanel disponível lista projetos `innerworks`, `monitoramento` e `glpi`, sem Naabsa. A conexão de navegador fornece apenas o Chrome; a aba de publicação `Environment: pr…` da captura está no Edge e não está disponível nessa conexão. Foi solicitado seu endereço para identificar o ambiente correto.
- O usuário informou `https://naabsasurveys-supabase-61ca72-76-13-234-129.sslip.io`. O endereço responde HTTP 401 com `WWW-Authenticate: Basic realm="service"` e `Server: kong/3.9.3`; o navegador conectado também exige autenticação. Nenhum arquivo `.env*` do checkout consultado corresponde a esse host. A inspeção do banco aguarda login nesse endereço; o vínculo com a aplicação, o histórico de migrations e o backup ainda não foram verificados.

As observações desta seção registram o estado anterior à ativação abaixo. Próxima etapa: identificar o painel/serviços e a revisão publicada, conferir o alcance do Collabora e preparar a publicação das correções do worker. O Word editado existente exige a preservação descrita abaixo.

## Banco acessado e ativação isolada preparada — 10/10/2026

O Chrome autenticado permitiu consultar o Supabase informado. Os dois IDs dos relatórios inspecionados existem nesse banco, confirmando o destino. O tipo MSC é `7c47a900-858a-46ae-81b2-bf3559092485`; seu spec ativo é a versão 2, `4b813737-6931-4243-92c2-3b21eb86b31c`, com `vessel`, `engine_room` e `survey_attendance`, sem ECR. A versão 1 também é usada por um relatório aberto. Há sete relatórios abertos e três na lixeira; nenhum evento de ativação ECR foi registrado.

Esse banco não contém `naabsa_internal.migrations`. Os únicos históricos encontrados pertencem aos serviços internos do Supabase. Não executar o runner geral nem marcar migrations anteriores como aplicadas sem reconciliação: isso poderia reaplicar mudanças históricas além do ECR. Foi preparada somente a migration 0021, mantida literalmente dentro de uma operação atômica com guardas.

- Cópia exportada em `tmp/msc-production-activation-20261010/msc-before.json`: tipo MSC, duas specs, dez relatórios e 112 registros de fotos, incluindo hashes das linhas. SHA-256 `184f132e8793f0357efcfef1f3de57e511dd57cd69c23066393c36105eef0fba`. É uma cópia dos registros de banco desse escopo, sem os arquivos binários de fotos/Word, que a operação não modifica.
- `validate-recovery.mjs` restaurou os registros no PostgreSQL isolado com as migrations/triggers atuais. Os dados restaurados e seus hashes correspondem à origem. A execução de `activate-ecr.sql` passou: duas versões novas, sete vínculos atualizados, oito eventos de auditoria, duas specs antigas e 112 registros de fotos intactos; três relatórios na lixeira preservados. Nenhum campo de valores, formato numérico ou documento foi alterado.
- Os triggers reais de revisão incrementam `data_revision` e `photo_review_revision` na troca de spec. Também limpam quatro revisões de IA e 15 avisos com `origin=ai`, preservando os outros avisos. Esse efeito foi reproduzido e validado; uma nova análise de IA poderá ser solicitada pelos operadores. As revisões do Word e seus caminhos permanecem iguais.
- `activate-ecr.sql` verifica hashes/quantidades antes de alterar, mantém as cópias antigas e confere os efeitos antes de terminar. Foram testadas uma divergência de origem e uma falha proposital depois da migration; ambas interrompem e desfazem toda a operação. A migration original continua idempotente. O wrapper vinculado à cópia anterior aborta se a ativação já tiver ocorrido ou se os registros mudarem.
- A recuperação por vínculo usa os IDs anteriores registrados nos eventos de auditoria, após conferir o estado atual e ausência de fotos ECR nos relatórios a reverter. Preservar as revisões crescentes, dados atuais, novas specs e auditoria; não restaurar linhas inteiras sobre edições posteriores. A cópia integral foi validada para restauração isolada e conserva os estados de IA anteriores para consulta.

Essa preparação foi aprovada e executada conforme a seção seguinte. A publicação das correções do worker e a verificação de uma nova geração Word/Collabora continuam pendentes.

O diagnóstico do DAMLA também foi concluído em leitura: os purificadores estão três linhas abaixo do mapeamento congelado. A leitura por rótulos e a migration 0022 foram preparadas e testadas localmente; [damla-diagnosis.md](damla-diagnosis.md) especifica o alcance. A autorização recebida para o ECR se restringe à 0021. A 0022 exige publicar o core/worker compatível antes de ativar o modelo, e não modifica relatórios existentes. A atualização dos três valores do DAMLA será uma intervenção separada com guarda de revisão e autorização.

## ECR aplicado e conferido em produção — 10/10/2026

O usuário respondeu “Autorizo aplicar a correção do ECR” à proposta de criar duas versões de modelo, atualizar sete relatórios abertos e invalidar quatro revisões antigas de IA, preservando valores, fotos e Word. `activate-ecr.sql` foi colado em uma consulta nova no SQL Editor; a cópia do conteúdo pela interface conferiu integralmente com os 21.330 caracteres do arquivo validado. A operação foi executada uma vez e retornou `active_msc_version=4`, `updated_reports=7` e `ecr_enabled_for_current_report=true`. Não houve divergência das guardas nem execução do runner geral.

A consulta posterior, somente de leitura, foi verificada às **16:12:58 de Brasília (19:12:58 UTC)**. Comparou hashes calculados da cópia anterior com as linhas efetivas, considerando somente as mudanças autorizadas de spec e revisão. Confirmou:

- Dez relatórios existentes, com sete vínculos atualizados e três relatórios da lixeira integralmente preservados. Valores e todas as colunas/caminhos/revisões de documento continuam iguais.
- Quatro specs: duas originais intactas e duas cópias cujo conteúdo difere somente pela versão e pelo slot ECR opcional. O modelo ativo é a versão 4.
- Os hashes dos **112 registros de fotos** são iguais aos da cópia anterior. A configuração do tipo MSC conserva as demais colunas.
- Oito eventos de auditoria: sete `msc_ecr_report_spec_updated` e um `msc_ecr_spec_added`. As quatro revisões antigas de IA e os 15 avisos de origem IA foram removidos pelos triggers previstos; nenhuma revisão antiga permanece nos relatórios abertos.

A página publicada `https://surveyors.paxur.com.br/reports/cc1e98bc-d3c3-4a3c-8a13-f5bcbe30df66/photos` exibiu os quatro grupos: Vessel, Engine room, Survey attendance e **ECR (Engine Control Room)**, com botão “Alocar”, proporção 4:3 e indicação opcional. Não foi necessário publicar containers para essa correção dos vínculos. Não foram enviadas/alocadas fotos de teste nem aberto o editor para produzir um documento.

Evidências locais privadas: `tmp/msc-production-activation-20261010/production-verification.json`, `verify-ecr-production.sql`, `database-after.jpg` e `ecr-photos-after.jpg`. A tela de fotos foi deixada aberta no Chrome. A autorização e esta execução não abrangem a migration 0022, valores DAMLA, publicação do worker ou reconstrução de documentos existentes.

## Prechecks

- Identificar os serviços web, worker, PostgreSQL/Supabase e Collabora de `surveyors.paxur.com.br`. O conector EasyPanel disponível não lista Naabsa; os arquivos de ambiente locais não acessam esse backend.
- Confirmar a revisão Git publicada e o histórico de migrations no banco correto. Não executar contra os ambientes apontados automaticamente pelos arquivos locais deste checkout.
- Registrar backup verificável do banco e, para qualquer reconstrução da MSC SABRINA, preservar seu registro, fotos, planilha, overrides e o objeto `working_docx_path` atual. Registrar geração e revisão antes da intervenção.
- Contar specs MSC sem ECR e relatórios abertos não excluídos que os usam. A migration 0021 bloqueia a linha do tipo MSC e as linhas de relatórios atualizadas; estimar volume e executar na janela acordada.
- Confirmar no worker que `COLLABORA_CONVERSION_URL` aponta para o mesmo serviço do editor e que o worker consegue converter para PDF. O acesso externo da estação respondeu HTTP 403; não alterar a lista de permissões para contornar esse bloqueio.

## Dokploy identificado e falha de paginação reproduzida — 10/10/2026

O painel informado pelo usuário é **Dokploy v0.30.2**, em `http://76.13.234.129:3000`, organização Paxur, projeto **Naabsa_Surveys**, ambiente **production**. Os serviços `web` (`05Y251QP0Hho86-q5-aMn`) e `worker` (`65rR3ki0J0fNV7J6YfF-S`) usam o repositório `cristianpaxur/Naabsa_Survey`, branch `codex/msc-video-feedback`, raiz `/`, Dockerfiles `Dockerfile.web` e `Dockerfile.worker`. Ambos têm Autodeploy ativo, On Push, sem filtro Watch Paths. Portanto, o push já autorizado também dispara os dois deploys; não é necessário acionar Deploy/Rebuild manualmente nem mudar a configuração.

O histórico de ambos registra `057b566`, `a4168c9`, `2587df0` e `4a586cf` como concluídos. O log de build do worker em `2587df0` confirma a cópia de `templates/msc.clean.docx`. O container atual `942d6e570057` iniciou às 16:16:30 e registrou `worker pronto`. Liveness pública respondeu HTTP 200; a consulta no próprio worker confirmou banco, heartbeat, fila e bucket privado saudáveis. A conversão interna pelo Collabora também funcionou, sem alterar permissões de rede.

Às 18:12:56–18:13:02, a montagem do relatório `fae24adc-81aa-473b-bbb3-b93519b615c0` falhou três vezes: `Paginação MSC: seção s3_4 (Gross volume - m3) ausente ou ambígua no PDF`. O ensaio vazio passa porque esse título permanece na página 3. Com os dados reais, o título inicia a página 4 e o Poppler extrai o `3` sobrescrito em uma linha anterior a `3.4.Gross volume - m`. O OOXML mantém exatamente esse expoente em um run com `w:vertAlign="superscript"`; o título está presente e a falha é da identificação textual.

O parser corrigido aceita a linha completa ou a linha base acompanhada pelo expoente exato indicado no OOXML, somente em uma linha imediatamente adjacente da mesma página. Continua rejeitando unidade ausente/diferente, título ausente, expoente em outra página e páginas ambíguas. Não altera o pacote Word, dados ou estilos.

O candidato foi executado em memória no worker, sem editar arquivos do container ou registros, com a planilha, dados efetivos, formatos numéricos, logo, crops e sete fotos da geração real. A implementação anterior falhou novamente; a corrigida concluiu a montagem numerada e a conversão: seis páginas, 12 eventos, Vessel/Engine room/Survey attendance na 5, ECR e Attachment na 6. Todas as 18 seções foram localizadas; contatos terminaram na página 1. Hashes das linhas do relatório e das fotos permaneceram iguais. Evidência privada: `collabora-full-recheck.json` em `tmp/msc-production-activation-20261010/`.

Validação local: sete novos casos, 12 testes de paginação aprovados; core 215, db 27, web 231 e worker 228 = **701 aprovados**, mais **sete golden**. A primeira execução conjunta sofreu seis timeouts de 5 s nas suítes de montagem/fidelidade; a repetição isolada completa do worker com dois workers passou, sem alterar código ou limites desses testes. Typecheck do worker, lint, Prettier dos arquivos alterados e build completo passaram. O próximo passo é acompanhar o deploy automático após o push e reabrir somente a geração falhada sem Word publicado, preservando os documentos existentes. A 0022 e a atualização dos valores DAMLA continuam separadas.

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
