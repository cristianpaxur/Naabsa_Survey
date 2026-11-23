# Plano de implementação das correções MSC do vídeo

## Atualização autorizada em 09/10/2026

A solicitação de identidade com o Word substitui as aproximações visuais do plano anterior abaixo. Execução atual: (1) destilar e sanitizar cópia do pacote DOCX real em `templates/msc.clean.docx`, com script reproduzível e registro dos slots; (2) preencher dados e clonar padrões originais de linhas/fotos em `buildDocxMsc.ts`; (3) testar preservação dos estilos, numeração, cabeçalhos, rodapés e margens, além dos contratos de dados; (4) comparar cada página de referência e saída, iterando até eliminar diferenças de layout não explicadas pelos slots; (5) executar regressões e revisão independente. O pipeline continua medindo páginas em duas passagens. Não aplicar os valores de geometria ou IDs antigos abaixo como critérios atuais.

> **Para execução por agente:** ler primeiro [spec.md](spec.md) e executar as tarefas em ordem usando `executing-plans`. Cada etapa abaixo tem teste e evidência próprios. Execução local autorizada pelo usuário em 09/10/2026 com “pode seguir”.

**Objetivo:** atender RF-001–RF-009 do vídeo, preservando os dados e a edição nativa do documento.

**Arquitetura:** manter o builder MSC e introduzir somente helpers de layout específicos onde isso melhora a validação. O sumário e o corpo continuam usando um catálogo de seções comum. O pipeline conserva duas passagens de montagem/medição e a conversão do DOCX aprovado.

**Stack:** TypeScript, `docx` 9, ExcelJS, Sharp, Vitest, LibreOffice/Collabora. Sem nova dependência de produto.

## Arquivos e responsabilidades

| Arquivo | Responsabilidade planejada |
|---|---|
| `apps/worker/src/lib/buildDocxMsc.ts` | Capa, contatos, Contents, estilos, datas, Time log e integração do relatório fotográfico |
| `apps/worker/src/lib/naabsaDocumentLayout.ts` | Opção/preset de cabeçalho MSC sem mudar o padrão compartilhado |
| `apps/worker/src/lib/msc-photo-layout.ts` (novo) | Cálculo de tamanho máximo e pares de fotos |
| `apps/worker/src/lib/msc-photo-layout.test.ts` (novo) | Proporção, retratos/paisagens, pares e quantidade ímpar |
| `apps/worker/src/lib/buildDocxMsc.test.ts` | Contrato OOXML e conteúdo por requisito |
| `apps/worker/src/lib/naabsaDocumentLayout.test.ts` | Cabeçalho MSC e preservação do padrão existente |
| `apps/worker/src/jobs/generatePdf.ts` e seu teste | Dados efetivos e medição após o layout final; somente mudanças demonstradas por regressão |
| `packages/core/src/extractor/msc-extract.test.ts` | Valores exatos de viagem/purificadores, vazio e zero |
| `tests/fixtures/specs/msc.v1.json` | Alteração somente se diagnóstico provar mapeamento incorreto; manter histórico de versão |
| `tests/golden/golden-pipeline.test.ts` e snapshots MSC | Conteúdo final, links e ausência de instruções do modelo |
| `apps/worker/src/lib/buildDocxMsc.integration.test.ts` (novo) | PDF real com fixtures compactas, longa tabela e fotos variadas |
| `implementation/017-msc-feedback-video/` e índice | Progresso, decisões e evidência de cada teste |

## Sequência de execução

### T-001 — Fixar a reprodução e o contrato de dados

- [ ] Registrar a versão/hash do Word, PNGs de referência e um DOCX/PDF atual com os mesmos dados sintéticos e fotos de proporções conhecidas.
- [ ] Ampliar `msc-extract.test.ts` com as expectativas abaixo; executar antes de qualquer correção. O caso nominal já deve passar e serve para separar extração correta de estado publicado antigo.

```ts
const result = runExtraction(workbook, spec.spec);
expect(result.data.voy).toBe('MM623R');
expect(result.data.purifier_temp).toBe(98);
expect(result.data.purifier_flow).toBe('1 x 2,0');
expect(result.data.purifier_bowl_freq).toBe(60);
```

- [ ] Acrescentar fixture em memória com `Sludge!K29 = 0` e confirmar `purifier_temp === 0`; acrescentar célula vazia e confirmar ausência, sem valor padrão numérico.
- [ ] Registrar testes de layout que falham na implementação atual: Contents centralizado, contato alinhado no topo, data longa e fotos limitadas pela altura.

### T-002 — Corrigir cabeçalho e contatos da capa

