# Mapa de campos — Draft Survey

> Reconciliação **célula viva da planilha → seção do relatório**, derivada de
> `draft_survey.real.v1.xlsx` + `MV-PERSEUS-I.model.docx`. Onde o docx diverge da planilha,
> **vale a planilha** (ver `cliente-instrucoes.md`). Fonte declarativa: `../../specs/draft_survey.v1.json`.

Legenda de confiança: ✅ alta · ⚠️ verificar contra render · 🕗 anotação docx desatualizada (segue planilha).

## Identificação do tipo
- **Fingerprint:** `Capa!B2 == "DRAFT SURVEY"` (mesclada B2:N2) ✅
- **Seletor de variante:** `Capa!L4` → `Loading` ⇒ `loading` · `Discharge` ⇒ `discharge` ✅
  (o e-mail: "o gerador só precisa seguir a indicação da célula L4 aba Capa")

## Cabeçalho / Cover
| Campo no relatório | Origem | Tipo | Nota |
|---|---|---|---|
| Ref | `Capa!C4` | string | ✅ |
| Vessel name | `Capa!C13` | string | ✅ obrigatório |
| Flag | `Capa!C14` | string | ✅ |
| IMO | `Capa!C17` | string | ✅ (preservar como texto) |
| Port (de atendimento) | `Capa!C5` | string | ✅ |
| Data (cabeçalho = final) | `Capa!L9` | date | ✅ formato inglês "Month Do, YYYY" |

## Person / Companies contacted
> Sempre presentes: **Undersigned Surveyor (NAABSA)** e **Vessel** (e-mail: "nós e navio"). Demais condicionais.

| Linha | Origem | Nota |
|---|---|---|
| Client | `Capa!C33` + `Capa!C34` (contato) | preenchido pelo escritório de Santos; pode vir vazio |
| Undersigned Surveyor | fixo "NAABSA Marine Surveyors" + nome do surveyor | "nós" — sempre presente |
| Vessel's Command (Master / Chief Officer) | `Capa!C28` / `Capa!C29` | ✅ |

## Background (texto + automático por variante)
- "appointment survey from Messrs. **{client}**" → `Capa!C33`
- "She called **{port}** Port to **load/discharge** a cargo of **{cargo}** in bulk **bound to / loaded in {discharging_port}**"
  → porto `Capa!C5`, cargo `Capa!C8`, outro porto `Capa!C9` (docx anotou "C7" por engano 🕗)
- **load/discharge** e **bound to / loaded in** alternam por `Capa!L4` (variante).

## Ship's Particulars
| Linha | Origem | Tipo | Unidade no PDF |
|---|---|---|---|
| Flag | `Capa!C14` | string | — |
| Port registry | `Capa!C15` | string | — |
| Call sign | `Capa!C16` | string | — |
| IMO number | `Capa!C17` | string | — |
| Type | `Capa!C18` | string | — |
| Delivered | `Capa!C19` | number | ano |
| LOA | `Capa!C20` | number(2) | "m" |
| LBP | `Capa!C21` | number(2) | "m" |
| Depth moulded | `Capa!C22` | number(2) | "m" |
| Breadth moulded | `Capa!C23` | number(2) | "m" |
| Net tonnage | `Capa!C24` | number(0) | "mt" |
| Gross tonnage | `Capa!C25` | number(0) | "mt" |
| Summer DWT | `Capa!C26` | number(0) | "mt" |

## Outros (Capa)
| Campo | Origem | Tipo | Nota |
|---|---|---|---|
| Terminal | `Capa!C6` | string | usado nas seções de fase ("upon berthing at {terminal}") |
| Shed | `Capa!C7` | string | |
| Voyage | `Capa!C10` | string | |
| Agency | `Capa!C11` | string | |
| Official figures | `Capa!L5` | string | ex.: "Shore Scale" |
| **Berthing side** | `Capa!C31` | enum(Port Side, Starboard) | dirige o texto "Starboard/Port side from shore vs boat" |

## Datas e horas das fases (Capa, por fórmula das abas)
| Fase | Data | Início | Fim |
|---|---|---|---|
| Initial | `Capa!L7` | `Capa!M7` | `Capa!N7` |
| Intermediate | `Capa!L8` | `Capa!M8` | `Capa!N8` |
| Final | `Capa!L9` | `Capa!M9` | `Capa!N9` |
> M/N são horários (time-of-day) — novo caso de coerção para o extractor (ver 003). Datas-fonte
> "cruas" também existem nas abas: `Inicial!C7`, `Intermediario!C5`, `final!C5`.

