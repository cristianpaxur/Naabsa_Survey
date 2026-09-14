# Diagnóstico e plano de correção — Naabsa Survey

Data: 14/09/2026. Código analisado: `107f114`. Escopo: implementações, IA, fotos, textos, revisão de dados, editor, PDF, acesso, testes e configuração.

## 1. O que a análise concluiu

**O app tem uma base funcional, mas existem falhas nas conexões entre suas etapas. Os testes atuais não demonstram que o fluxo completo funciona.** Foram encontrados problemas que explicam modos concretos de falha da IA e do upload, além de riscos de perder edições e manter acesso de usuários desativados.

O trabalho realizado foi uma auditoria e a preparação deste plano. Não foram aplicadas correções de código, mudanças de configuração, migrações, alterações de usuários ou deploys. A pasta `supabase/`, já não versionada antes da análise, foi preservada.

| Assunto | Conclusão em linguagem simples | Certeza |
|---|---|---|
| IA desligada | A configuração ativa está em um arquivo diferente do carregado pelos comandos documentados do worker. | Confirmado nos arquivos; processo do servidor ainda não inspecionado. |
| IA na revisão | Mesmo se a chamada funcionar, seus avisos gravados no banco não são carregados pela tela de revisão. | Confirmado no código. |
| Upload | Uma falha de rede ou resposta HTML pode deixar o botão preso em “Enviando”. | Reproduzido em memória com a função real. |
| Fotos HEIC | O upload aceita o formato, mas o container não garante os codecs necessários para processá-lo. | Lacuna confirmada; conversão de HEIC real no container pendente. |
| Textos quebrados | A migração contém textos já corrompidos. Os arquivos examinados são UTF-8 válido. | Confirmado por leitura de bytes e comparação dos dados. |
| Editor/PDF | A aprovação pode prosseguir sem confirmar o salvamento; uma retentativa de montagem pode substituir edições. | Primeira falha confirmada no código; segunda também reproduzida em memória. |
| Escolha manual de fotos | Uma resposta atrasada da IA pode sobrescrever a escolha do operador. | Reproduzido em memória com o código real. |
| Desativação de acesso | Alterar o status do usuário não é suficiente para bloquear tokens anteriores nas regras atuais. | Confirmado na implementação; teste integrado de revogação pendente. |

**Ordem recomendada:** conferir o ambiente; proteger documentos e acesso; estabilizar upload e IA; corrigir textos e regras; validar o percurso completo. As 15 tarefas da seção 5 detalham essa ordem.

## 2. Como ler as evidências

- **Reproduzido:** a falha foi exercitada localmente com código real e dependências simuladas, sem escrever no banco ou chamar serviços de IA.
- **Confirmado no código:** existe um caminho concreto de execução que produz a falha; não significa que ela foi observada no servidor publicado.
- **Pendente no ambiente:** depende de credenciais, processos, configuração ou arquivos reais do ambiente em uso.
- **Alta prioridade:** pode perder trabalho, permitir acesso indevido, impedir um fluxo central ou produzir conteúdo incorreto.
- **Média prioridade:** compromete recuperação, clareza da interface, cobertura de testes ou funcionalidades secundárias.

O ambiente em que os sintomas acontecem não foi informado. Este relatório analisa o repositório e os arquivos locais de configuração; não certifica o estado de produção.

## 3. Problemas encontrados

### A01 — A configuração da IA não está centralizada

**Prioridade alta.** O `.env` da raiz contém `AI_ENABLED=false`. A `.env.local` da raiz contém uma configuração ativa de IA e chave preenchida. Os scripts `dev`/`start` do worker carregam explicitamente `../../.env`; o Compose também usa `.env`. Existe ainda `apps/worker/.env` com a IA desativada. Não foi presumido que o Next carregue automaticamente a `.env.local` da raiz do monorepo.

Se o worker foi iniciado pelos comandos documentados, a configuração ativa nesse outro arquivo não o habilita. Variáveis já presentes no ambiente do processo podem alterar o resultado; por isso a configuração efetiva precisa ser conferida no ambiente em uso.

Além disso, os validadores de ambiente ainda emitem avisos de “esqueleto” e não verificam toda a configuração exigida pelos fluxos atuais. `/api/health` sempre responde `ok`, sem informar se a fila, o worker ou o Storage estão disponíveis.

**Correção proposta:** definir explicitamente a fonte e a precedência das variáveis; validar as obrigatórias no início de cada serviço; apresentar o estado real da IA e da infraestrutura, sem expor chaves. Quando IA estiver habilitada, conferir credencial, modelo e parâmetros compatíveis com o provedor. Essa compatibilidade ainda não foi testada e não é tratada como causa comprovada.

Evidências: [scripts do worker](C:/Apps/Naabsa_Survey/apps/worker/package.json:7), [Compose](C:/Apps/Naabsa_Survey/docker-compose.yml:36), [validação web](C:/Apps/Naabsa_Survey/apps/web/lib/env.ts:31), [validação worker](C:/Apps/Naabsa_Survey/apps/worker/src/lib/env.ts:32), [health](C:/Apps/Naabsa_Survey/apps/web/app/api/health/route.ts:4).