- [ ] Estender a assinatura existente para `createNaabsaHeader(logo, variant, options?: { reportType?: 'msc' })`. A chamada sem opções preserva o resultado atual.
- [ ] Definir o ajuste geométrico do MSC após medir o PDF de referência: reduzir o espaço antes do conteúdo, alinhar logo/texto/linha e verificar primeira/par/even. Não alterar `NAABSA_PAGE_MARGINS` globalmente para corrigir somente MSC.
- [ ] Trocar a tabela de contatos para DXA/FIXED, largura `NAABSA_BODY_WIDTH`, com uma proposta inicial de colunas `[2694, 7567]` twips. Essa proposta dá mais largura aos valores e será confirmada visualmente com os nomes de exemplo.
- [ ] Aplicar `VerticalAlign.TOP` e espaçamento idêntico nas células. Mantém-se a fonte e o conteúdo completo.

```ts
// Estrutura de célula; a largura é passada pelo par de colunas MSC.
new TableCell({
  width: { size: columnWidth, type: WidthType.DXA },
  verticalAlign: VerticalAlign.TOP,
  margins: { top: 30, bottom: 30, left: 100, right: 80 },
  children: lines.map((text) => new Paragraph({
    spacing: { before: 0, after: 0, line: 240 },
    children: [run(text)],
  })),
});
```

- [ ] Testar XML das colunas e alinhamento; conferir a capa com valores curtos, longos, foto de capa e ausência de foto.
- [ ] Executar `pnpm --filter @naabsa/worker exec vitest run src/lib/naabsaDocumentLayout.test.ts src/lib/buildDocxMsc.test.ts`.

### T-003 — Centralizar Contents e garantir Vessel

- [ ] Criar o parágrafo Contents com `alignment: AlignmentType.CENTER`; entradas mantêm alinhamento à esquerda e tabulação à direita.
- [ ] Usar o catálogo existente para indexar e renderizar Vessel. A entrada já existe: não inserir outra por concatenação.
- [ ] Garantir `keepNext: true` no título `s3_1` e ligação à primeira linha de fotos. A composição final da linha de fotos é implementada em T-008.
- [ ] Acrescentar teste de identidade entre link, bookmark e título:

```ts
const xml = new PizZip(docx).file('word/document.xml')!.asText();
expect(xml.match(/w:name="s3_1"/g)).toHaveLength(1);
expect(xml).toContain('w:anchor="s3_1"');
expect(paragraphs(docx).filter((text) => text === '3.1 Vessel')).toHaveLength(2);
// Duas ocorrências textuais são esperadas: sumário e corpo.
```

- [ ] Repetir a medição de bookmarks com o layout pronto e comparar páginas/links do PDF, incluindo categorias vazias e Hull/ECR.

### T-004 — Uniformizar corpo, espaçamento e rótulos

- [ ] Tornar explícitos os estilos Normal, Heading1 e Heading2 do MSC: Tahoma; corpo 11 pt; títulos atuais 13/11 pt; entrelinha e espaço antes/depois coerentes. As medidas são conferidas com o exemplo e os comentários do vídeo, sem alterar fontes do sistema.
- [ ] Separar as larguras de propriedades do navio das larguras dos purificadores. Proposta inicial para purificadores: `[4200, 5660]` twips, total 9860, evitando a quebra artificial de rótulos longos na coluna atual de 1700 twips.
- [ ] Manter título junto do próximo bloco; usar espaçamento e estilos em vez de linhas vazias acumuladas.
- [ ] Testar a presença de estilo/espaçamento explícitos e confirmar no PDF que os três rótulos dos purificadores ficam legíveis, sem alterar unidades ou precisão.

### T-005 — Aplicar data longa apenas ao texto narrativo

- [ ] Criar teste que falha no builder atual:

```ts
const text = paragraphs(await buildReportDocxMsc({
  data: { berthing_date: '2026-09-30' },
  logo: null, photos: {}, timeLogRows: [],
})).join('\n');
expect(text).toContain('We did attend vessel on September 30th, 2026');
expect(text).not.toContain('We did attend vessel on 30/09/2026');
```

- [ ] Trocar `fmtDateShort(data['berthing_date'])` por formatação longa no Found at Survey. Validar calendário, entrada vazia e inválida no helper; preservar `fmtDateShort` nas tabelas.
- [ ] Cobrir dias 1, 2, 3, 11, 12, 13, 21, 22, 23, 30 e 31, evitando sufixos ordinais incorretos e diferenças de fuso.
- [ ] Documentar a divergência de fonte de data anotada no Word. Só propor mudança de célula após conferir a planilha DAMLA e a intenção do operador.

### T-006 — Diagnosticar e corrigir os dados em branco

