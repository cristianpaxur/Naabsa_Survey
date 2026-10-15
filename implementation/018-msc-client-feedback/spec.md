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
- Publicação e ativação somente depois de aplicar a alteração aditiva de schema; conferir o CAROLINA real no Collabora.

## Alcance operacional

As migrations 0023 e 0024 copiam specs incompletos e atualizam vínculos de relatórios abertos. Relatórios aprovados, gerados e excluídos mantêm os vínculos. Nenhuma dessas migrations reconstrói documentos nem altera alocações. Os triggers já existentes invalidam revisões de IA após a troca de spec, como na ativação ECR anterior.

A 0025 acrescenta uma revisão de alterações das fotos, usada na publicação otimista. Deve ser aplicada antes de publicar web/worker, que passam a consultar essa coluna. Não executar o runner completo no banco legado sem histórico reconciliado; aplicar somente o lote preparado com cópia, transação e conferência dos campos protegidos.

A correção do Word já existente exige uma nova versão: a atualização de fotos preserva os demais textos, inclusive os campos antigos em branco. Para a intervenção pontual no CAROLINA, reconferir a revisão/caminho, preservar o original, confirmar ausência de sessão WOPI ativa e comparar os dados antes da publicação. Não apagar o Word anterior nem mover fotos por inferência.
