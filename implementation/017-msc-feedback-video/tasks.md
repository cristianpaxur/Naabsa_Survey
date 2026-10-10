# Tarefas — 017

Status: **fidelidade e correções locais concluídas, 13/14 tarefas**. F-001 a F-005 e T-006 concluídas localmente; 9/9 páginas pixel idênticas no Word e correções da geração online registradas em validation.md. Causa do DAMLA comprovada e correção preparada. T-009 mantém ativação, publicação e aceite externo no Collabora.

- [x] **F-001:** Template real sanitizado, original intacto e slots documentados.
- [x] **F-002:** Builder baseado no template, com hierarquia e formatação exatas.
- [x] **F-003:** Comparação estrutural/visual de todas as páginas, regressões e revisão independente.
- [x] **F-004:** Preparar migration ECR para specs congelados incompletos e relatórios abertos, com auditoria, preservação de dados/históricos e teste isolado de idempotência. Cobre RF-010/CA-010/CT-010; aplicação no destino integra T-009.
- [x] **F-005:** Corrigir capa com contatos longos, padding e altura de linha das fotos, bloco de anexos e medição final do sumário no motor do destino. Inclui leitura de superscrito destacado no PDF do Collabora, reproduzida com a geração real em 10/10/2026. Cobre RF-011/RF-012, CA-011/CA-012 e CT-011/CT-012; inclui inspeção do exemplar e regressões nativas.

- [x] **T-001:** Fixar fixtures, referência visual e reprodução dos defeitos
  - **Cobre:** RF-001, RF-002, RF-007, RF-009
  - **Valida:** CA-001, CA-002, CA-007, CA-009
  - **Testes:** CT-001, CT-002, CT-007, CT-009
  - **Arquivos esperados:** `packages/core/src/extractor/msc-extract.test.ts`, `apps/worker/src/lib/buildDocxMsc.test.ts`, fixtures MSC e evidências temporárias
  - **Dependências:** nenhuma
  - **Risco:** low
  - **Critério de conclusão:** testes reproduzem os defeitos de layout; valores da fixture e hash do exemplo registrados.

- [x] **T-002:** Ajustar cabeçalho MSC e alinhamento/colunas dos contatos
  - **Cobre:** RF-001, RF-002
  - **Valida:** CA-001, CA-002
  - **Testes:** CT-001, CT-002
  - **Arquivos esperados:** `templates/msc.clean.docx`, seu contrato e `buildDocxMsc.ts`/teste; helper compartilhado preservado
  - **Dependências:** T-001
  - **Risco:** medium
  - **Critério de conclusão:** capa e páginas pares/ímpares conferidas sem sobreposição; testes do cabeçalho padrão continuam passando.

- [x] **T-003:** Preservar Contents do Word e conferir Vessel no sumário/corpo
  - **Cobre:** RF-003, RF-004
  - **Valida:** CA-003, CA-004
  - **Testes:** CT-003, CT-004
  - **Arquivos esperados:** `apps/worker/src/lib/buildDocxMsc.ts`, seu teste
  - **Dependências:** T-001
  - **Risco:** low
  - **Critério de conclusão:** Contents à esquerda, hierarquia 1–6 e 5.1 Vessel, link/bookmark único e paginação original do título.

- [x] **T-004:** Preservar estilos e apresentação original dos purificadores
  - **Cobre:** RF-005
  - **Valida:** CA-005
  - **Testes:** CT-005
  - **Arquivos esperados:** `apps/worker/src/lib/buildDocxMsc.ts`, seu teste
  - **Dependências:** T-001, T-002
  - **Risco:** medium
  - **Critério de conclusão:** estilos, fontes, espaços e runs originais preservados; rótulos e unidades legíveis, sem perda de precisão.

- [x] **T-005:** Usar data por extenso no Found at Survey
  - **Cobre:** RF-006
  - **Valida:** CA-006
  - **Testes:** CT-006
  - **Arquivos esperados:** `apps/worker/src/lib/buildDocxMsc.ts`, seu teste
  - **Dependências:** T-001
  - **Risco:** low
  - **Critério de conclusão:** data longa em inglês no texto; datas numéricas preservadas no Time log; vazios/inválidos cobertos.

