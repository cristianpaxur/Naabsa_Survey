# Decisões — 017

## D-013 — Paginação original e comparação da saída real

A exigência mais recente de documento idêntico também prevalece sobre os `keepNext` adicionais da primeira implementação. A comparação da saída real mostrou que essas regras deslocavam Time log e Survey attendance para as páginas seguintes. Removê-las dos títulos e galerias, preservando os parágrafos originais. Manter a integridade das linhas, o cabeçalho repetido do log longo e os pares de fotos com proporções diferentes.

No teste com os mesmos dados e fotos da referência, o DOCX produzido pelo builder e convertido pelo Word apresentou **9/9 páginas com zero diferença de pixels a 144 DPI**, comparado ao original sem anotações de preenchimento. O ensaio é um exemplar de layout, separado dos dados operacionais. Em relatórios com outros dados/fotos, a paginação pode variar e o sumário continua medido em duas passagens.

Manter o contrato de reconstrução rastreável em `templates/msc.artifact.md`; o template entra no Docker do worker. Os estilos e cabeçalhos do Draft Survey continuam inalterados.

## D-012 — Referência exata substitui aproximação

Ruling: a última instrução do usuário torna o Word anexado autoridade exata de layout e substitui decisões anteriores de centralizar Contents, usar hierarquia 1–4 ou medidas próprias. Migrar MSC para preenchimento de uma cópia sanitizada do pacote real, preservando estilos, numeração, cabeçalhos, rodapés, margens e padrões de tabelas/desenhos. Repetir comparação estrutural e visual de todas as páginas após cada alteração. Dados variáveis e ausência de anotações editoriais são diferenças intencionais. Custo se errado: retrabalho local recuperável; original permanece intacto.

Ruling: Hull é opcional, mantendo a capacidade existente apenas com fotos. O modelo nominal contém somente Vessel, Engine Room, Survey attendance e ECR, como mostrado na nova imagem. Nenhuma mudança de mapeamento de células ou publicação é inferida dessa exigência visual.

- **Data:** 09/10/2026
- **Estado:** execução local autorizada pelo usuário com “pode seguir”, em 09/10/2026.

## D-001 — Word como exemplo de apresentação

Usar o arquivo MSC Report - revisado.docx indicado pelo usuário para dimensões, organização das fotos, hierarquia e alinhamentos. Não transcrever automaticamente suas anotações internas para o produto nem assumir novas alterações de conteúdo corporativo. O vídeo e o esclarecimento do usuário delimitam as correções.

A conversão local do exemplo deixa Vessel na página 5 e suas fotos na página 6; também há diferenças visuais de imagens flutuantes no LibreOffice. Usar o exemplo para estrutura, tamanho e conteúdo, corrigindo as quebras e verificando a renderização do relatório final no motor de destino.

## D-002 — Garantir Vessel sem duplicar o catálogo

O usuário esclareceu o comentário do sumário como ausência de Vessel. A análise encontrou `3.1 Vessel` no vídeo e no código. A execução deve comprovar tanto a entrada no sumário quanto o título visível com as fotos, investigando quebra/orfandade. Uma nova entrada duplicada não resolve a apresentação.

## D-003 — Limite de fotos em dois eixos

A largura única de 150 mm do builder atual gera fotos grandes e pode estourar a altura útil com retratos. A galeria passa a usar o padrão de até 80 × 60 mm e duas colunas do exemplo, preservando proporção e ordem. A capa recebe tratamento separado.

## D-004 — Cabeçalho MSC isolado

O helper institucional e as margens são compartilhados com Draft Survey. Introduzir opção/preset MSC, mantendo o padrão atual, e medir o resultado no motor de destino antes de fixar a geometria final.

## D-005 — Corrigir os dados na origem comprovada

Os mapeamentos Sludge K29/K30/K31 e Summary B8 estão no contrato local e preenchidos na fixture. Não há evidência suficiente para atribuir a ausência do DAMLA a um erro de célula. Comparar XLSX, spec congelado, extração, overrides e dados efetivos; a correção depende do ponto real da falha.

## D-006 — Preservar histórico e edições

Não reconstruir silenciosamente DOCX editado/aprovado. Specs antigas permanecem imutáveis. Se houver modelo histórico incompleto, preparar novo relatório com modelo atualizado ou uma intervenção específica posteriormente autorizada, mantendo o original recuperável.

## D-007 — Formato de data não implica nova fonte

Trocar a apresentação curta por longa no texto é uma correção comprovada. O Word anota Time Log F7/F16 e o código usa berthing_date de Summary B18; essa divergência será registrada e conferida com a planilha do DAMLA antes de mudar o significado da data.

## D-008 — Aprovação operacional após validação local

Esta entrega prepara spec, plano, tarefas e evidências. Execução de seed/ativação e publicação dependem da etapa operacional; não foram realizadas durante a análise. Os testes locais são condição para marcar tarefas como concluídas.

## D-009 — Execução local autorizada e arquivos preservados

Após a explicação das nove mudanças, o usuário autorizou a execução com “pode seguir”. Usar o checkout atual na branch `codex/msc-video-feedback`, criada a partir de `feat/msc-report`: isso preserva o plano preparado, dependências locais e arquivos não rastreados existentes. Publicação continua fora do escopo. Helpers de fotos e contratos de dados foram delegados conforme a skill de execução; o builder permanece com o agente principal.

## D-010 — Encadeamento limitado ao log compacto

Manter juntos até doze eventos, encerrando o encadeamento na última linha; logs maiores continuam entre linhas indivisíveis com cabeçalho repetido. Uma primeira estimativa de 24 linhas foi removida após a revisão apontar que descrições de 97 caracteres ainda podem caber na página e perder a proteção. O motor Word/LibreOffice decide a quebra quando o bloco exceder a altura útil. Teste de regressão unitário reproduziu a falha; a integração inclui doze descrições de 97 caracteres.

## D-011 — Aviso de ausência pela validação existente

CA-007 exige que a revisão informe quando a origem está realmente vazia. A investigação confirmou que campos opcionais vazios não geravam issue e contavam como OK no painel. Acrescentar avisos somente para viagem/temperatura/fluxo/frequência MSC presentes no spec e sem valor efetivo. `validate.ts` é mudança adicional indispensável ao critério aprovado. A revisão inicial e as ações já usam esse validador, dispensando alterações de UI. Zero e valores do operador continuam válidos; campos required preservam seu erro existente, sem duplicar aviso. Specs históricos e obrigatoriedade não mudam.