### A02 — Os avisos da IA são gravados, mas não aparecem na revisão

**Prioridade alta.** `aiReview` persiste os avisos em `extraction_issues`. A página de revisão não seleciona essa coluna e monta `initialIssues` apenas com a validação determinística. As edições de campo também retornam apenas essa validação. O cliente não acompanha a conclusão assíncrona da análise.

**Consequência:** a IA pode responder corretamente e o operador não receber o resultado, mesmo após recarregar a página.

**Correção proposta:** carregar e combinar os avisos persistidos com a validação atual, identificar a origem de cada aviso e atualizar a tela quando a análise terminar. Vincular o resultado à versão dos dados para não manter sugestões desatualizadas após alterações.

Evidências: [página de revisão](C:/Apps/Naabsa_Survey/apps/web/app/(app)/reports/[id]/review/page.tsx:41), [montagem dos avisos](C:/Apps/Naabsa_Survey/apps/web/app/(app)/reports/[id]/review/page.tsx:127), [edição de campos](C:/Apps/Naabsa_Survey/apps/web/lib/actions/review.ts:173), [persistência da IA](C:/Apps/Naabsa_Survey/apps/worker/src/jobs/aiReview.ts:123).

### A03 — Upload pode ficar preso em “Enviando”

**Prioridade alta; reproduzido.** `onUpload` ativa `uploading`, chama `fetch` e interpreta JSON sem `try/catch/finally`. Se a rede falhar ou o proxy devolver HTML, a execução não chega à liberação do botão.

Reprodução com a função real, transpilada em memória:

| Falha simulada | Resultado |
|---|---|
| `fetch` rejeita por erro de rede | `uploading=true`, sem mensagem ao usuário. |
| HTTP 502 com corpo HTML | Erro ao interpretar JSON; `uploading=true`, sem mensagem ao usuário. |

**Correção proposta:** tratar transporte, timeout, status HTTP, corpo inválido e resultados parciais; liberar o estado em `finally`; informar quais arquivos chegaram e quais precisam ser reenviados.

Evidência: [upload da tela de fotos](C:/Apps/Naabsa_Survey/apps/web/components/photos/PhotosClient.tsx:94).

### A04 — HEIC é aceito sem suporte de conversão comprovado

**Prioridade alta para quem envia fotos de celular.** A API aceita HEIC/HEIF. O Dockerfile afirma que o Sharp pré-compilado já resolve HEIC, mas não prepara uma instalação de libvips com os codecs necessários.

A inspeção local do Sharp 0.35.1 mostrou `heif.input.fileSuffix=[".avif"]`. Uma tentativa de geração HEVC em memória retornou `heifsave: Unsupported compression`. Isso não substitui um teste de decodificação de uma foto HEIC real.