- [x] **T-006:** Identificar a origem dos dados em branco e aplicar a correção comprovada
  - **Estado:** XLSX e registro real consultados em 10/10/2026. Purificadores em K32/K33/K34, três linhas abaixo do spec; viagem 635S já salva. Leitura por rótulos validada nas duas posições e no DAMLA real, alterando somente os três valores extraídos e preservando tabelas. Migration 0022 prepara cópia para novos relatórios; ativação e atualização autorizada do DAMLA existente integram T-009. Detalhes em [damla-diagnosis.md](damla-diagnosis.md).
  - **Cobre:** RF-007
  - **Valida:** CA-007
  - **Testes:** CT-007
  - **Arquivos esperados:** `msc-extract.test.ts`, `apps/worker/src/jobs/generatePdf.ts`/teste, spec MSC somente se comprovado necessário e evidência de diagnóstico
  - **Dependências:** T-001
  - **Risco:** high
  - **Critério de conclusão:** viagem/purificadores chegam ao DOCX; overrides/zero preservados; causa do DAMLA documentada sem sobrescrever histórico. Comprovado por fonte/spec/extração e ensaio OOXML local.

- [x] **T-007:** Corrigir quebra e cabeçalho do Time log
  - **Cobre:** RF-008
  - **Valida:** CA-008
  - **Testes:** CT-008
  - **Arquivos esperados:** `apps/worker/src/lib/buildDocxMsc.ts`, testes unitário e de integração MSC
  - **Dependências:** T-001, T-004
  - **Risco:** medium
  - **Critério de conclusão:** eventos do log compacto ficam juntos; título mantém sua paginação original; log longo repete cabeçalho, com linhas/eventos completos.

- [x] **T-008:** Reduzir fotos para o padrão do exemplo e agrupá-las em duas colunas
  - **Cobre:** RF-004, RF-009
  - **Valida:** CA-004, CA-009
  - **Testes:** CT-004, CT-009
  - **Arquivos esperados:** `msc-photo-layout.ts`/teste, `buildDocxMsc.ts`/teste e integração MSC
  - **Dependências:** T-001, T-003, T-004
  - **Risco:** medium
  - **Critério de conclusão:** desenhos e tamanhos originais da galeria, proporção e ordem preservadas, pares de fotos, capa separada e paginação original dos títulos.

- [ ] **T-009:** Validar Word/PDF completo e preparar instruções de ativação
  - **Estado:** validação local, diagnóstico DAMLA e instruções de ativação prontos. ECR aplicado e verificado; valores/Word/fotos/lixeira preservados e quatro revisões antigas de IA invalidadas conforme autorizado. Dokploy e Autodeploy na branch identificados; uma falha real de leitura do superscrito foi corrigida e o ensaio completo passou no Collabora com seis páginas, 12 eventos e sete fotos. Restam acompanhar a publicação e verificar o documento na interface, ativar o modelo por rótulos e atualizar os valores DAMLA com autorização. O documento editado existente está preservado; sua reconstrução exige conferir e conservar essa versão.
  - **Cobre:** RF-001, RF-002, RF-003, RF-004, RF-005, RF-006, RF-007, RF-008, RF-009
  - **Valida:** CA-001, CA-002, CA-003, CA-004, CA-005, CA-006, CA-007, CA-008, CA-009
  - **Testes:** CT-001, CT-002, CT-003, CT-004, CT-005, CT-006, CT-007, CT-008, CT-009
  - **Arquivos esperados:** integração MSC, golden MSC, `validation.md`, `tasks.md` e `implementation/README.md`
  - **Dependências:** T-002, T-003, T-004, T-005, T-006, T-007, T-008
  - **Risco:** medium
  - **Critério de conclusão:** regressões e inspeção de todas as páginas aprovadas; números/links corretos; nenhuma instrução do Word na saída; ativação preparada e execução publicada explicitamente registrada como etapa separada.
