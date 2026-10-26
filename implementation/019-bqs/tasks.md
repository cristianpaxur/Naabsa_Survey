# Tarefas — 019 BQS

Estado em 23/10/2026: implementação e artefatos locais concluídos; aceite no destino pendente.

- [x] T-001 Inventariar XLSX/PDF, preservar originais e registrar hashes.
- [x] T-002 Mapear 95 campos, quatro tabelas, eventos, amostras e cinco slots.
- [x] T-003 Registrar confirmação de 19:10 e campos manuais posteriores.
- [x] T-004 Criar spec v1 e template Word reconstruído do PDF autorizado.
- [x] T-005 Implementar adapter, reconciliação de cálculos e preservação de zero.
- [x] T-006 Integrar BQS ao worker, atualização de fotos e conversão do snapshot.
- [x] T-007 Registrar migration sem ativação e testar idempotência local.
- [x] T-008 Gerar Word/PDF do caso fornecido, revisar sete páginas e emitir mapa de campos.
- [x] T-009 Executar testes, revisão independente e corrigir os achados.
- [ ] T-010 Homologar upload → revisão → fotos → edição/salvamento/reabertura → PDF no Collabora/WOPI de destino.
- [ ] T-011 Após aceite e autorização correspondente, publicar código e ativar o spec; preencher dados/fotos reais antes de envio ao cliente.

Atualização: o usuário autorizou homologação e ativação em 23/10/2026. Build
de produção aprovado; aplicação autenticada. Usuário autenticou o Dokploy; worker confirmado com autodeploy na branch de produção. Plano e estado em [deployment.md](deployment.md).

Não encerra toda a implementação 009 nem outros tipos de relatório.

Interrupção em 23/10/2026 às 15:34–15:38: painel e aplicação não respondem
por TCP desta máquina. Nenhum deploy/ativação realizado. T-010/T-011 pendentes
do restabelecimento do acesso; versão local revisada e testes aprovados.

Retomada posterior: Collabora recuperado, healthcheck corrigido e pré-conversão
BQS de 7 páginas aprovada nos campos essenciais. Código 914eccf publicado em
web/worker; tipo/spec cadastrados inativos e relatório QA criado. T-010 aguarda
permissão local da extensão Chrome para executar upload e fluxo real. T-011
continua pendente de homologação e ativação. Detalhes e IDs em deployment.md.

Revisão em 26/10/2026 com os originais Word/XLSX: T-001 a T-009 refeitos
para v2 (128 campos, quatro tabelas editáveis, cinco áreas de fotos). Spec1
preservada. 808 testes passaram, sete skips; lint, tipos, specs e build
aprovados. Prévia no Collabora de produção aprovada visualmente e com todas
as 21 entradas de sumário. Web/worker em 62e022e; spec2 cadastrada inativa e
QA separado criado. T-010 aguarda seleção manual de BQS_HOMOLOGACAO.xlsx
na tela aberta, pois a extensão recusa upload automatizado de arquivo local.
T-011: publicação do código concluída; ativação depende do ciclo real T-010.

Continuação por código/logs: upload e extração reais concluídos, três fotos de
teste enviadas, edição nativa salva por WOPI na revisão2 e reaberta. A troca de
fotos após essa gravação revelou perda dos SDTs no Collabora. Correção em
4205a34/a614dcc usa cinco ranges nativos e guardas de preservação; 24 testes
focados passaram e a revisão independente não deixou achados pendentes.
T-010 continua aberto até repetir a atualização de fotos no código publicado,
aprovar o snapshot e revisar todas as páginas do PDF final. BQS ainda inativo.
