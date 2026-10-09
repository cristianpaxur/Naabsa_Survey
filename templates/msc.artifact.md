# MSC source template execution contract

Reference: `C:/Users/CristianPaxur/Downloads/MSC Report - revisado.docx`.
SHA-256: `837c43da11ec830b2d11d26c5a2c2b533c8a7d7a05fc2e5b264a9a933fe7fcd0`.
The reference is retained unchanged. `word/document.xml` is editable in
the source-derived `templates/msc.clean.docx`. Three nonvisual metadata parts
are intentionally sanitized: `docProps/app.xml` loses the stale MSC ZEBRA
Template value; `word/settings.xml` loses its attachedTemplate element;
`word/_rels/settings.xml.rels` loses the associated external relationship
containing the source author's physical file path. Both metadata XML wrappers
are retained, and every unrelated byte in these parts is preserved. The core
title was already empty; `docProps/core.xml` remains untouched.
Every other package payload,
including media, relationships, styles, numbering, custom XML, headers and
footer, must remain byte-identical. Prototype photographs belong to the
template only and must be replaced or removed from actual report output.

The reference rendered as nine pages in
`tmp/video-review-20261009/reference-render/page-1.png` through `page-9.png`.
There are 206 top-level body blocks, 351 body paragraphs and two section
properties. Do not remove padding paragraphs, section properties or breaks
while creating the clean template. There are no body content controls or
body field instructions; the footer retains its existing PAGE field.

Page size: 11906 by 16838 twips. Both sections use top 1418, right 849,
bottom 567, header 709, footer 709 and gutter 0 twips. Left margins are
1134 and 993 respectively. Both use first-page header behavior; the final
section is continuous. Keep all section XML exactly as supplied.

Typography and tables are supplied by the retained OOXML, never reconstructed.
The cover uses Tahoma (title 20 pt vessel, metadata 10/10.5 pt); body roles
use source Calibri/Cambria and inherited named styles. Contents heading uses
SemEspaamento, Tahoma 10 pt, with no centering override. Native list IDs:
TOC 14/16, body main 15, found subsections 33, first photo subsection 35,
remaining photo subsections 32. Their starts produce 1/2/3, 3.1–3.8,
5.1–5.4 and 6 without typed replacement numbers.

Five source tables are retained: contact (grid 4932/4991), persons
(2694/6281), grade comparison (1555/1559/1559/1418/1273), prior attendances
(2460/1785/1785), Time Log (4340/1501/1002/426/957). The Time Log header has
three cells and its Time cell spans three grid columns. All widths, borders,
cell margins, alignments, fills, row rules and paragraph/run properties are
authoritative source geometry.

The cover is source block 13, rId12, inline 5760000 by 4317179 EMU.
Vessel gallery blocks 181/183 have eight prototype photos (rId16–23): six
at 2688000 by 2016000 EMU, two at 2880000 by 2160000 EMU. Engine Room
block185 has six (rId24–29); Survey attendance blocks187–191 has twelve
(rId30–41); ECR block194 has four (rId42–45). These all use the larger
2880000 by 2160000 EMU frame. Each source figure is wp:inline, ordered
left to right in its paragraph. Clone original paragraph/run/drawing patterns
for additional pairs; do not replace the gallery design with a table.

Slot contract: `{field}` text lives in the original w:t nodes. When the source
value crosses runs, `{field:offset:length}` and final `{field:offset:}` retain
the source's exact character distribution, mixed formatting and Word run
metrics. Resolve these using slices of the formatted whole field string;
an omitted final length consumes the remainder. Do not merge source runs.
`surveyed_by`, `surveyed_by_ordinal` and `surveyed_by_role` split an actor such
as 3rd engineer into normal, superscript and normal source runs. Without an
ordinal, put the whole actor in surveyed_by and make the other two empty.
Numeric tags contain numbers only;
original units, including superscript cubic metres, remain separate source
runs. Date month/day/ordinal/year tags retain the source superscript ordinal.
Source date annotations mention Time Log F16/F7; effective builder decision
D007 still fills both cover/survey dates from `berthing_date`. Annotation
maps are source evidence, not authorization to change the app contract.

Remove EE0000 editorial map runs, preserving red numerical historical data
and normalizing its color. Yellow-highlighted FF0000 sludge narrative is real
conditional report content and must be retained with ordinary formatting.
Remove all highlight formatting, and retain each originally blank paragraph.
Vessel example names, dimensions, quantities, times and historical values
must be tags; never copy them into generated real reports. The first contact
company and named representative are editable `contact_manager_company`
and `contact_manager_name` slots. Mapping notes saying keep always are source
annotation evidence and do not authorize fixed report values. The builder
fills the company from explicit input or the existing manager contract, and
uses an em dash for a named representative unless explicitly supplied.
NAABSA institutional identity remains static. The surveyors slot keeps the
previously approved application default and honors an explicit override.

Editable tables carry bookmarks `msc_grade_rows`, `msc_last_attendances`,
and `msc_time_log` in their first header-cell paragraphs. Photo paragraphs
carry `msc_cover` and `msc_photos_vessel`, `msc_photos_engine_room`,
`msc_photos_survey_attendance`, `msc_photos_ecr`; secondary paragraphs
carry the gallery name plus `_2`, etc. Body section headings carry the
existing builder targets `s1`–`s6` and subsection variants. Source contents
page values become `toc_s*` text tokens without changing its labels/dots/pPr.
Conditional source narrative markers are `msc_background_sludge_disposal`,
`msc_background_sludge_rate`, `msc_found_survey`, `msc_sounding_actor`,
`msc_temp_engine_room`, `msc_temp_sea_water`, `msc_records_updated`.

Unsupported source quantities (`sludge_disposed`, `retained_chief`,
`consumption_flowmeter_difference`, `consumption_flowmeter_percentage`)
and historical attendance fields must resolve to an em dash when unavailable.
Retain the application input interface. Source history values have no input
contract and may never be reused as real attendance data.

Fidelity gates: source SHA unchanged; ZIP member names unchanged; every
preserve-only member exact bytes; original drawings/section/table geometry
exact; same body block/paragraph counts; native numbering XML exact; no
annotation text/highlights; no real report output retaining source photo
exemplars or unfilled tags. Render and inspect all final report pages and
compare a template filled with source examples to a sanitized source with
the same content. The builder is responsible for field values, conditional
rows/sections, photographs, pagination and unused prototype-media pruning.

The reproducible builder appends its package inventory, slot examples and
structural verification below; those sections are generated evidence.

Verified 2026-10-09: both `source-sanitized.docx` and
`source-filled-template.docx` exported in a newly owned, hidden Word COM
instance, opened read-only, and closed without saving. Both have nine pages.
Word rendered PDFs were rasterized at 144 DPI using bundled Python and
Poppler. The nine comparisons returned an empty pixel-difference bounding
box on every page (9/9 exact pixels). The latest copy, after contact slots
and template-metadata sanitation, was again exported read-only as
`source-filled-template.contacts.word.pdf`. Its nine pages are pixel-exact
against the original sanitized baseline. Baseline QA images remain under
`word-fidelity-02/a_render`; the latest QA images are under
`word-fidelity-03/b_render`. The prior successful template images remain in
`word-fidelity-02/b_render`. Every distinct
page pattern was visually inspected at original image resolution. The
paragraph padding and source geometry were not altered to obtain equality;
preserving each value's source run fragmentation resolved the differences.
Canonical LibreOffice rendering was replaced by Word's native read-only
export for this fidelity comparison, at the parent agent's direction; no
renderer ever saved back to the retained DOCX or the clean template.
<!-- generated-source-evidence -->