- [ ] Executar CT-007 com a fixture atual, depois com dados efetivos e overrides na montagem do job. Confirmar a precedência `operator_overrides > extracted_data`, inclusive zero e limpeza explícita.
- [ ] Comparar, no ambiente de validação autorizado, os quatro níveis do DAMLA: XLSX original, campos do `report_specs` referenciado por `reports.spec_id`, `extracted_data`/`operator_overrides` e `data` entregue ao builder. Consultas são inicialmente somente leitura.

```sql
-- $1 é o UUID do relatório selecionado, passado como parâmetro pelo cliente SQL.
-- Executar somente no ambiente de diagnóstico autorizado, sem UPDATE/INSERT.
SELECT r.id, r.spec_id, s.version,
       s.spec #> '{source,common,fields,voy}' AS voy_mapping,
       s.spec #> '{source,common,fields,purifier_temp}' AS temp_mapping,
       s.spec #> '{source,common,fields,purifier_flow}' AS flow_mapping,
       s.spec #> '{source,common,fields,purifier_bowl_freq}' AS frequency_mapping,
       r.extracted_data -> 'voy' AS extracted_voy,
       r.extracted_data -> 'purifier_temp' AS extracted_temp,
       r.extracted_data -> 'purifier_flow' AS extracted_flow,
       r.extracted_data -> 'purifier_bowl_freq' AS extracted_frequency,
       r.operator_overrides -> 'voy' AS override_voy,
       r.operator_overrides -> 'purifier_temp' AS override_temp,
       r.operator_overrides -> 'purifier_flow' AS override_flow,
       r.operator_overrides -> 'purifier_bowl_freq' AS override_frequency
FROM reports r
JOIN report_specs s ON s.id = r.spec_id
WHERE r.id = $1 AND r.deleted_at IS NULL;
```

- [ ] Aplicar a decisão correspondente à evidência, sem correção especulativa:

| Evidência encontrada | Ação concreta |
|---|---|
| Célula realmente vazia | Indicar pendência na revisão e solicitar preenchimento; não inventar valor |
| Campo ausente no spec ativo | Preparar nova versão completa pelo mecanismo existente de `seed-msc-spec.ts`; ativação fica para a etapa operacional autorizada |
| Relatório preso a spec histórico incompleto | Manter o histórico e preparar recriação com o modelo atualizado; não editar o spec compartilhado nem sobrescrever o Word editado |
| Spec e célula corretos, extração incorreta | Acrescentar reprodução no core e corrigir o caminho exato de normalização/coerção |
| Dados extraídos corretos, builder recebe ausência | Corrigir a montagem efetiva no ramo MSC de `generatePdf.ts`, preservando overrides |
| Override explícito em branco | Manter a escolha do operador e disponibilizar a revisão do campo |

- [ ] Garantir teste para `98 °C`, `1 x 2,0 m³`, `60 minutes` e viagem `MM623R` no DOCX, incluindo número/formatação salvos pelo operador.
- [ ] Registrar no validation.md qual ramo foi comprovado. A disponibilidade da planilha DAMLA é dependência de diagnóstico, não motivo para bloquear as correções visuais independentes.

### T-007 — Controlar a paginação do Time log

- [ ] Criar teste OOXML com os doze eventos da fixture e um caso maior de continuidade.
- [ ] Definir `tableHeader: true` na primeira `TableRow` e `cantSplit: true` nas linhas. Aplicar encadeamento de `keepNext` entre título/linhas para o caso compacto; encerrar esse encadeamento na última linha.
- [ ] Para o caso longo, permitir quebra entre linhas com cabeçalho repetido. Não forçar toda tabela arbitrariamente longa numa página.
- [ ] Validar em PDF que o caso compacto migra inteiro para a próxima página quando não cabe no espaço restante, e que não perde eventos nem horários.
- [ ] Executar o teste de integração real opt-in depois de T-008, quando a geometria estiver consolidada.

### T-008 — Restaurar fotos menores e agrupadas

- [ ] Criar `msc-photo-layout.ts` com interfaces puras:

```ts
export function fitPhotoSize(
  source: { width: number; height: number },
  box: { width: number; height: number },
): { width: number; height: number } {
  if (source.width <= 0 || source.height <= 0) {
    throw new Error('Dimensões de foto inválidas.');
  }
  const scale = Math.min(box.width / source.width, box.height / source.height);
  return { width: source.width * scale, height: source.height * scale };
}

export function pairPhotos<T>(photos: readonly T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < photos.length; i += 2) rows.push(photos.slice(i, i + 2));
  return rows;
}
```

- [ ] Testar antes de usar no builder:

