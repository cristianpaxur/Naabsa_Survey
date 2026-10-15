# Correções do feedback MSC de 14/10/2026

Pedido: analisar e resolver os dois vídeos enviados pelo cliente, sem o fluxo Superpowers.

## Evidência

O relatório MSC CAROLINA `77e63404-10f4-4c70-bd1e-f0a4e52bcd78` usa o spec MSC v4, com 43 campos e apenas Vessel, Engine room, Survey attendance e ECR. A planilha original contém os valores de quantidades com resultados de fórmulas armazenados; os 38 mapeamentos adicionais presentes na fixture atual não fazem parte desse spec. A montagem resolve somente campos declarados no spec, produzindo os traços em vez dos números.

O Word existente foi baixado antes de qualquer intervenção. Seus 215 parágrafos de texto, desconsiderado o sumário, correspondem aos da remontagem com o código e os dados publicados; não foram encontrados acréscimos de texto manual. O objeto atual está na revisão 7. A organização das fotos no banco difere da montagem antiga do Word, preservada ao voltar para fotos.

## Critérios

- Robert Masse aparece como contato padrão; um contato explícito mantém precedência.
- Capa e Vessel são escolhas separadas. Hull fica disponível junto com os demais grupos.
- Uma foto alocada sai da galeria e reaparece ao ser desalocada; ordenação e recorte continuam disponíveis no grupo.
- Muitas fotos não alargam a tela nem escondem títulos e controles.
- Novos campos de quantidades são acrescentados sem substituir mapeamentos personalizados, valores existentes ou overrides. Campos ausentes de extrações antigas são lidos da planilha original durante a montagem.
- O Time log não imprime bordas de grade.
- Voltar das fotos atualiza as seções fotográficas e o sumário do Word, preserva textos e a versão anterior e recusa publicação concorrente.
- A atualização das fotos preserva o estilo e a altura já ajustada da capa. Se os contatos transbordarem, reduz somente a foto proporcionalmente e mede novamente o sumário. Não publica um Word atualizado com os contatos do comando fora da primeira página.
- Publicação e ativação somente depois de aplicar a alteração aditiva de schema; conferir o CAROLINA real no Collabora.

## Alcance operacional

As migrations 0023 e 0024 copiam specs incompletos e atualizam vínculos de relatórios abertos. Relatórios aprovados, gerados e excluídos mantêm os vínculos. Nenhuma dessas migrations reconstrói documentos nem altera alocações. Os triggers já existentes invalidam revisões de IA após a troca de spec, como na ativação ECR anterior.

A 0025 acrescenta uma revisão de alterações das fotos, usada na publicação otimista. Deve ser aplicada antes de publicar web/worker, que passam a consultar essa coluna. Não executar o runner completo no banco legado sem histórico reconciliado; aplicar somente o lote preparado com cópia, transação e conferência dos campos protegidos.

A correção do Word já existente exige uma nova versão: a atualização de fotos preserva os demais textos, inclusive os campos antigos em branco. Para a intervenção pontual no CAROLINA, reconferir a revisão/caminho, preservar o original, confirmar ausência de sessão WOPI ativa e comparar os dados antes da publicação. Não apagar o Word anterior nem mover fotos por inferência.

## Regressões encontradas no ensaio real de 15/10

O novo relatório de teste `5db77f1c-c00b-44df-8268-22ec328fd5c3` extraiu os 81 campos do modelo v8. A linha adicional da planilha CAROLINA desloca o bloco de Sludge: endereços fixos passam a ler valores de outra grandeza. As fontes de registros do comandante e do surveyor devem usar rótulos em intervalos separados. A frequência do purificador tem duas grafias conhecidas, com e sem ponto em `freq.`; ambas são explícitas no spec. Rótulos duplicados continuam sendo recusados.

A migration 0026 cria uma nova spec ativa somente para novos relatórios. Preserva campos com células/abas/âncoras personalizadas e não modifica nenhum relatório existente nem seus valores, documentos ou alocações. Publicar web/worker com suporte a `row_anchor.aliases` antes de aplicar a migration. Não executar o runner completo no banco legado.

O Collabora reescreve os IDs de estilos e numeração ao salvar um Word. Importar os parágrafos fotográficos do modelo sem adaptar suas propriedades deixa a seção sem a numeração esperada e impede a medição do sumário. A sincronização deve usar as propriedades de parágrafo do documento de destino, mantendo sua lista de seções e seus estilos, inclusive para entradas do sumário e Hull acrescentado depois.
