# Ativação das correções da geração online

Estado: preparação local. Ambiente de produção ainda precisa ser identificado; não houve migration, deploy ou substituição do Word do relatório inspecionado.

## Prechecks

- Identificar os serviços web, worker, PostgreSQL/Supabase e Collabora de `surveyors.paxur.com.br`. O conector EasyPanel disponível não lista Naabsa; os arquivos de ambiente locais não acessam esse backend.
- Confirmar a revisão Git publicada e o histórico de migrations no banco correto. Não executar contra os ambientes apontados automaticamente pelos arquivos locais deste checkout.
- Registrar backup verificável do banco e, para qualquer reconstrução da MSC SABRINA, preservar seu registro, fotos, planilha, overrides e o objeto `working_docx_path` atual. Registrar geração e revisão antes da intervenção.
- Contar specs MSC sem ECR e relatórios abertos não excluídos que os usam. A migration 0021 bloqueia a linha do tipo MSC e as linhas de relatórios atualizadas; estimar volume e executar na janela acordada.
- Confirmar no worker que `COLLABORA_CONVERSION_URL` aponta para o mesmo serviço do editor e que o worker consegue converter para PDF. O acesso externo da estação respondeu HTTP 403; não alterar a lista de permissões para contornar esse bloqueio.

## Execução autorizada

1. Aplicar somente migrations pendentes pelo runner normal (`pnpm db:migrate`) com `DATABASE_URL` do ambiente identificado e autorizado. Não alterar migrations já aplicadas e não executar seed geral.
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