```ts
expect(fitPhotoSize({ width: 800, height: 600 }, { width: 80, height: 60 }))
  .toEqual({ width: 80, height: 60 });
expect(fitPhotoSize({ width: 600, height: 800 }, { width: 80, height: 60 }))
  .toEqual({ width: 45, height: 60 });
expect(pairPhotos(['a', 'b', 'c'])).toEqual([['a', 'b'], ['c']]);
```

- [ ] Converter milímetros para pixels/EMU na fronteira do builder, usando o padrão já existente. Nunca passar milímetros diretamente como pixels para `ImageRun`.
- [ ] Montar tabela de duas colunas sem bordas, linhas indivisíveis, padding consistente e imagem centralizada em cada célula. Manter título e primeira linha juntos. Quantidade ímpar usa uma célula vazia, sem tabela/página artificial adicional.
- [ ] Separar a capa da galeria. Para a capa, limitar a foto ao quadro maior do exemplo, mantendo proporção; aplicar o recorte confirmado apenas uma vez, no pipeline atual.
- [ ] Testar 0, 1, 2, 3 e 6 fotos por categoria, retrato/paisagem, nomes de seções, ordem e ausência de duplicação.

### T-009 — Validar o documento completo e preparar a ativação

- [ ] Criar integração opt-in `RUN_LO_TESTS=1` do MSC usando apenas fixture e fotos sintéticas; produzir DOCX/PDF em pasta temporária com perfil LibreOffice isolado. O teste não consulta banco ou serviço externo.
- [ ] Validar PDFs rasterizados: capa, Contents, corpo, Time log, Vessel e demais grupos; inspecionar cada página, não apenas a primeira. Conferir cabeçalhos pares/ímpares e links/páginas do sumário.
- [ ] Rodar os comandos abaixo. Só atualizar snapshots MSC após conferir o diff de conteúdo; não atualizar Draft Survey para esconder regressões.

```powershell
pnpm --filter @naabsa/core exec vitest run src/extractor/msc-extract.test.ts
pnpm --filter @naabsa/worker exec vitest run src/lib/buildDocxMsc.test.ts src/lib/naabsaDocumentLayout.test.ts src/lib/msc-photo-layout.test.ts src/jobs/generatePdf.test.ts
$env:RUN_LO_TESTS = '1'
pnpm --filter @naabsa/worker exec vitest run src/lib/buildDocxMsc.integration.test.ts
Remove-Item Env:RUN_LO_TESTS
pnpm lint
pnpm typecheck
pnpm test
pnpm test:golden
```

- [ ] Registrar resultados, PDFs, páginas de comparação e limites em `validation.md`; atualizar tarefas/índice somente com evidência.
- [ ] Preparar instrução operacional: publicar worker corrigido, conferir modelo MSC ativo, criar relatório de validação, revisar os dados, aprovar e comparar PDF no ambiente de destino. Execução no ambiente publicado fica separada da preparação local.

## Reversibilidade e rollback

Alterações são separadas por responsabilidade e testadas antes de compor o layout final. O cabeçalho recebe preset MSC; o padrão anterior continua disponível. Reverter o código do MSC restaura a montagem anterior para novos documentos. Documentos já salvos/assinados não são reconstruídos. Se uma nova versão de spec for ativada posteriormente, registrar seu ID e o ID anterior para reativação controlada, preservando as duas versões.

## Estado de aprovação

Preparação solicitada pelo usuário em 09/10/2026. Execução local autorizada posteriormente com “pode seguir”, após explicação das nove mudanças. Publicação permanece fora do escopo.

Para atender CA-007 sem mudar specs históricos, `packages/core/src/extractor/validate.ts` é arquivo adicional indispensável: avisos de ausência apenas nos quatro campos MSC destacados, refletidos pela revisão existente. Não altera a obrigatoriedade dos campos nem bloqueia a confirmação.
## Revisão da geração online — F-004/F-005

1. Preservar e inspecionar o DOCX exportado pelo Collabora e o fluxo de fotos da geração indicada pelo usuário.
2. Acrescentar somente ECR às cópias dos specs incompletos e vincular relatórios abertos, mantendo históricos e documentos; validar em PGlite com trigger de imutabilidade.
3. Medir a capa e ajustar sua fotografia somente quando necessário. Compactar galerias parciais, impedir a transferência do recorte da imagem do exemplar e o corte por meia linha, e manter a lista dos anexos junto de seu título.
4. Medir o sumário no motor do destino, exigir cobertura completa e verificar o DOCX numerado.
5. Validar cenários nativos compactos, longos, multilinha e contatos longos, inspecionar as páginas e reconferir o exemplar completo no Word. Registrar prechecks, ativação e recuperação em [deployment-online.md](deployment-online.md).
