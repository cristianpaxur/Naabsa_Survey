# Revisão da geração no Collabora

## Evidência e escopo

Em 09/10/2026 foi inspecionado o relatório MSC SABRINA `21763dac-4136-472b-9a8e-db06c4ab0206` em `https://surveyors.paxur.com.br`. O editor de destino é Collabora CODE 26.04.3.1. A inspeção não alocou, removeu ou recortou fotos. A navegação passou pela etapa de fotos e retornou à edição com o documento existente.

O arquivo baixado pelo editor foi preservado em `Downloads/MSC_SABRINA.docx`, SHA-256 `bb21feb3420fec760ce5952669d344cf9f9e1ae155f2b6c2fe6c5f87aafb5adf`. Evidências locais: `tmp/msc-online-review-20261009/`.

## Problemas reproduzidos

1. A tela de fotos mostra somente Vessel, Engine room e Survey attendance. O ECR não está na configuração congelada desse relatório; a fixture atual já o inclui. A página e a alocação consultam a configuração congelada, portanto uma alteração exclusiva na UI não resolve a validação no servidor e no banco.
2. A capa não reserva espaço para contatos longos. No Collabora, a linha Vessel’s Command passa para a página 2. O sumário passa para a página 3, criando uma página quase vazia. Na exportação DOCX do Collabora, o LibreOffice local também reproduz o transbordamento, embora a divisão da linha difira.
3. O sumário é medido no LibreOffice do worker, enquanto a edição e a conversão podem usar outro motor/fontes no Collabora. A cópia exportada contém números de página incompatíveis com a paginação visível.
4. Com cinco fotos alocadas (Vessel 1, Engine room 2, Survey attendance 2), permanecem espaços dos parágrafos da galeria original. O título Vessel fica separado da foto e a seção vazia ECR conserva espaço desnecessário. A meia linha (`w:line=120`) da galeria Survey attendance recorta imagens inline no Collabora/LibreOffice mesmo com a dimensão OOXML correta; a altura visual também precisa de teste.
5. Depois de mostrar as fotos inteiras, a renderização da prévia deixou somente o último certificado dos anexos na página seguinte. O bloco precisa permanecer junto nas galerias parciais.

## Plano de correção

- Criar uma migration aditiva que acrescente somente o slot opcional ECR aos modelos MSC incompletos. Preservar configurações anteriores e históricos aprovados, células, valores e overrides; copiar cada configuração afetada para uma versão nova e auditar o vínculo dos relatórios abertos.
- Medir o fim dos contatos e reduzir a foto de capa somente quando a capa transbordar, preservando a proporção e o tamanho original nos casos que já cabem.
- Compactar somente galerias com quantidade diferente da referência, removendo parágrafos vazios de imagens removidas e mantendo o título junto à primeira foto disponível.
- Verificar sumário e paginação após a montagem final. Validar com o caso real e com o exemplar original, além de testes de regressão pertinentes.

## Correções locais

- Migration 0021: cópias dos specs incompletos com ECR opcional, vínculo/auditoria de relatórios abertos não excluídos, preservação de históricos e de todos os dados/documentos existentes.
- Builder: marcador do fim dos contatos, redução da foto de capa apenas se transbordar, remoção de padding da galeria parcial e ligação de Photographic Report/Vessel à primeira foto. Não transferir o crop da imagem do exemplo para fotos diferentes; usar altura de linha integral nos parágrafos das fotos alteradas para evitar o corte na renderização.
- Attachment: agrupar título, espaçador e seis itens para evitar a última linha isolada nos relatórios com galerias parciais.
- Paginação MSC: Collabora quando configurado, LibreOffice para desenvolvimento; cobertura completa das seções e conferência da versão com sumário numerado. Timeout/mapa incompleto geram erro recuperável. Teste de regressão reproduziu uma medição final vazia que antes permitia retornar um DOCX sem os números.
- Referência completa reconferida: nove páginas pixel idênticas no Word 16.0/16.0.20430 a 144 DPI. O pacote regenerado após as correções das galerias tem todos os payloads iguais ao que foi comparado.

A prévia SABRINA de diagnóstico usa fotos exportadas do documento aberto, contatos visíveis e dados da fixture XLSX SABRINA. Ela comprova o layout; não substitui o relatório do usuário e não comprova a igualdade de todos os valores do registro de produção, ao qual não há acesso. A comparação do exemplar usa exatamente os dados e as 31 imagens da referência.

Resultados dos testes e inspeção final ficam em [validation.md](validation.md); ativação, guarda de documentos existentes e recuperação em [deployment-online.md](deployment-online.md).

## Ambiente de destino

As credenciais locais apontam a ambientes locais ou a um projeto Supabase antigo; não dão acesso ao backend desse relatório. O conector EasyPanel disponível não lista os serviços Naabsa. O endpoint público de conversão do Collabora responde HTTP 403 para a estação. Não alterar sua lista de permissões para contornar esse bloqueio. A aplicação da migration e a publicação exigem o ambiente de destino identificado.
