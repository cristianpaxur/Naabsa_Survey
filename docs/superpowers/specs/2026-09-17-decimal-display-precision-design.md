# Precisão decimal preservada por campo

## Contexto

O sistema armazena campos numéricos como números JSON. Essa representação é correta para cálculos e validações, mas elimina zeros decimais à direita: `81`, `81.0`, `81.00` e `81.000` viram o mesmo valor numérico `81`.

Atualmente a tela e o DOCX recompõem a apresentação usando `FieldDef.decimals`. Isso impõe uma precisão global do spec e não preserva nem o formato da célula de origem nem a escolha posterior do operador.

## Objetivo

Preservar separadamente:

- o valor numérico, usado em cálculos, validações e comparações;
- a quantidade de casas decimais exibidas, usada na revisão, na IA e nos documentos.

O comportamento vale para todos os campos com `type: "number"`.

## Regras funcionais

1. Na primeira extração, a quantidade de casas vem do formato numérico da célula do Excel.
2. Um override do operador pode escolher livremente a quantidade de casas, respeitando apenas o limite técnico de 100 casas do formatador JavaScript.
3. A precisão digitada pelo operador prevalece sobre a precisão extraída.
4. Na ausência dos dois metadados, `FieldDef.decimals` permanece como fallback de compatibilidade.
5. Alterar a precisão não altera o valor numérico.
6. Salvar e recarregar preserva exatamente a quantidade escolhida pelo operador.
7. O DOCX/PDF e o `display_value` enviado à IA usam a mesma precisão efetiva mostrada na revisão.
8. Separadores de milhar e decimal continuam sendo apenas apresentação. O armazenamento numérico permanece independente de localidade.

Exemplos:

| Entrada ou formato | Valor armazenado | Casas armazenadas | Exibição |
|---|---:|---:|---:|
| `81` | 81 | 0 | `81` |
| `81.0` | 81 | 1 | `81.0` |
| `81.00` | 81 | 2 | `81.00` |
| `81.000` | 81 | 3 | `81.000` |
| `1,234.50` | 1234.5 | 2 | `1,234.50` no documento em inglês |

## Modelo de dados

A tabela `reports` recebe dois mapas JSONB, ambos com default `{}` e constraint de objeto JSON:

- `extracted_number_formats`: precisão obtida do Excel, imutável após a extração;
- `operator_number_formats`: precisão escolhida pelo operador, atualizada junto com `operator_overrides`.

Cada entrada é `campo -> número inteiro de casas`. Somente campos numéricos conhecidos pelo spec podem ser gravados. Valores válidos ficam entre 0 e 100.

Não será alterado o formato de `extracted_data` nem de `operator_overrides`. Isso evita quebrar validações, cálculos, IA, builders e relatórios existentes.

## Extração do Excel

`ExtractionResult` passa a incluir `numberFormats: Record<string, number>`.

Para cada campo numérico, o extractor lê `ExcelJS.Cell.numFmt` da própria célula, inclusive quando o valor resulta de fórmula. A quantidade de casas é calculada a partir da seção numérica positiva do formato:

- ignora conteúdo entre aspas, escapes, cores, condições e trechos de data/hora;
- considera `0`, `#` e `?` após o separador decimal; zeros obrigatórios sempre aparecem e posições opcionais aparecem somente até o último algarismo significativo do valor;
- usa 0 para formatos inteiros explícitos;
- quando o formato é `General` ou não pode ser interpretado, não grava metadado e deixa o fallback do spec atuar.

O valor continua passando pela coerção numérica existente, mas `FieldDef.decimals` deixa de arredondar o dado na extração e passa a ser somente fallback de apresentação. Validações e cálculos usam o valor numérico disponível na planilha, dentro da precisão do JavaScript.

## Edição na revisão

O parser da UI retorna duas informações para entradas numéricas válidas:

```ts
{ value: number | null, decimals?: number }
```

A quantidade de casas é contada no texto normalizado antes de `Number(...)`, preservando zeros à direita. Ao apagar o campo, o valor vira `null` e o metadado de precisão do override é removido.