A documentação oficial informa que HEIC com compressão HEVC exige libvips com suporte a libheif, libde265 e x265. [Documentação do Sharp](https://sharp.pixelplumbing.com/api-output/#heif).

**Correção proposta:** garantir uma conversão compatível no runtime final e testar uma foto real de celular. Até essa validação, a interface deve informar corretamente quais formatos estão efetivamente disponíveis.

Evidências: [Dockerfile do worker](C:/Apps/Naabsa_Survey/Dockerfile.worker:28), [formatos de upload](C:/Apps/Naabsa_Survey/apps/web/app/api/reports/[id]/photos/route.ts:13), [transformação](C:/Apps/Naabsa_Survey/apps/worker/src/jobs/processPhoto.ts:37).

### A05 — Classificação de fotos pode contrariar o operador ou abandonar parte do lote

**Prioridade alta para a sobrescrita; média para acompanhamento e lote.** Há três problemas relacionados:

1. A IA consulta fotos livres, faz uma chamada remota e depois atualiza cada foto filtrando somente seu `id`. Não verifica novamente se o operador já a moveu ou se o relatório mudou de etapa.
2. A classificação é enfileirada a cada foto concluída, com deduplicação de 20 segundos. O primeiro job lê uma lista fixa das fotos prontas. Fotos que terminam depois dessa leitura podem ter o próximo envio descartado, sem execução final garantida.
3. Sugestões pendentes podem entrar no documento sem confirmação. Mover uma foto manualmente não limpa consistentemente `ai_suggested` nem registra a decisão.

**Reprodução da sobrescrita:** durante uma chamada simulada de IA, o operador moveu a foto para `manual` e avançou o relatório para `editing`. Ao retornar, o código real gravou `slot_id=cover` e `ai_suggested=true`.

A interface também anuncia “IA analisando” por um temporizador de 45 segundos após qualquer upload, inclusive com IA desligada. O polling pode parar depois de 60 segundos, embora uma classificação sequencial tenha timeout de até 20 segundos por foto. O histórico não apresenta toda a informação de sucesso/erro já disponível na auditoria.

**Correção proposta:** atualizações condicionais que preservem decisões humanas; vincular classificação à etapa/versão do relatório; garantir processamento de todas as fotos elegíveis; persistir estado real da análise e permitir retentativa. Confirmar ou mover deve registrar a decisão do operador. Manter fotos opcionais conforme a política já adotada, mas resolver ou excluir do documento sugestões ainda não aceitas.

Evidências: [gravação da sugestão](C:/Apps/Naabsa_Survey/apps/worker/src/jobs/classifyPhotos.ts:121), [agendamento](C:/Apps/Naabsa_Survey/apps/worker/src/index.ts:98), [movimentação](C:/Apps/Naabsa_Survey/apps/web/lib/actions/photos.ts:115), [entrada no documento](C:/Apps/Naabsa_Survey/apps/worker/src/jobs/generatePdf.ts:224), [temporizadores da interface](C:/Apps/Naabsa_Survey/apps/web/components/photos/PhotosClient.tsx:120).

### A06 — Aprovação pode gerar PDF sem a última edição

**Prioridade alta.** O editor dispara o salvamento no Collabora e aguarda uma mensagem de resposta. Após oito segundos sem resposta, chama `finish(true)` e permite continuar. O servidor aprova o relatório e converte o arquivo que estiver no Storage.

**Consequência:** em uma conexão lenta ou com falha de salvamento, o texto visível no editor pode não ser o texto do PDF aprovado.

**Correção proposta:** timeout deve produzir uma falha recuperável. A aprovação precisa confirmar a versão persistida do documento antes de congelá-lo. Validar o caminho no servidor também, para que o controle não dependa somente do botão da interface.

Evidências: [timeout tratado como sucesso](C:/Apps/Naabsa_Survey/apps/web/components/editor/CollaboraEditor.tsx:130), [aprovação](C:/Apps/Naabsa_Survey/apps/web/lib/actions/editor.ts:62).

### A07 — Reexecutar montagem pode sobrescrever um documento editado

**Prioridade alta; reproduzido.** O job `build_working_docx` sempre monta um documento a partir dos dados e grava no mesmo caminho com `upsert:true`. Não verifica se já existe um documento editado nem se o relatório já foi aprovado. A action de retry aceita relatórios em edição e enfileira sem deduplicação.

**Cenário:** duas retentativas, um job atrasado ou falha de banco depois de um upload bem-sucedido podem fazer outra execução substituir o documento já aberto pelo operador.

**Reprodução:** o job real, transpilado em memória com banco/Storage simulados, substituiu tanto um documento manual em `editing` quanto um documento em `approved` por bytes reconstruídos a partir dos dados.

**Correção proposta:** tornar a montagem inicial idempotente — repetir a operação não deve alterar um resultado válido. Usar uma identificação da geração, escrita condicional e proteção contra jobs de ciclos anteriores. Reconstruções intencionais precisam de um fluxo próprio com preservação da versão anterior.

Evidências: [job de montagem](C:/Apps/Naabsa_Survey/apps/worker/src/jobs/buildWorkingDocx.ts:26), [retentativa](C:/Apps/Naabsa_Survey/apps/web/lib/actions/editor.ts:291).

### A08 — Falha antes de criar o job pode deixar editor ou PDF sem recuperação

**Prioridade alta.** A aprovação muda o relatório para `approved` antes de enfileirar o PDF. Se o enqueue falha, grava `pdf_enqueue_failed`, mas o acompanhamento só considera `pdf_generation_failed`. O relatório pode ficar aprovado sem job e sem botão funcional para recuperá-lo.

Há uma falha semelhante na abertura do editor: o erro ao enfileirar a montagem é ignorado. Sem job, não aparece o evento de falha esperado pela interface; “Tentar de novo” pode apenas repetir a consulta por um arquivo que nunca começou a ser montado.

**Correção proposta:** distinguir “aguardando”, “enfileirado”, “executando”, “falhou ao enfileirar”, “falhou ao executar” e “concluído”. Sincronizar a interface com o estado persistido e oferecer retry seguro também para falhas anteriores à criação do job. Não reverter a aprovação automaticamente sem definir a regra de preservação do documento.

Evidências: [aprovação e enqueue](C:/Apps/Naabsa_Survey/apps/web/lib/actions/editor.ts:96), [status do PDF](C:/Apps/Naabsa_Survey/apps/web/lib/actions/editor.ts:242), [abertura do editor](C:/Apps/Naabsa_Survey/apps/web/app/(app)/reports/[id]/edit/page.tsx:60), [retry na interface](C:/Apps/Naabsa_Survey/apps/web/components/editor/PreviewPanel.tsx:285).

### A09 — Desativar usuário não bloqueia todas as formas de acesso

**Prioridade alta.** As actions de administração alteram `profiles.status`, mas não revogam sessões. As funções de autorização `current_has_role()` e `current_is_admin()` verificam papel sem exigir `status='active'`. A migração de identidade não atualiza essas funções. O WOPI valida token e relatório, sem conferir novamente se o usuário continua ativo.

**Consequência:** um token anterior à desativação pode continuar acessando dados; um token WOPI pode permanecer utilizável até expirar. Isso é diferente do bloqueio visual das páginas pelo middleware.

**Correção proposta:** aplicar a regra de usuário ativo no banco, nas APIs e no WOPI, além de revogar sessões e manter a lista de acesso consistente. Testar explicitamente um usuário que já estava conectado antes de ser desativado.

Evidências: [alteração de acesso](C:/Apps/Naabsa_Survey/apps/web/lib/actions/users.ts:203), [exclusão lógica](C:/Apps/Naabsa_Survey/apps/web/lib/actions/users.ts:242), [autorização no banco](C:/Apps/Naabsa_Survey/packages/db/migrations/0002_rls.sql:6), [identidade](C:/Apps/Naabsa_Survey/packages/db/migrations/0008_identity.sql:4), [autorização WOPI](C:/Apps/Naabsa_Survey/apps/web/lib/wopi/host.ts:33).

### A10 — O problema de texto está nos dados da migração

**Prioridade alta para a correção dos dados.** Foram examinados 245 arquivos textuais versionados, excluindo o material de design. Nenhum falhou na decodificação UTF-8 estrita. Foram encontrados 199 padrões suspeitos de texto corrompido em `0007_seed_real_specs.sql`, concentrados nos JSONs de Draft Survey e MSC.

Comparação direta do JSON da migração com as fixtures:

| Campo | Migração | Fixture de origem |
|---|---|---|
| Seção de `port`, Draft Survey | `ServiÃ§o` | `Serviço` |
| Seção de `vessel_name`, MSC | `IdentificaÃ§Ã£o` | `Identificação` |

**Consequência:** se essa migração forneceu o spec ativo, a interface recebe o texto já errado do banco. Alterar apenas o charset HTTP não conserta os caracteres gravados.

**Correção proposta:** gerar os dados a partir das fixtures corretas e criar uma nova versão de spec por uma migração corretiva. `report_specs` é imutável; editar somente a migração antiga não corrige bancos onde ela já foi aplicada. Inspecionar quais versões estão ativas e quais relatórios apontam para versões corrompidas. Para relatórios existentes, definir uma correção auditável sem alterar silenciosamente documentos já aprovados. Não executar uma substituição global indiscriminada de caracteres.

Evidências: [JSON Draft Survey](C:/Apps/Naabsa_Survey/packages/db/migrations/0007_seed_real_specs.sql:18), [JSON MSC](C:/Apps/Naabsa_Survey/packages/db/migrations/0007_seed_real_specs.sql:49), [leitura UTF-8 das migrações](C:/Apps/Naabsa_Survey/packages/db/src/migrate.ts:58), [versionamento de specs](C:/Apps/Naabsa_Survey/packages/db/src/seed-real-spec.ts:46).

### A11 — O limite percentual não corresponde à mensagem de validação

**Prioridade alta para confiabilidade dos dados.** A regra de `fin_fig_diff_pct` diz que deve avisar acima de 0,5%, mas usa limites `-0.05` e `0.05`. O campo armazena fração, e o builder multiplica por 100: os limites implementados correspondem a 5%.

**Reprodução local:** a função real de validação foi transpilada em memória, com coleta de campos simulada e a fixture real do spec. Os valores 0,51%, 1%, 4,9% e 5% não geraram aviso; 5,1% gerou.

**Correção proposta:** alinhar regra e mensagem ao limite de negócio pretendido. Se o limite de 0,5% escrito no spec estiver correto, a fração deve ser `0.005`. Aplicar a correção também à versão persistida do spec e revisar unidades semelhantes.

Evidências: [unidade armazenada](C:/Apps/Naabsa_Survey/tests/fixtures/specs/draft_survey.v1.json:14), [regra](C:/Apps/Naabsa_Survey/tests/fixtures/specs/draft_survey.v1.json:153), [formatação percentual](C:/Apps/Naabsa_Survey/apps/worker/src/lib/buildDocx.ts:65).

### A12 — A tela de fotos tem recuperação incompleta

**Prioridade média.** Foram encontrados estes caminhos:

- Falha de consulta ao banco pode virar galeria vazia, porque o código ignora `error` e trata `data=null` como `[]`.
- Erro ao assinar uma URL pode virar imagem sem URL; a API ainda responde sucesso.
- URLs expiram em dez minutos, mas a tela não garante renovação ao abrir o recorte depois desse período.
- Fotos com erro não têm uma ação completa para repetir o processamento a partir do original já enviado.
- Faltam controles conectados para remover/desalocar e reorganizar fotos; existe uma action de reordenação sem consumidor na interface.

**Correção proposta:** preservar os dados já carregados durante falhas temporárias, mostrar o erro real, permitir nova tentativa, renovar URLs quando necessário e completar os controles de gerenciamento das fotos.

**Decisão que deve ser preservada:** o avanço sem fotos obrigatórias foi flexibilizado deliberadamente no histórico (`a64793b`). Não deve ser revertido só porque testes ou documentos antigos ainda esperam bloqueio.

Evidências: [consulta e assinatura](C:/Apps/Naabsa_Survey/apps/web/lib/photos.ts:44), [polling](C:/Apps/Naabsa_Survey/apps/web/components/photos/PhotosClient.tsx:55), [foto com erro](C:/Apps/Naabsa_Survey/apps/web/components/photos/Gallery.tsx:75), [reordenação sem integração](C:/Apps/Naabsa_Survey/apps/web/lib/actions/photos.ts:137).

### A13 — Os testes e o status das implementações dão uma garantia incompleta

**Prioridade média, necessária para encerrar as correções.** Os testes unitários passam, mas deixam de fora pontos centrais:

- `pnpm test:golden` falha ao importar `PrintDocument`, componente removido na mudança para DOCX/Collabora. Não executa nenhum teste.
- O pacote de banco procura testes em `src/**/*.test.ts`, mas o teste RLS está em `tests/rls.test.ts`. O comando termina com sucesso graças a `--passWithNoTests`. Mesmo a instrução documentada com `RUN_DB_TESTS=1` não resolve essa descoberta.
- O E2E principal de fotos cria fotos já processadas; isso não valida upload → Storage → fila → worker. Outro cenário de upload para no recebimento de `202`, sem esperar a transformação.
- O E2E de fluxo completo não insere texto real no Collabora nem verifica esse texto no PDF. Iframe visível e caminho de PDF não provam preservação da edição.
- Os testes atuais de IA exercitam principalmente prompts, parsers e transporte simulado, sem provar que o aviso aparece na tela nem que decisões humanas são preservadas.
- Não foi encontrado workflow de CI versionado no inventário realizado.

**Correção proposta:** atualizar testes para a arquitetura atual, corrigir a descoberta de testes do banco e separar explicitamente testes locais de testes que usam infraestrutura. Executar integrações em banco/Storage de teste isolados, pois os E2E atuais criam e removem dados no Supabase configurado.

Evidências: [golden obsoleto](C:/Apps/Naabsa_Survey/tests/golden/golden-pipeline.test.ts:20), [config de testes DB](C:/Apps/Naabsa_Survey/packages/db/vitest.config.ts:6), [teste RLS existente](C:/Apps/Naabsa_Survey/packages/db/tests/rls.test.ts:1), [E2E de fotos](C:/Apps/Naabsa_Survey/tests/e2e/photos.spec.ts:54), [E2E do editor](C:/Apps/Naabsa_Survey/tests/e2e/full-flow.spec.ts:182).

## 4. Estado das implementações

“Existe código” e “está validado de ponta a ponta” precisam ser estados distintos. A tabela abaixo não substitui os critérios originais de aceite.

| Implementação | O que existe | Avaliação após a auditoria |
|---|---|---|
| 001 — Fundação | Monorepo, scripts, Dockerfiles e Compose. | Base presente; ambiente/readiness e documentação ainda precisam refletir os serviços atuais. |
| 002 — Banco/RLS | Schema, migrations e regras de acesso. | Precisa corrigir descoberta dos testes, textos persistidos e revogação de usuários. |
| 003 — Extração | Motor determinístico e testes com planilha real Draft Survey. | Testes executados passam; regra percentual precisa ser corrigida/confirmada. |
| 004 — Documentos/PDF | Builders DOCX, conversão por LibreOffice e testes unitários. | Golden atual quebrado; fidelidade do PDF final não comprovada nesta execução. |
| 005 — Login/dashboard/criação | Fluxos e ações implementados. | Autorização de usuários inativos incompleta; E2E atual não executado nesta auditoria. |
| 006 — Revisão | Campos, validações e edição. | Avisos persistidos de IA não chegam à tela. |
| 007 — Fotos | Upload, processamento, galeria, slots e recorte. | Falhas de erro/recuperação e suporte HEIC não validado; cobertura integrada insuficiente. |
| 008 — TipTap | Código e testes legados ainda presentes. | Parte do histórico foi substituída pelo Collabora; passar esses testes não valida o editor atual. |
| 009 — Demais relatórios/admin specs | Draft Survey e MSC têm specs e builders nativos. Admin Specs é `Placeholder`. | Parcial. Bunker, On/Off-Hire e ROB não têm cadeia equivalente completa identificada. “0/12” também não representa o MSC já presente. |
| 010 — IA/retenção/hardening | Jobs, wrapper IA e controles implementados. | Aceites de IA precisam ser reabertos. Retenção tem testes unitários; operação real não foi executada. |
| 011 — Collabora/WOPI | Host WOPI e configuração de infraestrutura. | Não há validação da stack atual nesta auditoria; autorização precisa ser corrigida. |
| 012 — Editor/aprovação | Fluxo implementado; índice informa 9/10. | Problemas de preservação das edições; E2E de conteúdo pendente. |
| 013 — Identidade | Administração de usuários, migration 0008 e bloqueio parcial. | Parcial. SSO Entra, callback/JIT e `/conta` não foram identificados; revogação incompleta. |
| 014 — Recuperação | Auditoria e retentativas implementadas. | Falhas de enqueue não cobertas e retry de montagem inseguro; aceite integrado pendente. |

O README ainda descreve o projeto como fundação concluída e cita uma arquitetura de geração anterior. O guia EasyPanel apresenta dois serviços e precisa incorporar o Collabora e a configuração WOPI do fluxo atual. O índice de implementações deve ser reconciliado com o código, sem marcar como validado o que ainda não foi exercitado.

Fontes: [índice de implementações](C:/Apps/Naabsa_Survey/implementation/README.md:13), [README](C:/Apps/Naabsa_Survey/README.md:13), [guia EasyPanel](C:/Apps/Naabsa_Survey/docs/DEPLOY_EASYPANEL.md:9), [Admin Specs](C:/Apps/Naabsa_Survey/apps/web/app/(app)/admin/specs/page.tsx:4).

## 5. Plano de correção em 15 tarefas

Todas as tarefas abaixo estão **propostas, ainda não executadas**. O esforço é relativo: **P** = alteração localizada; **M** = vários arquivos ou uma integração; **G** = fluxo completo, dados ou infraestrutura. Não representa prazo contratado.

| Ordem | Tarefa | Prioridade | Esforço | Depende de |
|---|---|---|---|---|
| C01 | Unificar configuração e mostrar saúde real dos serviços | Alta | M | — |
| C02 | Confirmar salvamento antes da aprovação | Alta | M | C01 para aceite real |
| C03 | Impedir sobrescrita do DOCX em jobs repetidos | Alta | M | — |
| C04 | Recuperar falhas de enqueue de PDF e editor | Alta | M | C03 |
| C05 | Revogar acesso de usuários desativados | Alta | M | Ambiente de teste isolado |
| C06 | Destravar upload e tratar erros corretamente | Alta | P | — |
| C07 | Garantir conversão HEIC no worker final | Alta | M | C01 |
| C08 | Exibir os resultados e o estado real da IA na revisão | Alta | M | C01 |
| C09 | Corrigir classificação por lote e preservar escolhas manuais | Alta | G | C01; C03 para integração com documento |
| C10 | Corrigir textos por nova versão de spec | Alta | M | Inventário das versões no banco alvo |
| C11 | Corrigir a regra percentual e conferir unidades | Alta | P | Regra de negócio definida; coordenar com C10 |
| C12 | Completar recuperação e gerenciamento de fotos | Média | M | C06 e C09 |
| C13 | Atualizar testes e automatizar verificações | Alta para entrega | G | Começar antes das correções; concluir com C02–C12 |
| C14 | Reconciliar funcionalidades disponíveis e documentação | Média | M | Decisões atuais de produto e C01 |
| C15 | Executar aceite completo em ambiente representativo | Alta para entrega | G | C01–C14 |

### C01 — Configuração e diagnóstico

**Fazer:** definir como web/worker recebem as variáveis em desenvolvimento e no servidor; eliminar ambiguidade de precedência; conferir que ambos apontam para banco/Storage corretos. Validar flag, provedor, chave presente e configuração de Collabora/WOPI. Diferenciar processo vivo de dependências prontas e registrar atividade do worker.

**Pronto quando:** é possível distinguir IA desligada, IA com erro, worker parado e processamento normal. Uma chamada controlada em homologação deixa evento e resultado verificáveis; com IA desligada o fluxo manual continua funcionando.

### C02 — Salvamento confirmado

**Fazer:** remover o sucesso automático no timeout e associar a aprovação à versão efetivamente persistida. Mostrar falha e permitir repetir o salvamento.

**Pronto quando:** um atraso ou erro de save impede aprovação; uma frase digitada no Collabora aparece após recarregar e no PDF final. Cobrir também alteração imediatamente seguida de clique em Aprovar.

### C03 — Montagem sem perda de trabalho

**Fazer:** identificar a geração do documento no job; impedir que job repetido/antigo grave sobre arquivo editado ou aprovado; tratar upload bem-sucedido seguido de falha de banco.

**Pronto quando:** executar o mesmo job duas vezes mantém os bytes do documento manual; um job antigo não altera um relatório aprovado. Reconstrução intencional mantém uma versão recuperável do documento anterior.

### C04 — Retentativa funcional do editor e do PDF

**Fazer:** persistir falhas de enqueue, sincronizar status na UI e oferecer retry para relatório aprovado sem job. Aplicar a mesma distinção à montagem do editor, usando a proteção de C03.

**Pronto quando:** interromper a conexão com a fila no momento do envio produz erro visível; depois de restaurá-la, um botão recupera o fluxo sem SQL manual, sem duplicar PDF e sem reconstruir edições válidas.

### C05 — Desativação efetiva de usuários

**Fazer:** exigir usuário ativo nas regras do banco/API/WOPI, revogar sessões e conferir que não é possível obter novos tokens após a desativação. Preservar acesso administrativo válido durante a migração.

**Pronto quando:** usuário conectado antes da desativação perde leitura/escrita no app, Data API e WOPI. Testar operador e administrador inativos, mantendo um administrador ativo como controle.

### C06 — Upload com erro compreensível

**Fazer:** adicionar tratamento de falhas e liberação garantida do estado; controlar timeout; diferenciar rejeição total de sucesso parcial. Manter a seleção de arquivos que precisam de nova tentativa.

**Pronto quando:** offline, timeout, 401, 413, 502 HTML e arquivo inválido nunca deixam “Enviando” preso. Envio bem-sucedido continua até a foto aparecer processada na galeria.

### C07 — Formatos de foto reais

**Fazer:** escolher e empacotar uma conversão HEIC compatível; verificar dependências nativas na imagem final; alinhar formatos anunciados com formatos suportados. Incluir fixtures reais de JPEG, PNG e HEIC, com orientação EXIF.

**Pronto quando:** o container usado no deploy gera JPEG e thumbnail corretos de uma foto HEIC real, preserva orientação, limita dimensões e conclui com `status=done`.

### C08 — IA visível e rastreável

**Fazer:** carregar `extraction_issues`, combinar origens sem duplicar avisos, acompanhar o job e relacionar sugestões à versão analisada. Mostrar erro recuperável e resultado vazio como estados distintos.

**Pronto quando:** aviso `origin=ai` aparece tanto quando já existe no banco quanto quando chega depois que a tela foi aberta. Editar outro campo não o apaga indevidamente; editar o dado analisado invalida ou atualiza a sugestão corretamente.

### C09 — IA de fotos subordinada à decisão humana

**Fazer:** gravar sugestões de forma condicional; garantir classificação final de todas as fotos elegíveis; representar estado por foto/lote; oferecer retry. Registrar confirmação e movimentação manual; resolver sugestões pendentes antes de incorporá-las ao documento.

**Pronto quando:** mover uma foto enquanto a IA responde preserva a escolha humana; avançar de etapa impede atualização tardia; fotos concluídas na mesma janela de 20 segundos não ficam esquecidas; lote acima de 60 segundos continua sendo acompanhado. IA desligada não mostra “analisando”.

### C10 — Textos corretos no banco e nos novos relatórios

**Fazer:** comparar specs ativos com as fontes corretas, preparar nova versão sem texto corrompido e revisar a associação dos relatórios existentes. Acrescentar verificação de texto ao processo que gera seeds/specs. Produzir uma prévia das linhas afetadas antes de aplicar a migração.

**Pronto quando:** títulos, seções, unidades e mensagens exibem `Serviço`, `Identificação`, `Início`, `Diferença` e `°C` corretamente. A migração pode ser repetida sem duplicar versões; relatórios antigos recebem tratamento explícito e auditável.

### C11 — Percentuais coerentes

**Fazer:** confirmar o limite pretendido na regra documentada, corrigir a fração correspondente e revisar regras com percentuais/unidades semelhantes. Publicar o ajuste na mesma estratégia de versionamento de C10.

**Pronto quando:** se o limite for 0,5%, valores de 0,49%, 0,5% e 0,51%, positivos e negativos, têm o comportamento esperado e documentado. O PDF e a revisão apresentam a mesma unidade.

### C12 — Recuperar, substituir e organizar fotos

**Fazer:** tratar erro de listagem sem apagar visualmente as fotos existentes; renovar URLs expiradas; permitir repetir processamento, desalocar, remover e reordenar. Definir regras para proteger fotos já incorporadas a documentos aprovados e para não apagar arquivos ainda referenciados.

**Pronto quando:** uma falha transitória é recuperável sem novo upload; um slot cheio permite substituição; a ordem persiste após reload e no documento; abrir recorte depois de dez minutos continua funcionando.

### C13 — Testes que cobrem a arquitetura atual

**Fazer:** corrigir a descoberta dos testes RLS; separar seu comando e ambiente dos testes locais; substituir o golden baseado no componente removido por validação do DOCX/PDF atual. Criar regressões para as falhas reproduzidas e integrar lint, tipos e testes à CI. Manter credenciais e dados reais fora das fixtures.

**Pronto quando:** os comandos descobrem o número esperado de testes, o golden realmente executa, e uma falha proposital de save, upload ou autorização faz o teste correspondente falhar. A CI executa verificações locais e tem um caminho explícito para as integrações que exigem serviços.

### C14 — Funcionalidades e documentação honestas

**Fazer:** atualizar README, operação, EasyPanel e índice de implementações para DOCX/Collabora. Declarar quais tipos têm planilha, spec, builder e aceite completos. Identificar telas placeholder e recursos incompletos na navegação. Separar bugs deste plano das entregas ainda pendentes de 009/013.

**Pronto quando:** ninguém interpreta Admin Specs, SSO ou tipos sem suporte completo como funcionalidades prontas. Para cada pendência de 009/013 existe escopo, insumo necessário e critério de aceite; “implementado”, “testado” e “validado no ambiente” aparecem separadamente. Não marcar as implementações como concluídas só pela existência do código.

### C15 — Aceite completo no ambiente de uso

**Fazer:** executar o roteiro da seção 6 em ambiente isolado com a mesma imagem e configuração estrutural do servidor. Depois das correções, realizar build, conversão real por LibreOffice, integração Collabora/WOPI e inspeção visual dos documentos. Registrar versão do código, resultado e evidência de cada cenário.

**Pronto quando:** o percurso inteiro funciona com IA ligada e desligada, as falhas simuladas são recuperáveis, e a edição manual está comprovadamente no PDF. Qualquer cenário não executado fica explicitamente pendente, com a razão.

## 6. Roteiro de aceite fácil de acompanhar

| Teste | Ação | O que deve acontecer |
|---|---|---|
| Fluxo manual | Criar relatório de planilha real com IA desligada. | Revisar, enviar fotos, editar, aprovar e baixar PDF sem depender de IA. |
| IA de dados | Abrir revisão antes de a IA terminar. | Estado muda para concluído e os avisos aparecem sem perder edições. |
| Lote de fotos | Enviar JPG, PNG e HEIC com durações diferentes. | Todas terminam em sucesso ou erro claro; nenhum arquivo desaparece silenciosamente. |
| Erro de upload | Cortar rede ou simular 502 durante envio. | Botão destrava, falha fica clara e arquivos pendentes podem ser reenviados. |
| Disputa com IA | Mover foto enquanto classificação está em andamento. | Escolha manual permanece após a resposta. |
| Foto antiga na tela | Deixar a tela aberta por mais de dez minutos e abrir recorte. | Imagem continua acessível por URL renovada. |
| Salvamento | Digitar um marcador, salvar, recarregar e aprovar. | O mesmo marcador está no documento reaberto e no PDF. |
| Save com falha | Atrasar ou interromper confirmação do Collabora. | Aprovação é interrompida com uma opção de recuperação. |
| Job duplicado | Repetir montagem depois de editar o documento. | Nenhuma edição é substituída. |
| Fila indisponível | Falhar enqueue na aprovação e restaurar a fila. | Um retry explícito produz PDF sem intervenção no banco. |
| Textos/unidades | Abrir specs corrigidos e conferir os limites percentuais. | Acentos corretos; avisos e valores concordam com a regra de negócio. |
| Usuário desativado | Desativar uma conta já conectada. | Sessões e tokens anteriores deixam de autorizar dados e documentos. |
| Tipos disponíveis | Executar cada combinação anunciada de tipo/variante. | Há um documento correto e validado para cada combinação anunciada. |

## 7. Comandos executados e resultados

| Verificação | Resultado | Limite da evidência |
|---|---|---|
| `pnpm lint` | Exit 0. | Estilo/regras estáticas não validam integrações. |
| `pnpm typecheck` | Exit 0 nos quatro pacotes. | Tipos corretos não comprovam execução dos fluxos. |
| `pnpm test` | Exit 0; **242 testes passaram**: core 129, web 65, worker 48. | Banco executou zero testes; transporte/serviços são simulados em parte da suíte. |
| `pnpm test:golden` | Exit 1; import de `PrintDocument` não resolvido; zero testes executados. | Não há resultado válido de comparação visual. |
| Varredura UTF-8 com Node | Exit 0; 245 arquivos textuais; zero arquivos inválidos em UTF-8; 199 padrões de corrupção na migração 0007. | Não consultou o conteúdo efetivo do banco publicado. |
| Comparação JSON SQL × fixtures | Textos divergentes comprovados em Draft Survey e MSC. | Mostra a origem possível dos dados corrompidos, não qual versão está ativa em produção. |
| Reprodução do upload | Função real manteve `uploading=true` em falha de rede e JSON inválido. | Dependências simuladas; não enviou fotos reais. |
| Reprodução da corrida de IA | Código real sobrescreveu alocação manual após chamada atrasada; exit 0. | Banco/LLM simulados. |
| Reprodução de montagem repetida | Código real substituiu documentos simulados em `editing` e `approved`; exit 0. | Storage/banco simulados. |
| Reprodução da regra percentual | 0,51%–5% sem warning; 5,1% com warning; exit 0. | Validação real com coleta de campos simulada e fixture local. |
| Inspeção de Sharp | HEVC não disponível na tentativa local em memória. | Não foi teste de decodificação de HEIC real nem execução da imagem Docker. |
| Inventário Git | HEAD `107f114`; `supabase/` já estava não versionado. | Código de produção pode ter outra revisão. |

Os testes unitários foram executados uma vez; mensagens de erro esperadas nos testes de recuperação não representam falha da suíte. Não foram executados formatadores ou reparos automáticos.

## 8. Limitações e próxima execução

Não foram executados E2E que criam/removem dados no Supabase, migrations, chamadas pagas de IA, alteração de usuários, build de produção, containers ou deploy. Esses passos precisam do ambiente alvo corretamente identificado e de dados de teste isolados. Os arquivos de ambiente foram examinados sem registrar os valores das credenciais neste relatório.

A porta local 3000 estava ocupada, mas a sondagem não estabeleceu que o serviço fosse este workspace: `/api/health` atingiu timeout e `/login` respondeu 404. Esses resultados **não foram usados como defeitos comprovados do Naabsa**. Não há validação da aplicação publicada ou de uma sessão autenticada nesta auditoria.

Na próxima execução de correções, começar por **C01**, enquanto **C02/C03/C05** protegem trabalho e acesso e **C06** resolve o travamento reproduzido do upload. **C10/C11** podem ser preparados juntos, gerando uma nova versão corrigida dos specs. A conclusão geral depende do aceite **C15**, não apenas de os testes unitários continuarem verdes.
