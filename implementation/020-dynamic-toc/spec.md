# 020 — Índice com páginas atualizáveis

Ao editar o relatório, uma seção pode mudar de página enquanto o índice conserva
os números medidos na montagem inicial. Draft Survey e MSC agora usam campos
PAGEREF nos números do índice, preservando o layout e os valores iniciais.

O fluxo do editor atualiza os campos antes de salvar para Preview, aprovação ou
retorno às fotos. Não há atualização a cada tecla. O PDF continua usando a revisão
salva e aprovada, sem reconstruir o corpo do documento.

Documentos antigos em edição recebem uma revisão com os campos ao abrir uma nova
sessão sem lock ativo. A mudança conserva o original, texto e demais partes do
Word. Revisão, caminho, status e lock são comparados antes de publicar; uma edição
concorrente impede a troca. Versões aprovadas e sessões ativas ficam preservadas.

## Aceite

- Referências ligadas aos bookmarks corretos, inclusive fases e fotografias.
- Atualização dos campos enviada antes do pedido de salvamento confirmado.
- Migração de documentos antigos sem sobrescrever edições ou versões aprovadas.
- Verificação local de regressão, lint e tipos; homologação online após publicação.