`setOverride` recebe o valor e a precisão. A action valida no servidor:

- existência e tipo numérico do campo;
- valor finito ou `null`;
- precisão inteira entre 0 e 100;
- coerência entre valor nulo e ausência de precisão.

A atualização grava `operator_overrides` e `operator_number_formats` na mesma operação otimista por `data_revision`. A auditoria registra o valor e a precisão anteriores e posteriores.

## Resolução da precisão efetiva

Uma função pura compartilhada resolve a precisão nesta ordem:

1. `operator_number_formats[field]`, quando existe override numérico ativo;
2. `extracted_number_formats[field]`;
3. `FieldDef.decimals`;
4. nenhuma precisão forçada, usando a representação numérica padrão.

O agrupamento de campos da revisão inclui `displayDecimals`. O componente mantém o texto digitado durante a edição e, após salvar ou recarregar, recompõe o texto com essa precisão efetiva.

## IA e documentos

O job de IA recebe os mapas e monta `display_value` com a precisão efetiva, mantendo o valor JSON numérico separado.

Os builders recebem um mapa de precisão efetiva junto dos dados. Toda formatação de campo numérico originado do spec consulta esse mapa. Formatações semânticas fixas do documento que não correspondem diretamente a um campo editável podem continuar definidas pelo template.

Para Draft Survey, `net_tonnage`, `gross_tonnage` e `summer_dwt` deixam de ser forçados a três casas. O resultado passa a seguir Excel ou operador.

## Compatibilidade e migração

A migration adiciona as duas colunas com `{}`. Relatórios existentes continuam usando `FieldDef.decimals` até que o operador edite um campo. Não haverá tentativa de inferir zeros antigos a partir do número, pois essa informação já foi perdida.

As APIs e jobs aceitam mapas ausentes como `{}` durante a transição. O deploy deve aplicar a migration antes de iniciar a nova versão do web e do worker.

## Erros e limites

- Entradas numéricas inválidas continuam sendo rejeitadas pela UI.
- Mais de 100 casas são rejeitadas com mensagem em pt-BR por ser o limite técnico de `Number.prototype.toFixed`.
- Formatos Excel ambíguos não interrompem a extração; usam o fallback do spec.
- Metadados de campos inexistentes ou não numéricos são ignorados na leitura e rejeitados na gravação.

## Testes

O desenvolvimento seguirá TDD. Cada comportamento começa com um teste falhando:

1. Extração identifica 0, 1, 2 e 3 casas a partir de formatos Excel reais, distingue posições obrigatórias e opcionais e cobre fórmula com resultado cacheado.
2. Parser preserva a escala de `81`, `81.0`, `81.00`, `81.000`, vírgula decimal e agrupadores, inclusive acima da precisão padrão do spec.
3. Action salva valor e precisão juntos, remove a precisão ao limpar e mantém concorrência otimista.
4. Recarregar a revisão mantém a quantidade digitada.
5. Resolução respeita a precedência operador → Excel → spec.
6. IA recebe valor numérico e `display_value` coerente.
7. DOCX contém a apresentação escolhida para casos representativos.
8. Migration é idempotente e mantém relatórios existentes válidos.
9. Suítes completas, typecheck, lint e build de produção permanecem verdes.

## Fora de escopo

- Alterar o valor numérico da célula de origem no Excel.
- Preservar cores, moeda, porcentagem ou outros estilos completos do Excel.
- Permitir precisão diferente por ocorrência do mesmo campo no documento.
- Inferir a precisão original de relatórios extraídos antes desta mudança.

## Implantação e rollback

O smoke test de produção cria um relatório com células formatadas como `81.0`, `12.00` e `24.000`, confirma a revisão, edita ao menos um campo para outra precisão e verifica a mesma apresentação no DOCX/PDF.

O rollback da aplicação é compatível com as novas colunas, pois versões antigas as ignoram. As colunas não devem ser removidas durante rollback; sua remoção fica para uma migration posterior, somente após confirmar que nenhum relatório depende delas.