## Draft readings — tabelas-resumo (uma por fase)
Colunas: **Draft Mark | Means | Mean corrected** + bloco **Trim / Heel-List / Deflection**.

### Initial — aba `Inicial` ✅
| Item | Mean | Mean corrected |
|---|---|---|
| Fwd | `Inicial!D10` | `Inicial!H10` |
| Ms  | `Inicial!D11` | `Inicial!H11` |
| Aft | `Inicial!D12` | `Inicial!H12` |
| Trim observed `Inicial!D15` · Trim real `Inicial!G15` | | |
| Heel `Inicial!Z24` (valor) + `Inicial!Y25` (lado) | | |
| Deflection `Inicial!G17` (cm) + `Inicial!G18` (Sagging/Hogging) | | |
> Drafts observados (input navio-a-navio): `Inicial!B10:C12` (PS/SS).

### Intermediate — aba `Intermediario` ✅
| Item | Mean | Mean corrected |
|---|---|---|
| Fwd | `Intermediario!D9` | `Intermediario!H9` |
| Ms  | `Intermediario!D10` | `Intermediario!H10` |
| Aft | `Intermediario!D11` | `Intermediario!H11` |
| Trim apparent `Intermediario!D14` · Trim real `Intermediario!G14` | | |
| List `Intermediario!AA23` (valor) + `Intermediario!Z24` (lado) | | |
| Deflection `Intermediario!G16` (cm) + `Intermediario!G17` (Sagging/Hogging) | | |
> Observados: `Intermediario!B9:C11`. **Seção inteira é condicional** (só aparece se preenchida).

### Final — aba `final` 🕗 (docx anota F28/G28… — layout antigo; planilha viva espelha Intermediario)
| Item | Mean | Mean corrected |
|---|---|---|
| Fwd | `final!D9` | `final!H9` |
| Ms  | `final!D10` | `final!H10` |
| Aft | `final!D11` | `final!H11` |
| Trim apparent `final!D14` · Trim real `final!G14` | | |
| List `final!Z23` (valor) + `final!Y24` (lado) | | |
| Deflection `final!G16` (cm) + `final!G17` (Sagging/Hogging) | | |
> Observados: `final!B9:C11`.

## Figures (Intermediate / Final)
### Intermediate — aba `DS INTERMEDIATE` ⚠️
| Linha | Origem |
|---|---|
| Shore Scale / BsL (Official) | `DS INTERMEDIATE!C37` |
| NAABSA's surveyor figures (loaded) | `DS INTERMEDIATE!C38` |
| Difference (MT) / (%) | `DS INTERMEDIATE!C39` / `DS INTERMEDIATE!C40` |
| Vessel's figures | `DS INTERMEDIATE!I38` (docx anotou J38 🕗) |
| Acting-as (Terminal/Buyer/…): papel/empresa/figura | `B50:F52` + figuras `J51:J52` |

### Final — aba `DS FINAL` ⚠️
| Linha | Origem |
|---|---|
| Shore Scale (Official) | `DS FINAL!C37` |
| NAABSA's surveyor figures | `DS FINAL!C38` |
| Difference (MT) / (%) | `DS FINAL!C39` / `DS FINAL!C40` |
| Vessel's figures | `DS FINAL!I38` |
| Acting-as (Shipper/Customs/…): papel/empresa/figura | `B48:F50` + figuras `J49:J50` |

## "…Draft details" — grades completas (tabelas nativas, range-based)
Cada fase embute a grade de cálculo da aba como **tabela nativa**. Blocos lógicos por aba:
| Bloco | Inicial | Intermediario | final |
|---|---|---|---|
| Draft marks & correções | `B8:H18` | `B7:H17` | `B7:H17` |
| Displacement corrections | `K2:O28` | `K2:O30` | `K2:O30` |
| Ballast water (tank a tank) | `Q2:V31` | `S2:W30` | `Q2:V30` |
| Fresh water / bunkers | `X2:AB21` | `Y2:AC21` | `X2:AB21` |
> Ranges ⚠️ — confirmar limites exatos contra o render nativo (T-016). Headers derivados da linha 3.

## Photographic Report
- Seções **Initial / Intermediate / Final** → `photo_slots` (escopo 007).

## Attachment (rodapé)
- "Draft Survey Certificates issued by undersigned surveyor / by vessel / by Terminal's surveyor"
  → texto fixo / anexos (fora do escopo de extração).
