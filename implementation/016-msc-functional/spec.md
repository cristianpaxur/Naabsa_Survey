# 016 — MSC funcional de ponta a ponta

Status: implementação autorizada pelo usuário em 15/09/2026 ("iniciar a implementação").

## Objetivo

Tornar o relatório MSC utilizável do upload da planilha à geração do PDF, usando `MSC SABRINA - revisado.xlsx` como fonte dos dados e `MSC Report - revisado.docx` como referência de estrutura. As marcações em vermelho e amarelo no Word são instruções de mapeamento e nunca integram a saída final.

## Escopo aprovado

- Aceitar ponto ou vírgula em medidas numéricas e salvar a edição somente ao concluir o campo, preservando o foco durante a digitação.
- Completar o contrato MSC e o builder para dados de navio, grades, sludge, flowmeters, last attendance, time log e regras condicionais do modelo.
- Corrigir upload, feedback e gestão de fotos; incluir os grupos ECR e Hull e permitir remover/desalocar fotos alocadas.
- Reorganizar índice, numeração, seções de fotos e anexos para corresponder ao modelo.
- Corrigir a trilha de montagem e conversão a PDF com erros acionáveis e testes de regressão.

## Fora do escopo

- Deploy, aplicação de migration ou modificação de dados reais.
- Alterar relatórios históricos: specs permanecem congeladas por relatório.
- Alterar custos, provedor ou credenciais de IA.

## Critérios de aceite

- CA-01: LOA, LBP e demais números aceitam `280,54` e `280.54`, sem perda de seleção a cada caractere.
- CA-02: Dados e condicionais do Word são extraídos das abas Summary, Time Log, Qtt Sumary, Sludge e LOG Audit.
- CA-03: Fotos podem ser enviadas, acompanhadas, alocadas, desalocadas e removidas; os grupos Vessel, Engine Room, Survey Attendance, ECR e Hull aparecem.
- CA-04: Índice e corpo têm uma única hierarquia e os anexos são exatamente os seis solicitados.
- CA-05: Um MSC gerado a partir da fixture real produz DOCX e PDF sem erro, com testes para os casos condicionais relevantes.

