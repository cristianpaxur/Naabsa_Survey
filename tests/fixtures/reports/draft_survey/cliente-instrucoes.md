# Insumos do cliente — Draft Survey (1º tipo prioritário)

> Recebidos em 2026-06-23. Fonte de verdade dos **dados de entrada** do tipo `draft_survey`.
> Artefatos versionados nesta pasta e em `../../planilhas/draft_survey/`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `../../planilhas/draft_survey/draft_survey.real.v1.xlsx` | Planilha-modelo pré-moldada real (template do cliente, com dados de exemplo do "HG ANTWERP") |
| `MV-PERSEUS-I.model.docx` | Relatório final modelo (vessel "MV PERSEUS I"), **anotado célula a célula** pelo cliente mostrando a origem de cada campo |
| `field-map.md` | Mapa reconciliado célula → seção do relatório (derivado dos dois acima) |

## Transcrição do e-mail de instruções

> Bom dia,
>
> Segue planilha e modelo de relatório.
>
> Criamos uma aba **capa** onde centralizamos uma grande parte das informações que necessitamos
> para compor o relatório. Tem dados sendo retirados de todas as abas, **menos da aba LOD-LOP**.
>
> Em relação à mudança entre embarque e descarga de produtos, deixei a planilha automática e quem
> for atender fará a seleção na capa sobre o tipo de atendimento. Desta forma, o gerador do
> relatório só precisa seguir a indicação da **célula L4 aba Capa**.
>
> As abas estão bloqueadas. Somente as células que serão preenchidas em campo estão habilitadas
> para edição. Se precisar desbloquear, a senha é `#SantosReports1981`.
>
> Para tentar facilitar ainda mais a busca dos dados, aplicamos cores para as diferentes abas.
>
> - **Realce amarelo** — informações que irão mudar de navio pra navio
> - **Realce verde/roxo** — textos que precisam mudar automaticamente de acordo com o tipo de atendimento
> - **Vermelho** — informações na aba Capa
> - **Azul** — Inicial
> - **Verde** — Intermediário e DS Intermediate
> - **Laranja** — Final e DS Final
>
> Todos os relatórios terão obrigatoriamente **nós e navio**. As outras partes de acordo com cada navio.
>
> Sds,

## Decisões de produto tomadas sobre estes insumos (2026-06-23)

1. **Draft details** (os "prints" das abas Inicial/Intermediario/final no docx) → recriados como
   **tabelas nativas** no `document_json` (sem render de Excel; mantém preview = PDF e editável).
2. **Idioma do PDF** → **inglês** (conforme o modelo). UI do app e mensagens de validação seguem pt-BR.
3. **Escopo do 1º passo** → specs + spec JSON real + fixtures (sem alterar extractor/builder ainda).

## Observações importantes (ler antes de implementar)

- A planilha-modelo usa dados de exemplo do **"HG ANTWERP"**; o docx é de **outro navio
  ("MV PERSEUS I")**. Os valores diferem — o que importa são **as células de origem**.
- As **anotações de célula da seção *Final* no docx estão desatualizadas** (`Final F28/G28/H28…`):
  referem-se a uma versão antiga do template. Na planilha atual a aba `final` espelha o layout da
  aba `Intermediario` (leituras nas linhas 9–11). **O spec segue a planilha viva**, não o docx.
- Algumas anotações têm pequenos erros humanos (ex.: docx cita "Vancouver (capa C7)" mas o porto de
  descarga real é `Capa!C9`; cita "L3" para a data inicial onde a planilha usa `Capa!L7`).
  Sempre validar contra a planilha.
- A senha de desbloqueio (`#SantosReports1981`) é um **segredo do cliente**: não versionar em código.
  Está aqui apenas como nota operacional; a extração lê valores (não precisa desbloquear).
