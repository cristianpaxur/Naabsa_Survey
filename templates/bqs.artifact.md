# BQS — contrato do modelo

Versão 1, slug explícito `bqs`, contrato de extração 2, sem variantes.

## Autoridade e origem

O modelo foi reconstruído de um PDF fornecido pelo cliente, com autorização,
pois o DOCX original não estava disponível. Não há alegação de identidade de
pixels. Foram preservados idioma inglês, identidade visual NAABSA, capa,
sumário, sondagens, figuras finais, áreas de fotografia e anexos editáveis.

Insumos originais, hashes e mapa com valores reais ficam no diretório privado
de evidências. Este repositório público distribui apenas o contrato de células,
o template sem dados e a fixture inteiramente sintética
`tests/fixtures/planilhas/bqs/synthetic.xlsx`, reproduzida sem ler arquivos de
cliente por `scripts/build_bqs_synthetic_fixture.mjs`.

## Contrato dos dados

- 95 campos escalares, quatro tabelas (12/12 linhas de navio e 10/10 de barcaça),
  17 eventos no Time Log e dados de amostragem. Sem descarte de linhas zeradas.
- Toda célula e âncora de campo reside no spec. A leitura dinâmica adicional
  do Time Log está documentada no mapa; o motor compartilhado não contém células BQS.
- Override confirmado: `vessel_close_start=19:10`, pois `Time Log!E28=19;10`.
  O arquivo original não foi corrigido silenciosamente.
- Cache ausente não vira zero. Fórmulas com resultado zero/false preservam o cache.
- Totais IN AIR e IN VAC reconciliados com as linhas; diferenças de recebimento,
  entrega, BDN e logbook reconciliadas sem arredondamento intermediário.
- `delivery_difference_pct` já está em pontos percentuais. Formatar uma vez.
- O adapter não recalcula tabelas físicas de calibração nem valida independentemente
  o VCF. Preserva os resultados calculados da planilha e confere suas agregações.
- Por padrão: massas/volumes 3 casas, densidades/VCF 4, calados 2, temperatura 1
  nas tabelas; datas DD/MM/YYYY e horários HH:mm. Precisões escalares revisadas
  seguem o contrato existente de precedência do sistema.

## Word e fotografias

O template `bqs.clean.docx` é reproduzido por `scripts/build_bqs_template.py`
com python-docx. A4; Arial; logo do repositório; tabelas nativas com cabeçalhos
repetidos, linhas não divisíveis e margens compactas; sumário com hyperlinks,
bookmarks e campos PAGEREF. Rodapé com campo PAGE. Não contém macros.

Os dados ausentes usam 17 controles `bqs_manual_*`, inicialmente “—”. O usuário
confirmou que serão preenchidos posteriormente. Nomes e destinos estão no mapa.
Não inventar cliente, bandeira, IMO, dimensões, contatos ou protestos.

| Controle de fotografia | Destino | Regra |
|---|---|---|
| `bqs_photos_cover` | Capa | zero ou uma foto |
| `bqs_photos_sounding_tables` | 4.2 | galeria em duas colunas |
| `bqs_photos_vessel_tanks` | 7.1 | galeria em duas colunas |
| `bqs_photos_barge_tanks` | 7.2 | galeria em duas colunas |
| `bqs_photos_sampling` | 7.3 | galeria em duas colunas |

Ordem da alocação preservada, orientação normalizada e proporção preservada;
crop explícito do operador aplicado antes. Galeria ímpar mantém a última foto.
Foto opcional não alocada difere de download/decodificação de foto alocada com falha.
Falha, slot desconhecido ou foto pendente bloqueiam a montagem.

Atualizar fotos substitui apenas os cinco controles identificados, preservando
as demais edições, e elimina relações e bytes antigos sem referência no pacote.
Ausência/duplicação de controle bloqueia a atualização para preservar o documento.
As verificações existentes de lock, revisão, geração e alocação continuam em uso.

O sumário é medido no PDF real pelo mesmo motor usado para conversão, em até
três passagens. Capa maior que uma página ou páginas ambíguas bloqueiam a saída.
Depois da aprovação, o snapshot salvo é convertido sem reconstrução. Uma guarda
BQS confere o sumário no PDF e solicita correção no editor se ele ficou desatualizado.

## Reprodução e aceite

Recrie o contrato com `python scripts/build_bqs_spec.py`, o template com
`python scripts/build_bqs_template.py` e a fixture com
`node scripts/build_bqs_synthetic_fixture.mjs`.

Os testes cobrem extração, diferenças aritméticas, cache zero/false, campos
manuais, fotos, atualização preservando edição, paginação e cadastro inativo.
A fixture contém intencionalmente um horário inválido para verificar o override.

A validação local de Word e PDF não substitui a homologação no Collabora/WOPI.
Consulte `implementation/019-bqs/deployment.md` para o estado no destino.
A migration 0029 cadastra tipo/spec sem ativação. O cadastro legado
`bunker_surveyor` permanece independente.