```json
{
  "source_sha256": "837c43da11ec830b2d11d26c5a2c2b533c8a7d7a05fc2e5b264a9a933fe7fcd0",
  "template_sha256": "953bb17bd63576a9c1127dfa7bd2b166b83da148b29d202c798152bb57836056",
  "body_blocks": 206,
  "body_paragraphs": 351,
  "geometry_verified": {
    "section_properties": 2,
    "drawings": 31,
    "table_geometry": 191,
    "numbering_references": 45
  },
  "intentional_metadata_deviations": [
    "Blank docProps/app.xml Template identifying MSC ZEBRA",
    "Remove word/settings.xml attachedTemplate",
    "Remove the related external template relationship containing a physical source-author path; retain its empty relationship part",
    "docProps/core.xml title was already empty and remains byte-identical"
  ],
  "slots": [
    {
      "tag": "voy",
      "part": "word/document.xml",
      "locator": "body[5]"
    },
    {
      "tag": "appointed_service",
      "part": "word/document.xml",
      "locator": "body[8]"
    },
    {
      "tag": "vessel_name:0:6",
      "part": "word/document.xml",
      "locator": "body[9]"
    },
    {
      "tag": "vessel_name:6:5",
      "part": "word/document.xml",
      "locator": "body[9]"
    },
    {
      "tag": "vessel_name:11:",
      "part": "word/document.xml",
      "locator": "body[9]"
    },
    {
      "tag": "flag",
      "part": "word/document.xml",
      "locator": "body[10]"
    },
    {
      "tag": "imo",
      "part": "word/document.xml",
      "locator": "body[10]"
    },
    {
      "tag": "port",
      "part": "word/document.xml",
      "locator": "body[11]"
    },
    {
      "tag": "manager",
      "part": "word/document.xml",
      "locator": "body[84]"
    },
    {
      "tag": "vessel_name:0:4",
      "part": "word/document.xml",
      "locator": "body[85]"
    },
    {
      "tag": "vessel_name:4:",
      "part": "word/document.xml",
      "locator": "body[85]"
    },
    {
      "tag": "flag",
      "part": "word/document.xml",
      "locator": "body[86]"
    },
    {
      "tag": "port_registry",
      "part": "word/document.xml",
      "locator": "body[87]"
    },
    {
      "tag": "call_sign",
      "part": "word/document.xml",
      "locator": "body[88]"
    },
    {
      "tag": "imo:0:1",
      "part": "word/document.xml",
      "locator": "body[89]"
    },
    {
      "tag": "imo:1:",
      "part": "word/document.xml",
      "locator": "body[89]"
    },
    {
      "tag": "type",
      "part": "word/document.xml",
      "locator": "body[90]"
    },
    {
      "tag": "delivered:0:2",
      "part": "word/document.xml",
      "locator": "body[91]"
    },
    {
      "tag": "delivered:2:",
      "part": "word/document.xml",
      "locator": "body[91]"
    },
    {
      "tag": "loa:0:3",
      "part": "word/document.xml",
      "locator": "body[92]"
    },
    {
      "tag": "loa:3:1",
      "part": "word/document.xml",
      "locator": "body[92]"
    },
    {
      "tag": "loa:4:",
      "part": "word/document.xml",
      "locator": "body[92]"
    },
    {
      "tag": "lbp:0:3",
      "part": "word/document.xml",
      "locator": "body[93]"
    },
    {
      "tag": "lbp:3:1",
      "part": "word/document.xml",
      "locator": "body[93]"
    },
    {
      "tag": "lbp:4:",
      "part": "word/document.xml",
      "locator": "body[93]"
    },
    {
      "tag": "breadth:0:1",
      "part": "word/document.xml",
      "locator": "body[94]"
    },
    {
      "tag": "breadth:1:1",
      "part": "word/document.xml",
      "locator": "body[94]"
    },
    {
      "tag": "breadth:2:1",
      "part": "word/document.xml",
      "locator": "body[94]"
    },
    {
      "tag": "breadth:3:1",
      "part": "word/document.xml",
      "locator": "body[94]"
    },
    {
      "tag": "breadth:4:",
      "part": "word/document.xml",
      "locator": "body[94]"
    },
    {
      "tag": "depth:0:1",
      "part": "word/document.xml",
      "locator": "body[95]"
    },
    {
      "tag": "depth:1:1",
      "part": "word/document.xml",
      "locator": "body[95]"
    },
    {
      "tag": "depth:2:1",
      "part": "word/document.xml",
      "locator": "body[95]"
    },
    {
      "tag": "depth:3:",
      "part": "word/document.xml",
      "locator": "body[95]"
    },
    {
      "tag": "net_tonnage:0:2",
      "part": "word/document.xml",
      "locator": "body[96]"
    },
    {
      "tag": "net_tonnage:2:1",
      "part": "word/document.xml",
      "locator": "body[96]"
    },
    {
      "tag": "net_tonnage:3:",
      "part": "word/document.xml",
      "locator": "body[96]"
    },
    {
      "tag": "gross_tonnage:0:2",
      "part": "word/document.xml",
      "locator": "body[97]"
    },
    {
      "tag": "gross_tonnage:2:1",
      "part": "word/document.xml",
      "locator": "body[97]"
    },
    {
      "tag": "gross_tonnage:3:",
      "part": "word/document.xml",
      "locator": "body[97]"
    },
    {
      "tag": "light_ship:0:2",
      "part": "word/document.xml",
      "locator": "body[98]"
    },
    {
      "tag": "light_ship:2:1",
      "part": "word/document.xml",
      "locator": "body[98]"
    },
    {
      "tag": "light_ship:3:",
      "part": "word/document.xml",
      "locator": "body[98]"
    },
    {
      "tag": "vessel_name:0:1",
      "part": "word/document.xml",
      "locator": "body[102]"
    },
    {
      "tag": "vessel_name:1:3",
      "part": "word/document.xml",
      "locator": "body[102]"
    },
    {
      "tag": "vessel_name:4:",
      "part": "word/document.xml",
      "locator": "body[102]"
    },
    {
      "tag": "terminal:0:4",
      "part": "word/document.xml",
      "locator": "body[102]"
    },
    {
      "tag": "terminal:4:",
      "part": "word/document.xml",
      "locator": "body[102]"
    },
    {
      "tag": "surveyed_by",
      "part": "word/document.xml",
      "locator": "body[113]"
    },
    {
      "tag": "surveyed_by_ordinal",
      "part": "word/document.xml",
      "locator": "body[113]"
    },
    {
      "tag": "surveyed_by_role",
      "part": "word/document.xml",
      "locator": "body[113]"
    },
    {
      "tag": "purifier_temp:0:1",
      "part": "word/document.xml",
      "locator": "body[118]"
    },
    {
      "tag": "purifier_temp:1:",
      "part": "word/document.xml",
      "locator": "body[118]"
    },
    {
      "tag": "purifier_flow:0:1",
      "part": "word/document.xml",
      "locator": "body[119]"
    },
    {
      "tag": "purifier_flow:1:3",
      "part": "word/document.xml",
      "locator": "body[119]"
    },
    {
      "tag": "purifier_flow:4:1",
      "part": "word/document.xml",
      "locator": "body[119]"
    },
    {
      "tag": "purifier_flow:5:",
      "part": "word/document.xml",
      "locator": "body[119]"
    },
    {
      "tag": "purifier_bowl_freq:0:1",
      "part": "word/document.xml",
      "locator": "body[120]"
    },
    {
      "tag": "purifier_bowl_freq:1:",
      "part": "word/document.xml",
      "locator": "body[120]"
    },
    {
      "tag": "temp_storage_infrared",
      "part": "word/document.xml",
      "locator": "body[124]"
    },
    {
      "tag": "temp_service",
      "part": "word/document.xml",
      "locator": "body[125]"
    },
    {
      "tag": "temp_do",
      "part": "word/document.xml",
      "locator": "body[126]"
    },
    {
      "tag": "temp_engine_room",
      "part": "word/document.xml",
      "locator": "body[128]"
    },
    {
      "tag": "temp_sea_water:0:1",
      "part": "word/document.xml",
      "locator": "body[129]"
    },
    {
      "tag": "temp_sea_water:1:",
      "part": "word/document.xml",
      "locator": "body[129]"
    },
    {
      "tag": "records_updated_sentence:0:24",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:24:7",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:31:1",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:32:5",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:37:3",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:40:1",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:41:1",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:42:1",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:43:3",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:46:9",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:55:17",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:72:7",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:79:1",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:80:21",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:101:1",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "records_updated_sentence:102:",
      "part": "word/document.xml",
      "locator": "body[142]"
    },
    {
      "tag": "sludge_berthing",
      "part": "word/document.xml",
      "locator": "body[150]"
    },
    {
      "tag": "sludge_surveyor",
      "part": "word/document.xml",
      "locator": "body[151]"
    },
    {
      "tag": "sludge_disposed",
      "part": "word/document.xml",
      "locator": "body[152]"
    },
    {
      "tag": "retained_chief:0:2",
      "part": "word/document.xml",
      "locator": "body[153]"
    },
    {
      "tag": "retained_chief:2:",
      "part": "word/document.xml",
      "locator": "body[153]"
    },
    {
      "tag": "retained_after_discharge:0:1",
      "part": "word/document.xml",
      "locator": "body[153]"
    },
    {
      "tag": "retained_after_discharge:1:1",
      "part": "word/document.xml",
      "locator": "body[153]"
    },
    {
      "tag": "retained_after_discharge:2:",
      "part": "word/document.xml",
      "locator": "body[153]"
    },
    {
      "tag": "retained_after_last_discharge:0:2",
      "part": "word/document.xml",
      "locator": "body[158]"
    },
    {
      "tag": "retained_after_last_discharge:2:1",
      "part": "word/document.xml",
      "locator": "body[158]"
    },
    {
      "tag": "retained_after_last_discharge:3:",
      "part": "word/document.xml",
      "locator": "body[158]"
    },
    {
      "tag": "sludge_generated_chief",
      "part": "word/document.xml",
      "locator": "body[159]"
    },
    {
      "tag": "sludge_generated_surveyor:0:2",
      "part": "word/document.xml",
      "locator": "body[159]"
    },
    {
      "tag": "sludge_generated_surveyor:2:1",
      "part": "word/document.xml",
      "locator": "body[159]"
    },
    {
      "tag": "sludge_generated_surveyor:3:",
      "part": "word/document.xml",
      "locator": "body[159]"
    },
    {
      "tag": "consumption_chief:0:5",
      "part": "word/document.xml",
      "locator": "body[160]"
    },
    {
      "tag": "consumption_chief:5:",
      "part": "word/document.xml",
      "locator": "body[160]"
    },
    {
      "tag": "consumption_surveyor",
      "part": "word/document.xml",
      "locator": "body[160]"
    },
    {
      "tag": "sludge_rate_chief:0:2",
      "part": "word/document.xml",
      "locator": "body[161]"
    },
    {
      "tag": "sludge_rate_chief:2:",
      "part": "word/document.xml",
      "locator": "body[161]"
    },
    {
      "tag": "sludge_rate_surveyor",
      "part": "word/document.xml",
      "locator": "body[161]"
    },
    {
      "tag": "flowmeter_logbook_total",
      "part": "word/document.xml",
      "locator": "body[168]"
    },
    {
      "tag": "flowmeter_soundings:0:3",
      "part": "word/document.xml",
      "locator": "body[168]"
    },
    {
      "tag": "flowmeter_soundings:3:",
      "part": "word/document.xml",
      "locator": "body[168]"
    },
    {
      "tag": "flowmeter_total",
      "part": "word/document.xml",
      "locator": "body[169]"
    },
    {
      "tag": "flowmeter_total",
      "part": "word/document.xml",
      "locator": "body[169]"
    },
    {
      "tag": "flowmeter_difference",
      "part": "word/document.xml",
      "locator": "body[170]"
    },
    {
      "tag": "flowmeter_accuracy:0:2",
      "part": "word/document.xml",
      "locator": "body[170]"
    },
    {
      "tag": "flowmeter_accuracy:2:1",
      "part": "word/document.xml",
      "locator": "body[170]"
    },
    {
      "tag": "flowmeter_accuracy:3:",
      "part": "word/document.xml",
      "locator": "body[170]"
    },
    {
      "tag": "consumption_flowmeter_difference",
      "part": "word/document.xml",
      "locator": "body[170]"
    },
    {
      "tag": "consumption_flowmeter_percentage",
      "part": "word/document.xml",
      "locator": "body[170]"
    },
    {
      "tag": "cover_date_month",
      "part": "word/document.xml",
      "locator": "body[11]"
    },
    {
      "tag": "cover_date_day",
      "part": "word/document.xml",
      "locator": "body[11]"
    },
    {
      "tag": "cover_date_ordinal",
      "part": "word/document.xml",
      "locator": "body[11]"
    },
    {
      "tag": "cover_date_year:0:3",
      "part": "word/document.xml",
      "locator": "body[11]"
    },
    {
      "tag": "cover_date_year:3:",
      "part": "word/document.xml",
      "locator": "body[11]"
    },
    {
      "tag": "survey_date_month",
      "part": "word/document.xml",
      "locator": "body[110]"
    },
    {
      "tag": "survey_date_day",
      "part": "word/document.xml",
      "locator": "body[110]"
    },
    {
      "tag": "survey_date_ordinal",
      "part": "word/document.xml",
      "locator": "body[110]"
    },
    {
      "tag": "survey_date_year:0:3",
      "part": "word/document.xml",
      "locator": "body[110]"
    },
    {
      "tag": "survey_date_year:3:",
      "part": "word/document.xml",
      "locator": "body[110]"
    },
    {
      "tag": "last_discharge_date_month",
      "part": "word/document.xml",
      "locator": "body[157]"
    },
    {
      "tag": "last_discharge_date_day:0:1",
      "part": "word/document.xml",
      "locator": "body[157]"
    },
    {
      "tag": "last_discharge_date_day:1:",
      "part": "word/document.xml",
      "locator": "body[157]"
    },
    {
      "tag": "last_discharge_date_ordinal",
      "part": "word/document.xml",
      "locator": "body[157]"
    },
    {
      "tag": "last_discharge_date_year:0:3",
      "part": "word/document.xml",
      "locator": "body[157]"
    },
    {
      "tag": "last_discharge_date_year:3:",
      "part": "word/document.xml",
      "locator": "body[157]"
    },
    {
      "tag": "survey_date_month:0:2",
      "part": "word/document.xml",
      "locator": "body[157]"
    },
    {
      "tag": "survey_date_month:2:",
      "part": "word/document.xml",
      "locator": "body[157]"
    },
    {
      "tag": "survey_date_day",
      "part": "word/document.xml",
      "locator": "body[157]"
    },
    {
      "tag": "survey_date_ordinal",
      "part": "word/document.xml",
      "locator": "body[157]"
    },
    {
      "tag": "survey_date_year:0:3",
      "part": "word/document.xml",
      "locator": "body[157]"
    },
    {
      "tag": "survey_date_year:3:",
      "part": "word/document.xml",
      "locator": "body[157]"
    },
    {
      "tag": "vessel_name:0:4",
      "part": "word/document.xml",
      "locator": "body[21]/tr[2]/tc[1]"
    },
    {
      "tag": "vessel_name:4:",
      "part": "word/document.xml",
      "locator": "body[21]/tr[2]/tc[1]"
    },
    {
      "tag": "captain",
      "part": "word/document.xml",
      "locator": "body[21]/tr[2]/tc[1]"
    },
    {
      "tag": "chief_engineer",
      "part": "word/document.xml",
      "locator": "body[21]/tr[2]/tc[1]"
    },
    {
      "tag": "surveyors",
      "part": "word/document.xml",
      "locator": "body[21]/tr[1]/tc[1]"
    },
    {
      "tag": "contact_manager_company",
      "part": "word/document.xml",
      "locator": "body[21]/tr[0]/tc[1]"
    },
    {
      "tag": "contact_manager_name",
      "part": "word/document.xml",
      "locator": "body[21]/tr[0]/tc[1]"
    },
    {
      "tag": "toc_s1",
      "part": "word/document.xml",
      "locator": "body[26]"
    },
    {
      "tag": "toc_s2",
      "part": "word/document.xml",
      "locator": "body[27]"
    },
    {
      "tag": "toc_s3",
      "part": "word/document.xml",
      "locator": "body[28]"
    },
    {
      "tag": "toc_s3_1",
      "part": "word/document.xml",
      "locator": "body[29]"
    },
    {
      "tag": "toc_s3_2",
      "part": "word/document.xml",
      "locator": "body[30]"
    },
    {
      "tag": "toc_s3_3",
      "part": "word/document.xml",
      "locator": "body[31]"
    },
    {
      "tag": "toc_s3_4",
      "part": "word/document.xml",
      "locator": "body[32]"
    },
    {
      "tag": "toc_s3_5",
      "part": "word/document.xml",
      "locator": "body[33]"
    },
    {
      "tag": "toc_s3_6",
      "part": "word/document.xml",
      "locator": "body[34]"
    },
    {
      "tag": "toc_s3_7",
      "part": "word/document.xml",
      "locator": "body[35]"
    },
    {
      "tag": "toc_s3_8",
      "part": "word/document.xml",
      "locator": "body[36]"
    },
    {
      "tag": "toc_s4",
      "part": "word/document.xml",
      "locator": "body[37]"
    },
    {
      "tag": "toc_s5",
      "part": "word/document.xml",
      "locator": "body[38]"
    },
    {
      "tag": "toc_s5_1",
      "part": "word/document.xml",
      "locator": "body[39]"
    },
    {
      "tag": "toc_s5_2",
      "part": "word/document.xml",
      "locator": "body[40]"
    },
    {
      "tag": "toc_s5_3",
      "part": "word/document.xml",
      "locator": "body[41]"
    },
    {
      "tag": "toc_s5_4",
      "part": "word/document.xml",
      "locator": "body[42]"
    },
    {
      "tag": "toc_s6",
      "part": "word/document.xml",
      "locator": "body[43]"
    },
    {
      "tag": "grade_1:0:8",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[0]"
    },
    {
      "tag": "grade_1:8:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[0]"
    },
    {
      "tag": "grade_1:9:",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[0]"
    },
    {
      "tag": "grade_1_surveyor",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[1]"
    },
    {
      "tag": "grade_1_vrs",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[2]"
    },
    {
      "tag": "grade_1_difference:0:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[3]"
    },
    {
      "tag": "grade_1_difference:1:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[3]"
    },
    {
      "tag": "grade_1_difference:2:2",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[3]"
    },
    {
      "tag": "grade_1_difference:4:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[3]"
    },
    {
      "tag": "grade_1_difference:5:",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[3]"
    },
    {
      "tag": "grade_1_percentage:0:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[4]"
    },
    {
      "tag": "grade_1_percentage:1:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[4]"
    },
    {
      "tag": "grade_1_percentage:2:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[4]"
    },
    {
      "tag": "grade_1_percentage:3:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[4]"
    },
    {
      "tag": "grade_1_percentage:4:",
      "part": "word/document.xml",
      "locator": "body[144]/tr[1]/tc[4]"
    },
    {
      "tag": "grade_2",
      "part": "word/document.xml",
      "locator": "body[144]/tr[2]/tc[0]"
    },
    {
      "tag": "grade_2_surveyor",
      "part": "word/document.xml",
      "locator": "body[144]/tr[2]/tc[1]"
    },
    {
      "tag": "grade_2_vrs",
      "part": "word/document.xml",
      "locator": "body[144]/tr[2]/tc[2]"
    },
    {
      "tag": "grade_2_difference:0:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[2]/tc[3]"
    },
    {
      "tag": "grade_2_difference:1:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[2]/tc[3]"
    },
    {
      "tag": "grade_2_difference:2:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[2]/tc[3]"
    },
    {
      "tag": "grade_2_difference:3:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[2]/tc[3]"
    },
    {
      "tag": "grade_2_difference:4:",
      "part": "word/document.xml",
      "locator": "body[144]/tr[2]/tc[3]"
    },
    {
      "tag": "grade_2_percentage:0:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[2]/tc[4]"
    },
    {
      "tag": "grade_2_percentage:1:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[2]/tc[4]"
    },
    {
      "tag": "grade_2_percentage:2:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[2]/tc[4]"
    },
    {
      "tag": "grade_2_percentage:3:1",
      "part": "word/document.xml",
      "locator": "body[144]/tr[2]/tc[4]"
    },
    {
      "tag": "grade_2_percentage:4:",
      "part": "word/document.xml",
      "locator": "body[144]/tr[2]/tc[4]"
    },
    {
      "tag": "grade_3",
      "part": "word/document.xml",
      "locator": "body[144]/tr[3]/tc[0]"
    },
    {
      "tag": "grade_3_surveyor",
      "part": "word/document.xml",
      "locator": "body[144]/tr[3]/tc[1]"
    },
    {
      "tag": "grade_3_vrs",
      "part": "word/document.xml",
      "locator": "body[144]/tr[3]/tc[2]"
    },
    {
      "tag": "grade_3_difference",
      "part": "word/document.xml",
      "locator": "body[144]/tr[3]/tc[3]"
    },
    {
      "tag": "grade_3_percentage",
      "part": "word/document.xml",
      "locator": "body[144]/tr[3]/tc[4]"
    },
    {
      "tag": "grade_4",
      "part": "word/document.xml",
      "locator": "body[144]/tr[4]/tc[0]"
    },
    {
      "tag": "grade_4_surveyor",
      "part": "word/document.xml",
      "locator": "body[144]/tr[4]/tc[1]"
    },
    {
      "tag": "grade_4_vrs",
      "part": "word/document.xml",
      "locator": "body[144]/tr[4]/tc[2]"
    },
    {
      "tag": "grade_4_difference",
      "part": "word/document.xml",
      "locator": "body[144]/tr[4]/tc[3]"
    },
    {
      "tag": "grade_4_percentage",
      "part": "word/document.xml",
      "locator": "body[144]/tr[4]/tc[4]"
    },
    {
      "tag": "last_attendance_1_date:0:1",
      "part": "word/document.xml",
      "locator": "body[174]/tr[0]/tc[1]"
    },
    {
      "tag": "last_attendance_1_date:1:6",
      "part": "word/document.xml",
      "locator": "body[174]/tr[0]/tc[1]"
    },
    {
      "tag": "last_attendance_1_date:7:2",
      "part": "word/document.xml",
      "locator": "body[174]/tr[0]/tc[1]"
    },
    {
      "tag": "last_attendance_1_date:9:1",
      "part": "word/document.xml",
      "locator": "body[174]/tr[0]/tc[1]"
    },
    {
      "tag": "last_attendance_1_date:10:5",
      "part": "word/document.xml",
      "locator": "body[174]/tr[0]/tc[1]"
    },
    {
      "tag": "last_attendance_1_date:15:",
      "part": "word/document.xml",
      "locator": "body[174]/tr[0]/tc[1]"
    },
    {
      "tag": "last_attendance_2_date:0:5",
      "part": "word/document.xml",
      "locator": "body[174]/tr[0]/tc[2]"
    },
    {
      "tag": "last_attendance_2_date:5:",
      "part": "word/document.xml",
      "locator": "body[174]/tr[0]/tc[2]"
    },
    {
      "tag": "last_attendance_1_grade_1_surveyor",
      "part": "word/document.xml",
      "locator": "body[174]/tr[1]/tc[1]"
    },
    {
      "tag": "last_attendance_2_grade_1_surveyor",
      "part": "word/document.xml",
      "locator": "body[174]/tr[1]/tc[2]"
    },
    {
      "tag": "last_attendance_1_grade_1_vrs",
      "part": "word/document.xml",
      "locator": "body[174]/tr[2]/tc[1]"
    },
    {
      "tag": "last_attendance_2_grade_1_vrs:0:6",
      "part": "word/document.xml",
      "locator": "body[174]/tr[2]/tc[2]"
    },
    {
      "tag": "last_attendance_2_grade_1_vrs:6:",
      "part": "word/document.xml",
      "locator": "body[174]/tr[2]/tc[2]"
    },
    {
      "tag": "last_attendance_1_grade_1_difference",
      "part": "word/document.xml",
      "locator": "body[174]/tr[3]/tc[1]"
    },
    {
      "tag": "last_attendance_2_grade_1_difference",
      "part": "word/document.xml",
      "locator": "body[174]/tr[3]/tc[2]"
    },
    {
      "tag": "last_attendance_1_grade_3_surveyor",
      "part": "word/document.xml",
      "locator": "body[174]/tr[4]/tc[1]"
    },
    {
      "tag": "last_attendance_2_grade_3_surveyor",
      "part": "word/document.xml",
      "locator": "body[174]/tr[4]/tc[2]"
    },
    {
      "tag": "last_attendance_1_grade_3_vrs",
      "part": "word/document.xml",
      "locator": "body[174]/tr[5]/tc[1]"
    },
    {
      "tag": "last_attendance_2_grade_3_vrs",
      "part": "word/document.xml",
      "locator": "body[174]/tr[5]/tc[2]"
    },
    {
      "tag": "last_attendance_1_grade_3_difference",
      "part": "word/document.xml",
      "locator": "body[174]/tr[6]/tc[1]"
    },
    {
      "tag": "last_attendance_2_grade_3_difference",
      "part": "word/document.xml",
      "locator": "body[174]/tr[6]/tc[2]"
    },
    {
      "tag": "last_attendance_1_sludge_surveyor",
      "part": "word/document.xml",
      "locator": "body[174]/tr[7]/tc[1]"
    },
    {
      "tag": "last_attendance_2_sludge_surveyor",
      "part": "word/document.xml",
      "locator": "body[174]/tr[7]/tc[2]"
    },
    {
      "tag": "last_attendance_1_sludge_berthing",
      "part": "word/document.xml",
      "locator": "body[174]/tr[8]/tc[1]"
    },
    {
      "tag": "last_attendance_2_sludge_berthing",
      "part": "word/document.xml",
      "locator": "body[174]/tr[8]/tc[2]"
    },
    {
      "tag": "last_attendance_1_sludge_difference",
      "part": "word/document.xml",
      "locator": "body[174]/tr[9]/tc[1]"
    },
    {
      "tag": "last_attendance_2_sludge_difference",
      "part": "word/document.xml",
      "locator": "body[174]/tr[9]/tc[2]"
    },
    {
      "tag": "last_attendance_1_sludge_disposed",
      "part": "word/document.xml",
      "locator": "body[174]/tr[10]/tc[1]"
    },
    {
      "tag": "last_attendance_2_sludge_disposed",
      "part": "word/document.xml",
      "locator": "body[174]/tr[10]/tc[2]"
    },
    {
      "tag": "last_attendance_1_consumption_chief",
      "part": "word/document.xml",
      "locator": "body[174]/tr[11]/tc[1]"
    },
    {
      "tag": "last_attendance_2_consumption_chief",
      "part": "word/document.xml",
      "locator": "body[174]/tr[11]/tc[2]"
    },
    {
      "tag": "last_attendance_1_flowmeter_total",
      "part": "word/document.xml",
      "locator": "body[174]/tr[12]/tc[1]"
    },
    {
      "tag": "last_attendance_2_flowmeter_total",
      "part": "word/document.xml",
      "locator": "body[174]/tr[12]/tc[2]"
    },
    {
      "tag": "last_attendance_1_flowmeter_difference",
      "part": "word/document.xml",
      "locator": "body[174]/tr[13]/tc[1]"
    },
    {
      "tag": "last_attendance_2_flowmeter_difference",
      "part": "word/document.xml",
      "locator": "body[174]/tr[13]/tc[2]"
    },
    {
      "tag": "last_attendance_1_sludge_generated_chief",
      "part": "word/document.xml",
      "locator": "body[174]/tr[14]/tc[1]"
    },
    {
      "tag": "last_attendance_2_sludge_generated_chief",
      "part": "word/document.xml",
      "locator": "body[174]/tr[14]/tc[2]"
    },
    {
      "tag": "last_attendance_1_sludge_rate_chief",
      "part": "word/document.xml",
      "locator": "body[174]/tr[15]/tc[1]"
    },
    {
      "tag": "last_attendance_2_sludge_rate_chief",
      "part": "word/document.xml",
      "locator": "body[174]/tr[15]/tc[2]"
    },
    {
      "tag": "time_log_1_event",
      "part": "word/document.xml",
      "locator": "body[176]/tr[1]/tc[0]"
    },
    {
      "tag": "time_log_1_date:0:10",
      "part": "word/document.xml",
      "locator": "body[176]/tr[1]/tc[1]"
    },
    {
      "tag": "time_log_1_date:10:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[1]/tc[1]"
    },
    {
      "tag": "time_log_1_start:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[1]/tc[2]"
    },
    {
      "tag": "time_log_1_start:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[1]/tc[2]"
    },
    {
      "tag": "time_log_1_flag",
      "part": "word/document.xml",
      "locator": "body[176]/tr[1]/tc[3]"
    },
    {
      "tag": "time_log_1_end",
      "part": "word/document.xml",
      "locator": "body[176]/tr[1]/tc[4]"
    },
    {
      "tag": "time_log_2_event",
      "part": "word/document.xml",
      "locator": "body[176]/tr[2]/tc[0]"
    },
    {
      "tag": "time_log_2_date:0:10",
      "part": "word/document.xml",
      "locator": "body[176]/tr[2]/tc[1]"
    },
    {
      "tag": "time_log_2_date:10:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[2]/tc[1]"
    },
    {
      "tag": "time_log_2_start:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[2]/tc[2]"
    },
    {
      "tag": "time_log_2_start:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[2]/tc[2]"
    },
    {
      "tag": "time_log_2_flag",
      "part": "word/document.xml",
      "locator": "body[176]/tr[2]/tc[3]"
    },
    {
      "tag": "time_log_2_end",
      "part": "word/document.xml",
      "locator": "body[176]/tr[2]/tc[4]"
    },
    {
      "tag": "time_log_3_event",
      "part": "word/document.xml",
      "locator": "body[176]/tr[3]/tc[0]"
    },
    {
      "tag": "time_log_3_date",
      "part": "word/document.xml",
      "locator": "body[176]/tr[3]/tc[1]"
    },
    {
      "tag": "time_log_3_start:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[3]/tc[2]"
    },
    {
      "tag": "time_log_3_start:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[3]/tc[2]"
    },
    {
      "tag": "time_log_3_flag",
      "part": "word/document.xml",
      "locator": "body[176]/tr[3]/tc[3]"
    },
    {
      "tag": "time_log_3_end",
      "part": "word/document.xml",
      "locator": "body[176]/tr[3]/tc[4]"
    },
    {
      "tag": "time_log_4_event",
      "part": "word/document.xml",
      "locator": "body[176]/tr[4]/tc[0]"
    },
    {
      "tag": "time_log_4_date:0:10",
      "part": "word/document.xml",
      "locator": "body[176]/tr[4]/tc[1]"
    },
    {
      "tag": "time_log_4_date:10:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[4]/tc[1]"
    },
    {
      "tag": "time_log_4_start:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[4]/tc[2]"
    },
    {
      "tag": "time_log_4_start:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[4]/tc[2]"
    },
    {
      "tag": "time_log_4_flag",
      "part": "word/document.xml",
      "locator": "body[176]/tr[4]/tc[3]"
    },
    {
      "tag": "time_log_4_end:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[4]/tc[4]"
    },
    {
      "tag": "time_log_4_end:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[4]/tc[4]"
    },
    {
      "tag": "time_log_5_event",
      "part": "word/document.xml",
      "locator": "body[176]/tr[5]/tc[0]"
    },
    {
      "tag": "time_log_5_date:0:10",
      "part": "word/document.xml",
      "locator": "body[176]/tr[5]/tc[1]"
    },
    {
      "tag": "time_log_5_date:10:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[5]/tc[1]"
    },
    {
      "tag": "time_log_5_start:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[5]/tc[2]"
    },
    {
      "tag": "time_log_5_start:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[5]/tc[2]"
    },
    {
      "tag": "time_log_5_flag",
      "part": "word/document.xml",
      "locator": "body[176]/tr[5]/tc[3]"
    },
    {
      "tag": "time_log_5_end:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[5]/tc[4]"
    },
    {
      "tag": "time_log_5_end:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[5]/tc[4]"
    },
    {
      "tag": "time_log_6_event",
      "part": "word/document.xml",
      "locator": "body[176]/tr[6]/tc[0]"
    },
    {
      "tag": "time_log_6_date:0:10",
      "part": "word/document.xml",
      "locator": "body[176]/tr[6]/tc[1]"
    },
    {
      "tag": "time_log_6_date:10:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[6]/tc[1]"
    },
    {
      "tag": "time_log_6_start:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[6]/tc[2]"
    },
    {
      "tag": "time_log_6_start:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[6]/tc[2]"
    },
    {
      "tag": "time_log_6_flag",
      "part": "word/document.xml",
      "locator": "body[176]/tr[6]/tc[3]"
    },
    {
      "tag": "time_log_6_end",
      "part": "word/document.xml",
      "locator": "body[176]/tr[6]/tc[4]"
    },
    {
      "tag": "time_log_7_event:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[7]/tc[0]"
    },
    {
      "tag": "time_log_7_event:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[7]/tc[0]"
    },
    {
      "tag": "time_log_7_date:0:10",
      "part": "word/document.xml",
      "locator": "body[176]/tr[7]/tc[1]"
    },
    {
      "tag": "time_log_7_date:10:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[7]/tc[1]"
    },
    {
      "tag": "time_log_7_start:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[7]/tc[2]"
    },
    {
      "tag": "time_log_7_start:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[7]/tc[2]"
    },
    {
      "tag": "time_log_7_flag",
      "part": "word/document.xml",
      "locator": "body[176]/tr[7]/tc[3]"
    },
    {
      "tag": "time_log_7_end",
      "part": "word/document.xml",
      "locator": "body[176]/tr[7]/tc[4]"
    },
    {
      "tag": "time_log_8_event",
      "part": "word/document.xml",
      "locator": "body[176]/tr[8]/tc[0]"
    },
    {
      "tag": "time_log_8_date:0:10",
      "part": "word/document.xml",
      "locator": "body[176]/tr[8]/tc[1]"
    },
    {
      "tag": "time_log_8_date:10:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[8]/tc[1]"
    },
    {
      "tag": "time_log_8_start:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[8]/tc[2]"
    },
    {
      "tag": "time_log_8_start:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[8]/tc[2]"
    },
    {
      "tag": "time_log_8_flag",
      "part": "word/document.xml",
      "locator": "body[176]/tr[8]/tc[3]"
    },
    {
      "tag": "time_log_8_end:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[8]/tc[4]"
    },
    {
      "tag": "time_log_8_end:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[8]/tc[4]"
    },
    {
      "tag": "time_log_9_event",
      "part": "word/document.xml",
      "locator": "body[176]/tr[9]/tc[0]"
    },
    {
      "tag": "time_log_9_date:0:10",
      "part": "word/document.xml",
      "locator": "body[176]/tr[9]/tc[1]"
    },
    {
      "tag": "time_log_9_date:10:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[9]/tc[1]"
    },
    {
      "tag": "time_log_9_start:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[9]/tc[2]"
    },
    {
      "tag": "time_log_9_start:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[9]/tc[2]"
    },
    {
      "tag": "time_log_9_flag",
      "part": "word/document.xml",
      "locator": "body[176]/tr[9]/tc[3]"
    },
    {
      "tag": "time_log_9_end:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[9]/tc[4]"
    },
    {
      "tag": "time_log_9_end:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[9]/tc[4]"
    },
    {
      "tag": "time_log_10_event",
      "part": "word/document.xml",
      "locator": "body[176]/tr[10]/tc[0]"
    },
    {
      "tag": "time_log_10_date:0:10",
      "part": "word/document.xml",
      "locator": "body[176]/tr[10]/tc[1]"
    },
    {
      "tag": "time_log_10_date:10:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[10]/tc[1]"
    },
    {
      "tag": "time_log_10_start:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[10]/tc[2]"
    },
    {
      "tag": "time_log_10_start:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[10]/tc[2]"
    },
    {
      "tag": "time_log_10_flag",
      "part": "word/document.xml",
      "locator": "body[176]/tr[10]/tc[3]"
    },
    {
      "tag": "time_log_10_end:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[10]/tc[4]"
    },
    {
      "tag": "time_log_10_end:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[10]/tc[4]"
    },
    {
      "tag": "time_log_11_event",
      "part": "word/document.xml",
      "locator": "body[176]/tr[11]/tc[0]"
    },
    {
      "tag": "time_log_11_date:0:10",
      "part": "word/document.xml",
      "locator": "body[176]/tr[11]/tc[1]"
    },
    {
      "tag": "time_log_11_date:10:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[11]/tc[1]"
    },
    {
      "tag": "time_log_11_start:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[11]/tc[2]"
    },
    {
      "tag": "time_log_11_start:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[11]/tc[2]"
    },
    {
      "tag": "time_log_11_flag",
      "part": "word/document.xml",
      "locator": "body[176]/tr[11]/tc[3]"
    },
    {
      "tag": "time_log_11_end",
      "part": "word/document.xml",
      "locator": "body[176]/tr[11]/tc[4]"
    },
    {
      "tag": "time_log_12_event",
      "part": "word/document.xml",
      "locator": "body[176]/tr[12]/tc[0]"
    },
    {
      "tag": "time_log_12_date:0:10",
      "part": "word/document.xml",
      "locator": "body[176]/tr[12]/tc[1]"
    },
    {
      "tag": "time_log_12_date:10:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[12]/tc[1]"
    },
    {
      "tag": "time_log_12_start:0:5",
      "part": "word/document.xml",
      "locator": "body[176]/tr[12]/tc[2]"
    },
    {
      "tag": "time_log_12_start:5:",
      "part": "word/document.xml",
      "locator": "body[176]/tr[12]/tc[2]"
    },
    {
      "tag": "time_log_12_flag",
      "part": "word/document.xml",
      "locator": "body[176]/tr[12]/tc[3]"
    },
    {
      "tag": "time_log_12_end",
      "part": "word/document.xml",
      "locator": "body[176]/tr[12]/tc[4]"
    }
  ],
  "examples": {
    "voy": "616 S",
    "appointed_service": "ROB + Sludge Survey",
    "vessel_name": "MSC YAMUNA VI",
    "flag": "Portugal",
    "imo": "9288409",
    "port": "Paranagua",
    "manager": "MSC SHIPMANAGEMENT LTD",
    "port_registry": "Madeira",
    "call_sign": "CRXT",
    "type": "Container carrier",
    "delivered": "2004",
    "loa": "280.54",
    "lbp": "262.00",
    "breadth": "40.00",
    "depth": "24.00",
    "net_tonnage": "25,614",
    "gross_tonnage": "66,462",
    "light_ship": "24,241",
    "terminal": "TCP PARANAGUA",
    "surveyed_by": "3",
    "surveyed_by_ordinal": "rd",
    "surveyed_by_role": " engineer",
    "purifier_temp": "98",
    "purifier_flow": "1 x 3,0",
    "purifier_bowl_freq": "60",
    "temp_storage_infrared": "Infrared thermometer",
    "temp_service": "Glass thermometer fixed outside tanks",
    "temp_do": "Infrared thermometer",
    "temp_engine_room": "28",
    "temp_sea_water": "21",
    "records_updated_sentence": "After calculations, the logbook  and VRS  were updated according to the figures disclosed by surveyor: ",
    "sludge_berthing": "33.04",
    "sludge_surveyor": "32.95",
    "sludge_disposed": "28.73",
    "retained_chief": "4.22",
    "retained_after_discharge": "4.31",
    "retained_after_last_discharge": "3,40",
    "sludge_generated_chief": "29.55",
    "sludge_generated_surveyor": "28.73",
    "consumption_chief": "1,021.460",
    "consumption_surveyor": "947.665",
    "sludge_rate_chief": "2,893",
    "sludge_rate_surveyor": "3,128",
    "flowmeter_logbook_total": "1,021.460",
    "flowmeter_soundings": "981.008",
    "flowmeter_total": "1,689.099",
    "flowmeter_difference": "667.639",
    "flowmeter_accuracy": "39.5",
    "consumption_flowmeter_difference": "708.091",
    "consumption_flowmeter_percentage": "41.9",
    "cover_date_month": "May",
    "cover_date_day": "21",
    "cover_date_ordinal": "st",
    "cover_date_year": "2026",
    "survey_date_month": "May",
    "survey_date_day": "21",
    "survey_date_ordinal": "st",
    "survey_date_year": "2026",
    "last_discharge_date_month": "March",
    "last_discharge_date_day": "28",
    "last_discharge_date_ordinal": "th",
    "last_discharge_date_year": "2026",
    "captain": "XXXXXXX",
    "chief_engineer": "XXXXXX",
    "surveyors": "Mr. Wagner de Abreu",
    "contact_manager_company": "Mediterranean Shipping Company S.A.",
    "contact_manager_name": "Capt. Robert Masse",
    "toc_s1": "3",
    "toc_s2": "3",
    "toc_s3": "3",
    "toc_s3_1": "3",
    "toc_s3_2": "3",
    "toc_s3_3": "4",
    "toc_s3_4": "4",
    "toc_s3_5": "4",
    "toc_s3_6": "4",
    "toc_s3_7": "4",
    "toc_s3_8": "4",
    "toc_s4": "5",
    "toc_s5": "5",
    "toc_s5_1": "5",
    "toc_s5_2": "6",
    "toc_s5_3": "7",
    "toc_s5_4": "8",
    "toc_s6": "9",
    "grade_1": "RESIDUAL HS",
    "grade_1_surveyor": "3,694.596",
    "grade_1_vrs": "3,662.520",
    "grade_1_difference": "+ 32.076",
    "grade_1_percentage": "+ 0,876",
    "grade_2": "RESIDUAL VLS",
    "grade_2_surveyor": "492.072",
    "grade_2_vrs": "483.690",
    "grade_2_difference": "+ 8.382",
    "grade_2_percentage": "+ 1,733",
    "grade_3": "DISTILLATES",
    "grade_3_surveyor": "1,000.000",
    "grade_3_vrs": "1,000.000",
    "grade_3_difference": "10.00",
    "grade_3_percentage": "0,10",
    "grade_4": "LNG",
    "grade_4_surveyor": "1,000.000",
    "grade_4_vrs": "1,000.000",
    "grade_4_difference": "10.00",
    "grade_4_percentage": "0,10",
    "last_attendance_1_date": "October 21, 2026",
    "last_attendance_2_date": "March 28, 2026",
    "last_attendance_1_grade_1_surveyor": "3,651.335",
    "last_attendance_2_grade_1_surveyor": "2,234.114",
    "last_attendance_1_grade_1_vrs": "3,619.330",
    "last_attendance_2_grade_1_vrs": "2,310.250",
    "last_attendance_1_grade_1_difference": "+ 32.005",
    "last_attendance_2_grade_1_difference": "- 76.136",
    "last_attendance_1_grade_3_surveyor": "403.328",
    "last_attendance_2_grade_3_surveyor": "550.494",
    "last_attendance_1_grade_3_vrs": "396.670",
    "last_attendance_2_grade_3_vrs": "553.890",
    "last_attendance_1_grade_3_difference": "+ 6.658",
    "last_attendance_2_grade_3_difference": "- 3.396",
    "last_attendance_1_sludge_surveyor": "70.22",
    "last_attendance_2_sludge_surveyor": "4.63",
    "last_attendance_1_sludge_berthing": "68.50",
    "last_attendance_2_sludge_berthing": "5.30",
    "last_attendance_1_sludge_difference": "+ 10.55",
    "last_attendance_2_sludge_difference": "0.67",
    "last_attendance_1_sludge_disposed": "45.51",
    "last_attendance_2_sludge_disposed": "193.00",
    "last_attendance_1_consumption_chief": "2,904.830",
    "last_attendance_2_consumption_chief": "79.54",
    "last_attendance_1_flowmeter_total": "2,450.857",
    "last_attendance_2_flowmeter_total": "218.575",
    "last_attendance_1_flowmeter_difference": "356.027",
    "last_attendance_2_flowmeter_difference": "139.215",
    "last_attendance_1_sludge_generated_chief": "52.47",
    "last_attendance_2_sludge_generated_chief": "1.6",
    "last_attendance_1_sludge_rate_chief": "2.505",
    "last_attendance_2_sludge_rate_chief": "2.014",
    "time_log_1_event": "Surveyor arrived at terminal",
    "time_log_1_date": "15/06/2026 ",
    "time_log_1_start": "12:00 ",
    "time_log_1_flag": "",
    "time_log_1_end": "",
    "time_log_2_event": "Surveyor authorized by Terminal to board vessel",
    "time_log_2_date": "15/06/2026 ",
    "time_log_2_start": "12:20 ",
    "time_log_2_flag": "",
    "time_log_2_end": "",
    "time_log_3_event": "Surveyor on board            ",
    "time_log_3_date": "15/06/2026",
    "time_log_3_start": "12:30 ",
    "time_log_3_flag": "",
    "time_log_3_end": "",
    "time_log_4_event": "Key meeting",
    "time_log_4_date": "15/06/2026 ",
    "time_log_4_start": "12:23 ",
    "time_log_4_flag": "X",
    "time_log_4_end": "12:40 ",
    "time_log_5_event": "Opening soundings",
    "time_log_5_date": "15/06/2026 ",
    "time_log_5_start": "12:40 ",
    "time_log_5_flag": "X",
    "time_log_5_end": "13:00 ",
    "time_log_6_event": "Trucks arrived",
    "time_log_6_date": "15/06/2026 ",
    "time_log_6_start": "12:20 ",
    "time_log_6_flag": "",
    "time_log_6_end": "",
    "time_log_7_event": "Hose conected",
    "time_log_7_date": "15/06/2026 ",
    "time_log_7_start": "12:50 ",
    "time_log_7_flag": "",
    "time_log_7_end": "",
    "time_log_8_event": "Pumping operation     ",
    "time_log_8_date": "15/06/2026 ",
    "time_log_8_start": "13:00 ",
    "time_log_8_flag": "X",
    "time_log_8_end": "16:00 ",
    "time_log_9_event": "Closing soundings",
    "time_log_9_date": "15/06/2026 ",
    "time_log_9_start": "16:05 ",
    "time_log_9_flag": "X",
    "time_log_9_end": "16:40 ",
    "time_log_10_event": "Calculation",
    "time_log_10_date": "15/06/2026 ",
    "time_log_10_start": "16:40 ",
    "time_log_10_flag": "X",
    "time_log_10_end": "17:00 ",
    "time_log_11_event": "Documents signed",
    "time_log_11_date": "15/06/2026 ",
    "time_log_11_start": "17:10 ",
    "time_log_11_flag": "",
    "time_log_11_end": "",
    "time_log_12_event": "Surveyor left board",
    "time_log_12_date": "15/06/2026 ",
    "time_log_12_start": "17:15 ",
    "time_log_12_flag": "",
    "time_log_12_end": ""
  },
  "fragment_examples": {
    "vessel_name:0:6": "MSC YA",
    "vessel_name:6:5": "MUNA ",
    "vessel_name:11:": "VI",
    "vessel_name:0:4": "MSC ",
    "vessel_name:4:": "YAMUNA VI",
    "imo:0:1": "9",
    "imo:1:": "288409",
    "delivered:0:2": "20",
    "delivered:2:": "04",
    "loa:0:3": "280",
    "loa:3:1": ".",
    "loa:4:": "54",
    "lbp:0:3": "262",
    "lbp:3:1": ".",
    "lbp:4:": "00",
    "breadth:0:1": "4",
    "breadth:1:1": "0",
    "breadth:2:1": ".",
    "breadth:3:1": "0",
    "breadth:4:": "0",
    "depth:0:1": "2",
    "depth:1:1": "4",
    "depth:2:1": ".",
    "depth:3:": "00",
    "net_tonnage:0:2": "25",
    "net_tonnage:2:1": ",",
    "net_tonnage:3:": "614",
    "gross_tonnage:0:2": "66",
    "gross_tonnage:2:1": ",",
    "gross_tonnage:3:": "462",
    "light_ship:0:2": "24",
    "light_ship:2:1": ",",
    "light_ship:3:": "241",
    "vessel_name:0:1": "M",
    "vessel_name:1:3": "SC ",
    "terminal:0:4": "TCP ",
    "terminal:4:": "PARANAGUA",
    "purifier_temp:0:1": "9",
    "purifier_temp:1:": "8",
    "purifier_flow:0:1": "1",
    "purifier_flow:1:3": " x ",
    "purifier_flow:4:1": "3",
    "purifier_flow:5:": ",0",
    "purifier_bowl_freq:0:1": "6",
    "purifier_bowl_freq:1:": "0",
    "temp_sea_water:0:1": "2",
    "temp_sea_water:1:": "1",
    "records_updated_sentence:0:24": "After calculations, the ",
    "records_updated_sentence:24:7": "logbook",
    "records_updated_sentence:31:1": " ",
    "records_updated_sentence:32:5": " and ",
    "records_updated_sentence:37:3": "VRS",
    "records_updated_sentence:40:1": " ",
    "records_updated_sentence:41:1": " ",
    "records_updated_sentence:42:1": "w",
    "records_updated_sentence:43:3": "ere",
    "records_updated_sentence:46:9": " updated ",
    "records_updated_sentence:55:17": "according to the ",
    "records_updated_sentence:72:7": "figures",
    "records_updated_sentence:79:1": " ",
    "records_updated_sentence:80:21": "disclosed by surveyor",
    "records_updated_sentence:101:1": ":",
    "records_updated_sentence:102:": " ",
    "retained_chief:0:2": "4.",
    "retained_chief:2:": "22",
    "retained_after_discharge:0:1": "4",
    "retained_after_discharge:1:1": ".",
    "retained_after_discharge:2:": "31",
    "retained_after_last_discharge:0:2": "3,",
    "retained_after_last_discharge:2:1": "4",
    "retained_after_last_discharge:3:": "0",
    "sludge_generated_surveyor:0:2": "28",
    "sludge_generated_surveyor:2:1": ".",
    "sludge_generated_surveyor:3:": "73",
    "consumption_chief:0:5": "1,021",
    "consumption_chief:5:": ".460",
    "sludge_rate_chief:0:2": "2,",
    "sludge_rate_chief:2:": "893",
    "flowmeter_soundings:0:3": "981",
    "flowmeter_soundings:3:": ".008",
    "flowmeter_accuracy:0:2": "39",
    "flowmeter_accuracy:2:1": ".",
    "flowmeter_accuracy:3:": "5",
    "cover_date_year:0:3": "202",
    "cover_date_year:3:": "6",
    "survey_date_year:0:3": "202",
    "survey_date_year:3:": "6",
    "last_discharge_date_day:0:1": "2",
    "last_discharge_date_day:1:": "8",
    "last_discharge_date_year:0:3": "202",
    "last_discharge_date_year:3:": "6",
    "survey_date_month:0:2": "Ma",
    "survey_date_month:2:": "y",
    "grade_1:0:8": "RESIDUAL",
    "grade_1:8:1": " ",
    "grade_1:9:": "HS",
    "grade_1_difference:0:1": "+",
    "grade_1_difference:1:1": " ",
    "grade_1_difference:2:2": "32",
    "grade_1_difference:4:1": ".",
    "grade_1_difference:5:": "076",
    "grade_1_percentage:0:1": "+",
    "grade_1_percentage:1:1": " ",
    "grade_1_percentage:2:1": "0",
    "grade_1_percentage:3:1": ",",
    "grade_1_percentage:4:": "876",
    "grade_2_difference:0:1": "+",
    "grade_2_difference:1:1": " ",
    "grade_2_difference:2:1": "8",
    "grade_2_difference:3:1": ".",
    "grade_2_difference:4:": "382",
    "grade_2_percentage:0:1": "+",
    "grade_2_percentage:1:1": " ",
    "grade_2_percentage:2:1": "1",
    "grade_2_percentage:3:1": ",",
    "grade_2_percentage:4:": "733",
    "last_attendance_1_date:0:1": "O",
    "last_attendance_1_date:1:6": "ctober",
    "last_attendance_1_date:7:2": " 2",
    "last_attendance_1_date:9:1": "1",
    "last_attendance_1_date:10:5": ", 202",
    "last_attendance_1_date:15:": "6",
    "last_attendance_2_date:0:5": "March",
    "last_attendance_2_date:5:": " 28, 2026",
    "last_attendance_2_grade_1_vrs:0:6": "2,310.",
    "last_attendance_2_grade_1_vrs:6:": "250",
    "time_log_1_date:0:10": "15/06/2026",
    "time_log_1_date:10:": " ",
    "time_log_1_start:0:5": "12:00",
    "time_log_1_start:5:": " ",
    "time_log_2_date:0:10": "15/06/2026",
    "time_log_2_date:10:": " ",
    "time_log_2_start:0:5": "12:20",
    "time_log_2_start:5:": " ",
    "time_log_3_start:0:5": "12:30",
    "time_log_3_start:5:": " ",
    "time_log_4_date:0:10": "15/06/2026",
    "time_log_4_date:10:": " ",
    "time_log_4_start:0:5": "12:23",
    "time_log_4_start:5:": " ",
    "time_log_4_end:0:5": "12:40",
    "time_log_4_end:5:": " ",
    "time_log_5_date:0:10": "15/06/2026",
    "time_log_5_date:10:": " ",
    "time_log_5_start:0:5": "12:40",
    "time_log_5_start:5:": " ",
    "time_log_5_end:0:5": "13:00",
    "time_log_5_end:5:": " ",
    "time_log_6_date:0:10": "15/06/2026",
    "time_log_6_date:10:": " ",
    "time_log_6_start:0:5": "12:20",
    "time_log_6_start:5:": " ",
    "time_log_7_event:0:5": "Hose ",
    "time_log_7_event:5:": "conected",
    "time_log_7_date:0:10": "15/06/2026",
    "time_log_7_date:10:": " ",
    "time_log_7_start:0:5": "12:50",
    "time_log_7_start:5:": " ",
    "time_log_8_date:0:10": "15/06/2026",
    "time_log_8_date:10:": " ",
    "time_log_8_start:0:5": "13:00",
    "time_log_8_start:5:": " ",
    "time_log_8_end:0:5": "16:00",
    "time_log_8_end:5:": " ",
    "time_log_9_date:0:10": "15/06/2026",
    "time_log_9_date:10:": " ",
    "time_log_9_start:0:5": "16:05",
    "time_log_9_start:5:": " ",
    "time_log_9_end:0:5": "16:40",
    "time_log_9_end:5:": " ",
    "time_log_10_date:0:10": "15/06/2026",
    "time_log_10_date:10:": " ",
    "time_log_10_start:0:5": "16:40",
    "time_log_10_start:5:": " ",
    "time_log_10_end:0:5": "17:00",
    "time_log_10_end:5:": " ",
    "time_log_11_date:0:10": "15/06/2026",
    "time_log_11_date:10:": " ",
    "time_log_11_start:0:5": "17:10",
    "time_log_11_start:5:": " ",
    "time_log_12_date:0:10": "15/06/2026",
    "time_log_12_date:10:": " ",
    "time_log_12_start:0:5": "17:15",
    "time_log_12_start:5:": " "
  },
  "package_preservation": [
    {
      "part": "[Content_Types].xml",
      "size": 2849,
      "sha256": "4a13ae54b0944b47edb9342ed1bf9147887e19847ebfae9fa516ff744da47f3d",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "_rels/.rels",
      "size": 737,
      "sha256": "c30fe099dbcfed4ecc4ae544ccf82f432c8d3bb665e2a301df283738b196d803",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/document.xml",
      "size": 498380,
      "sha256": "90179b805ab71b1662cc58c7d4b80e3ae5e6d05d819dba5631008f08498fd565",
      "mode": "editable",
      "unchanged": false
    },
    {
      "part": "word/_rels/document.xml.rels",
      "size": 6519,
      "sha256": "560f1c56c5b4b50f6bd947d338d934d2672b558442bcb3d4af8c5c50951df8fd",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/footnotes.xml",
      "size": 3285,
      "sha256": "9c917a9857b44be1d1929d246fc25608094c80db43804a4a8edd3e221fd13c8f",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/endnotes.xml",
      "size": 3277,
      "sha256": "c4e94ed6b3af7235bfd99a570c1aad6cf6969e57d9206696b029463582675b13",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/footer1.xml",
      "size": 8232,
      "sha256": "70f1540b379fad50ee7184622739ae5c83fe0bd8d23b5d8ab3bb86c1fa4ae9e6",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/header2.xml",
      "size": 6295,
      "sha256": "e1e3b40a313c345d5a6e9431d441ff98633991143548a8ef0a73e4e04b55849b",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/_rels/header2.xml.rels",
      "size": 289,
      "sha256": "544e2010c8c98b543ea2c53c37fcf79bfb9c96d9a70e8fd07886f5501cca2c4d",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/header1.xml",
      "size": 6862,
      "sha256": "59ca1bd6e8cc4cc3cdbaddd0c48ebf742d25fd347f78da0d8561650fd5f499f2",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/_rels/footer1.xml.rels",
      "size": 326,
      "sha256": "f81e624fcbb71b9cc27ae462972fec8e6e07cef8a98b36ad8f4cecc3a9e39574",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/_rels/header1.xml.rels",
      "size": 289,
      "sha256": "544e2010c8c98b543ea2c53c37fcf79bfb9c96d9a70e8fd07886f5501cca2c4d",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image28.jpeg",
      "size": 162210,
      "sha256": "1568f6405d415ef9e3098c840881d77d82e88a151bd32b1841a7ad91a6a6cf18",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image29.jpeg",
      "size": 307449,
      "sha256": "b6de7d522494c9b216be075fdce4122e1099a0b02d7264b8883b834b3d502443",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image30.jpeg",
      "size": 262398,
      "sha256": "49d06070b8afd17bc83d2730623cc3d3d70e646abd3dd3318f5f0d03d9c89504",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image31.jpeg",
      "size": 289147,
      "sha256": "6f0b05e29bdeb16064fad9fd31db35e84c7e4e5a05a935c20583606f76cab674",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/theme/theme1.xml",
      "size": 8395,
      "sha256": "49395915f6cc932b649456e8369b23f32ee5e7531d39ba821942b12b0c2b62e1",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image32.jpeg",
      "size": 264417,
      "sha256": "c66c51c7926792c954accedf1a9822a46f5fde32e813d1933e7d75669b97c092",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image1.jpeg",
      "size": 131726,
      "sha256": "b2f395426d126fc431cf486e4e38e1585ca9ef6300ce9c8a26a4970dfd8ddfa7",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image2.jpg",
      "size": 25643,
      "sha256": "a9134b2b65d91adaa50dd37a9f5d3d0a0722462c901d53459861a54b4612c14c",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image3.jpeg",
      "size": 329350,
      "sha256": "05c13f732f0b0dfc457950e0a286db4f04ed14c22bdda461db6b4978883540f6",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image4.jpeg",
      "size": 177678,
      "sha256": "4792fc5d7af6d43d110a6159b55caa3bc8aa144d8728a13541c9ddb9cfb789ce",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image5.jpeg",
      "size": 253542,
      "sha256": "e16650ccceec0375477458b6b6a3e0b4646c91c5a69cebe8303b04246b3ee5ea",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image6.jpeg",
      "size": 277946,
      "sha256": "1de2cf45b0434ebe5d69bf35d651e26acab707dc917b1f0a7817eed471f7697e",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image7.jpeg",
      "size": 290873,
      "sha256": "88aca53b0c1eb464d5daa5e27a571454ee0b54bc27b90269ec8ddbbd39a9319f",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image8.jpeg",
      "size": 308714,
      "sha256": "b9ad031d90fe9ef3a452f9746e29fd1294364834ce7db800e97e79f2019837a2",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image9.jpeg",
      "size": 273304,
      "sha256": "1257e665df048451113ef031ac6273e0375f8942dcbe953a257992d9711dfa0d",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image10.jpeg",
      "size": 246235,
      "sha256": "0cd59b570b20e4ce47fbc0139ff9af18b0587142f3b404351a5972a8437bbaf6",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image11.jpeg",
      "size": 410202,
      "sha256": "6c8d66ee7bdfa970c9fb807427365e08ae4cc14d0247c79c26f7edb125512940",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image12.jpeg",
      "size": 275460,
      "sha256": "7c7efe1ef8b222cdded524baa6e3eb257786bf9c06ccbce3c4135938dcc2e82f",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image13.jpeg",
      "size": 269242,
      "sha256": "7477d353929a61f9ee89097ce1ba0624360bae6b7d4b6de3fa19e528cd6b8d20",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image14.jpeg",
      "size": 312780,
      "sha256": "76e3509d2e0294a7e1db277cb7cf0fd4ceee0892febad391408f75194b1a9ff0",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image15.jpeg",
      "size": 390576,
      "sha256": "d8883d1d2d5f906a9490c2a301b1e1c1120611b2ea6326164e6c0d5e43c43f73",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image16.jpeg",
      "size": 403856,
      "sha256": "86b3747b4ebaddddbdcdb7f7211089fb8564a41fa6f868fa15de971942130829",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image17.jpeg",
      "size": 400410,
      "sha256": "ac8d5fb2e003fe8e18000be7c5df1f202321583153b3c894b3efe229e841b460",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image18.jpeg",
      "size": 358652,
      "sha256": "c556fbf96b4648bb55fc47faf551f122ddb04e143f49a86e2adcea2f2ca0c484",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image19.jpeg",
      "size": 142187,
      "sha256": "2746c67737b74476dd2585e45279b7a8ac0f4a6284ab68a913af0bd105bc6f24",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image20.jpeg",
      "size": 126988,
      "sha256": "c18ed4f5376d2c1e3354d0c99327e865d3f3c3ef8485c3f82b9d39e3ea1fb366",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image21.jpeg",
      "size": 166597,
      "sha256": "7371e83d68f35513b9c17375eeca492f11ae9048268d638f714f3fd139383110",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image22.jpeg",
      "size": 142428,
      "sha256": "03fd060f583e717cb01bf7a802f8ae584a127c9d28b306993c9252b6b5f89758",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image23.jpeg",
      "size": 148513,
      "sha256": "55d781169e3914e5e9aa0730af4be983ffd5ae5e128bee534bec3e93db71fb7c",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image24.jpeg",
      "size": 229460,
      "sha256": "1f499c1876e8837bdcf882dd7645885c5a14cb4586305ddf71654811680352b0",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image25.jpeg",
      "size": 209121,
      "sha256": "de7fccd37d3e8b0ef459ef09d8532164f4033b5889364e570bef0cec10a536c3",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image26.jpeg",
      "size": 260859,
      "sha256": "eefefb1eee39aa837ea869f55623f208062f4778653f22d9dbca468b8c219366",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/media/image27.jpeg",
      "size": 197921,
      "sha256": "0f7409e91747db4c5074aee79e78a905a7ff868b326cb9dee4fd86fa358e42c0",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/settings.xml",
      "size": 64809,
      "sha256": "6796a91234d0f4886e062622cafc6b97ad0ff5622df52abd3f3d612826cb44bd",
      "mode": "editable",
      "unchanged": false
    },
    {
      "part": "word/_rels/settings.xml.rels",
      "size": 384,
      "sha256": "2e709d4c2e79a8e438cd22a4847ea20d36be25f73d3371be429ae0d495d980bf",
      "mode": "editable",
      "unchanged": false
    },
    {
      "part": "customXml/item1.xml",
      "size": 270,
      "sha256": "c8092edbb672f8c93f1d5ef66539a6f169462ba8738b785b59cc5d96f4aca59a",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "customXml/itemProps1.xml",
      "size": 341,
      "sha256": "675d73dd28dad5339cd4c336db5eb8d36649348a066e3c1d34a00d6387ee2dfa",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "customXml/item2.xml",
      "size": 15213,
      "sha256": "488148e09f83ea99594706501bb285fcd9f79d14d44cbd379f9342ce849a0f53",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "customXml/itemProps2.xml",
      "size": 1149,
      "sha256": "1bf0a105f223ccac01a6df50a717b09757fbe9b2493e9d901d95214e7ea9168b",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "customXml/item3.xml",
      "size": 833,
      "sha256": "8abf54e5883b71ea2198caf9398a5a014b08133d685ddd9f5f70bd72b98e835e",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "customXml/itemProps3.xml",
      "size": 547,
      "sha256": "f260458f7f9f55e2204b8bfb32a4b8c0548c58d4398602a1f3ac80e458e9bd46",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "customXml/itemProps4.xml",
      "size": 335,
      "sha256": "1b7eb0d5e78af604d56d16c419fb22d3bacdf582bb39765bf137ef4d007336f0",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "docProps/core.xml",
      "size": 786,
      "sha256": "b684425afe1d82f626090e9c66a182cd0ad68d8d65da28c00913306f36a7919e",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "docProps/app.xml",
      "size": 1662,
      "sha256": "10b64b9d2a0e064d6db18d03540b12a18632f81f970334fb537adaca33d61682",
      "mode": "editable",
      "unchanged": false
    },
    {
      "part": "docProps/custom.xml",
      "size": 1368,
      "sha256": "f0e799165dbad4417e0c0d8db78c9453a0dd7594713a49cdc0f9123fe9418b3b",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/webSettings.xml",
      "size": 67205,
      "sha256": "366ec7f93ff707ae7d9b865fa690bc36bccfb3ba9ecf7de31237c37eaf2eb77b",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/fontTable.xml",
      "size": 4491,
      "sha256": "270c159e426d75d4569c2105bb466dc6ecea7c6912546d0a5183672fd1c9123b",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "customXml/_rels/item2.xml.rels",
      "size": 296,
      "sha256": "2a6aee4c8a9714223a3568077411a0c82d11b484b1c9ab93a19d50b99c57baa5",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "customXml/_rels/item3.xml.rels",
      "size": 296,
      "sha256": "3aa4054f7f463c6d441102c960783aa7f937d6945a0a885b624a66aafaeedb6c",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "customXml/_rels/item4.xml.rels",
      "size": 296,
      "sha256": "3c0d4d955517fe8112c945b1e56f63d5bef3c0005ccb627e40acda432e1cdc1d",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/styles.xml",
      "size": 42170,
      "sha256": "a0c3ff2050c35b83df09944177bfd4cc4175ed61c671268efffeb5c48b9fb3f6",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "word/numbering.xml",
      "size": 88853,
      "sha256": "1b1aa38418f7541eab46285903765171ceb8556e4bb83cc91b8273f54addbd94",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "customXml/item4.xml",
      "size": 219,
      "sha256": "5efcaf9ad70d9c29f406ee438f8f428b021a881d2c5afff0e53b00b1f67ae51e",
      "mode": "preserve-only",
      "unchanged": true
    },
    {
      "part": "customXml/_rels/item1.xml.rels",
      "size": 296,
      "sha256": "80482f86e196171d66001e0e74d1900408a3aaf2463e54005d251b5f2db9a0b0",
      "mode": "preserve-only",
      "unchanged": true
    }
  ]
}
```
