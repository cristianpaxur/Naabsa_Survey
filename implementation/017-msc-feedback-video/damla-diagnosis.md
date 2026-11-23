# DAMLA: origem dos purificadores em branco

Conferência somente leitura em 10/10/2026, no Supabase informado pelo usuário. Relatório `2f84ff01-9b86-4899-8500-81048ae312a5`, MSC DAMLA. O arquivo foi baixado do bucket `reports`, objeto `<report_id>/spreadsheet.xlsx`, sem alteração no armazenamento. SHA-256 do XLSX: `d9eb67df83220ae4a94358058974542685f0070e7292e70efc7ef43ba289aff5`.

## Causa comprovada

| Campo | Fonte no spec congelado | Valor nessa célula | Fonte real no DAMLA | Valor correto |
| --- | --- | --- | --- | --- |
| Viagem | Summary!B8 | 635S | Summary!B8 | 635S |
| Temperatura do purificador | Sludge!K29 | vazio | Sludge!K32 | 98 °C |
| Fluxo por purificador | Sludge!K30 | vazio | Sludge!K33 | 1 x 4,0 |
| Frequência de descarga | Sludge!K31 | vazio | Sludge!K34 | 60 min |

As versões 1 e 2 usam K29/K30/K31. O registro possui a viagem extraída e três purificadores nulos, sem overrides desses campos. Os rótulos estão em H32/H33/H34, iguais aos da SABRINA em H29/H30/H31. A ausência decorre do deslocamento do bloco de origem, não de falta de preenchimento nem de coerção numérica.

Summary!B18 e Time Log!F7/F16 contêm 30/09/2026 nessa planilha. Esse exemplar não demonstra qual fonte deve prevalecer quando as datas divergem; não alterar o significado da data por esta coincidência.

## Correção preparada

O contrato de campo aceita `row_anchor`, opcional, com `range` de uma coluna e até 100 linhas e `expect` como rótulo exato, descontados apenas espaços nas extremidades. A coluna do valor continua sendo a de `cell`. O MSC procura os três rótulos em H29:H40 e lê K na linha encontrada. Não há fallback para um valor de outra linha quando o rótulo falta ou está duplicado. Esses casos retornam dado nulo e erro de extração. Zero, fórmulas com resultado cacheado, formato numérico e precedência de overrides mantêm seus contratos.

Specs sem `row_anchor` continuam lendo suas células fixas. A migration **0022** cria e ativa uma cópia do modelo atual para novos relatórios, com auditoria, preservando os outros campos, personalizações e slots ECR. Não muda nenhum vínculo, dado, revisão de IA ou documento dos relatórios existentes. Aborta se encontrar mapeamento ou âncora personalizados incompatíveis. A segunda execução é idempotente.

Publicar o core/worker com suporte a `row_anchor` antes de ativar a 0022. No banco legado sem histórico do runner, preparar uma execução isolada com backup e guardas, após a ativação ECR; não executar o runner geral. A confirmação solicitada para ECR autoriza somente a **0021**, sem incluir esta mudança de modelo ou reprocessamento do DAMLA.

## Validação e ativação restante

O teste com três linhas inseridas reproduziu os três nulos antes da correção. Depois, a SABRINA nas duas posições passou. Dez casos adicionais verificam posições, fórmula/cache, precisão, zero, rótulo ausente/duplicado, fonte histórica e limites da busca. O teste PostgreSQL confirma cópia válida, preservação integral dos registros existentes/Word/ECR, auditoria e idempotência.

A extração local do **XLSX real** com uma cópia do spec congelado e somente as três âncoras recuperou `635S`, `98`, `1 x 4,0`, `60`. Comparada com a leitura antiga, mudou exatamente os três purificadores; todos os demais campos e tabelas ficaram iguais. Um ensaio local de montagem confirmou esses quatro valores no OOXML, sem publicar o documento. Esse ensaio de dados usa fotos/log vazios e não é um relatório completo para entrega.

Evidências locais privadas: `tmp/msc-production-activation-20261010/damla-source-inspection.json`, `damla-extraction-validation.json` e `verify-damla.mts`. Nenhum dado de produção foi alterado. Para corrigir o DAMLA existente, preservar registro, planilha, documentos e ajustes manuais, comparar os valores efetivos, preparar a atualização específica dos três campos com guarda de revisão e submetê-la para autorização. Não trocar silenciosamente o spec nem executar reupload/reset, que descartaria outros estados.
