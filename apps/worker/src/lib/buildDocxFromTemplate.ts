/**
 * Draft Survey builder backed by the client's approved Word layout.
 *
 * Unlike the legacy builder, this does not reconstruct the document with a
 * generic layout library. It fills a sanitized copy of the real DOCX package,
 * preserving Word page setup, styles, numbering, headers, tables and geometry.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import PizZip from 'pizzip';
import sharp from 'sharp';
import { formatNumberWithDecimals, type FieldValue } from '@naabsa/core';
import type { DocxInput } from './buildDocx';

type NumericField = (name: string, fallback?: number, suffix?: string, grouped?: boolean, signed?: boolean) => string;

const TEMPLATE_URL = new URL(
  '../../../../templates/draft_survey.clean.docx',
  import.meta.url,
);
const EMPTY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lW8UqAAAAABJRU5ErkJggg==',
  'base64',
);
const UNDERSIGNED_SURVEYOR = 'Mr. Wagner de Abreu';
// The approved source uses a 5.66 x 4.25 in 4:3 photograph. At the image
// module's 96 px/in conversion this is 544 x 408 px.
const COVER_IMAGE_SIZE = [544, 408] as const;
const SINGLE_PHOTO_SIZE = [544, 408] as const;
const COMPACT_GRID_PHOTO_SIZE = [270, 203] as const;
const COMPACT_PHOTO_GRID_WIDTH_TWIPS = 9360;
// Two rows or fewer can use the complete 7.125 in source body width. Five or
// six photos use the compact source-derived geometry so the 2 x 3 grid still
// fits directly below the phase spreadsheet image.
const WIDE_GRID_PHOTO_SIZE = [330, 248] as const;
const WIDE_PHOTO_GRID_WIDTH_TWIPS = 10260;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * The free image module has a compatibility bug with per-tag centered markers:
 * it expands `{%%image}` only to the text node, then inserts a whole paragraph
 * there. That creates an invalid `<w:p>` nested inside `<w:r>` which Collabora
 * and LibreOffice silently ignore. Keep the dedicated template paragraphs,
 * render inline images inside them and normalize the inherited pagination.
 */
function requiredPartIndex(
  parts: string[],
  predicate: (part: string) => boolean,
  label: string,
): number {
  const index = parts.findIndex(predicate);
  if (index < 0) throw new Error(`Template DOCX sem ${label}.`);
  return index;
}

function rewritePhotoHeading(
  block: string[],
  oldBookmark: string,
  newBookmark: string,
  oldLabel: string,
): string[] {
  return block.map((part) =>
    part
      .replace(`w:name="${oldBookmark}"`, `w:name="${newBookmark}"`)
      .replace(
        new RegExp(`(<w:t\\b[^>]*>)${oldLabel}(<\\/w:t>)`),
        '$1Photographic Report$2',
      ),
  );
}

function movePhotographicReportsIntoPhases(parts: string[]): void {
  const bodyPhotoStart = requiredPartIndex(
    parts,
    (part) => part.includes('w:name="s6"'),
    'seção Photographic Report',
  );
  const bodyAttachmentStart = requiredPartIndex(
    parts,
    (part) => part.includes('w:name="s7"'),
    'seção Attachment',
  );
  const bodyBlock = (bookmark: string, closeTag: string) => {
    const start = requiredPartIndex(
      parts,
      (part) => part.includes(`w:name="${bookmark}"`),
      `bookmark ${bookmark}`,
    );
    const end = requiredPartIndex(
      parts,
      (part) => part.includes(closeTag),
      closeTag,
    );
    return parts.slice(start, end + 1);
  };
  const initialPhotos = rewritePhotoHeading(
    bodyBlock('s6_1', '{/photosInitial}'),
    's6_1',
    's3_6',
    'Initial',
  );
  const intermediatePhotos = rewritePhotoHeading(
    bodyBlock('s6_2', '{/photosIntermediate}'),
    's6_2',
    's4_6',
    'Intermediate',
  );
  const finalPhotos = rewritePhotoHeading(
    bodyBlock('s6_3', '{/photosFinal}'),
    's6_3',
    's5_6',
    'Final',
  );
  parts.splice(bodyPhotoStart, bodyAttachmentStart - bodyPhotoStart);

  for (const [sheetTag, photoBlock] of [
    ['{%%sheetInitial}', initialPhotos],
    ['{%%sheetIntermediate}', intermediatePhotos],
    ['{%%sheetFinal}', finalPhotos],
  ] as const) {
    const sheet = requiredPartIndex(
      parts,
      (part) => part.includes(sheetTag),
      sheetTag,
    );
    parts.splice(sheet + 1, 0, ...photoBlock);
  }

  const tocPhotoStart = requiredPartIndex(
    parts,
    (part) => part.includes('w:anchor="s6"'),
    'entrada Photographic Report do sumário',
  );
  const tocAttachmentStart = requiredPartIndex(
    parts,
    (part) => part.includes('w:anchor="s7"'),
    'entrada Attachment do sumário',
  );
  const tocEntry = (
    oldAnchor: string,
    newAnchor: string,
    oldLabel: string,
    newLabel: string,
    oldPageTag: string,
    newPageTag: string,
  ) => {
    const index = requiredPartIndex(
      parts,
      (part) => part.includes(`w:anchor="${oldAnchor}"`),
      `entrada ${oldAnchor} do sumário`,
    );
    return parts[index]!.replaceAll(
      `w:anchor="${oldAnchor}"`,
      `w:anchor="${newAnchor}"`,
    )
      .replace(oldLabel, newLabel)
      .replace(oldPageTag, newPageTag);
  };
  const initialToc = tocEntry(
    's6_1',
    's3_6',
    '{photo_no}.1. Initial',
    '3.6. Photographic Report',
    '{toc_s6_1}',
    '{toc_s3_6}',
  );
  const intermediateToc = tocEntry(
    's6_2',
    's4_6',
    '{photo_no}.2. Intermediate',
    '4.6. Photographic Report',
    '{toc_s6_2}',
    '{toc_s4_6}',
  );
  const finalToc = tocEntry(
    's6_3',
    's5_6',
    '{photo_no}.{photo_final_subno}. Final',
    '{final_no}.6. Photographic Report',
    '{toc_s6_3}',
    '{toc_s5_6}',
  );
  parts.splice(tocPhotoStart, tocAttachmentStart - tocPhotoStart);

  for (const [anchor, entry] of [
    ['s3_5', initialToc],
    ['s4_5', intermediateToc],
    ['s5_5', finalToc],
  ] as const) {
    const index = requiredPartIndex(
      parts,
      (part) => part.includes(`w:anchor="${anchor}"`),
      `entrada ${anchor} do sumário`,
    );
    parts.splice(index + 1, 0, entry);
  }

  const tocAttachment = requiredPartIndex(
    parts,
    (part) => part.includes('w:anchor="s7"'),
    'entrada Attachment do sumário',
  );
  parts[tocAttachment] = parts[tocAttachment]!.replaceAll(
    'w:anchor="s7"',
    'w:anchor="s6"',
  ).replace('{toc_s7}', '{toc_s6}');
  const bodyAttachment = requiredPartIndex(
    parts,
    (part) => part.includes('w:name="s7"'),
    'bookmark Attachment',
  );
  parts[bodyAttachment] = parts[bodyAttachment]!.replace(
    'w:name="s7"',
    'w:name="s6"',
  );
}

function prepareTemplateLayout(zip: PizZip): void {
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('Template DOCX sem word/document.xml.');

  const imageTag =
    /\{%%(?:coverPhoto|sheetInitial|sheetIntermediate|sheetFinal|photo)\}/;
  const parts = file.asText().split(/(<w:p\b[^>]*>.*?<\/w:p>)/gs);

  const keepWithNext = (paragraph: string): string => {
    if (/<w:keepNext\b/.test(paragraph)) return paragraph;
    return /<w:pPr\b[^>]*>/.test(paragraph)
      ? paragraph.replace(/<w:pPr\b[^>]*>/, '$&<w:keepNext/>')
      : paragraph.replace(/(<w:p\b[^>]*>)/, '$1<w:pPr><w:keepNext/></w:pPr>');
  };
  const keepReadingTableTogether = (table: string): string => {
    const border = (side: string) => `<w:${side} w:val="single" w:sz="6" w:color="666666"/>`;
    const borders = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`;
    const bordered = table.replace(/<w:tblPr\b[^>]*>.*?<\/w:tblPr>/s, (properties) =>
      /<w:tblBorders>.*?<\/w:tblBorders>/s.test(properties)
        ? properties.replace(/<w:tblBorders>.*?<\/w:tblBorders>/s, borders)
        : properties.replace('</w:tblPr>', `${borders}</w:tblPr>`),
    );
    const rows = table.match(/<w:tr\b[^>]*>.*?<\/w:tr>/gs) ?? [];
    let rowIndex = 0;
    return bordered.replace(/<w:tr\b[^>]*>.*?<\/w:tr>/gs, (row) => {
      let prepared = /<w:cantSplit\b/.test(row)
        ? row
        : /<w:trPr\b[^>]*>/.test(row)
          ? row.replace(/<w:trPr\b[^>]*>/, '$&<w:cantSplit/>')
          : row.replace(/(<w:tr\b[^>]*>)/, '$1<w:trPr><w:cantSplit/></w:trPr>');
      if (rowIndex < rows.length - 1) {
        prepared = prepared.replace(/<w:p\b[^>]*>.*?<\/w:p>/gs, keepWithNext);
      }
      rowIndex += 1;
      return prepared;
    });
  };

  movePhotographicReportsIntoPhases(parts);

  for (let index = 0; index < parts.length - 3; index += 1) {
    if (!/w:name="s[345]_[15]"/.test(parts[index] ?? '')) continue;
    const spacer = parts[index + 2] ?? '';
    const spacerText = [...spacer.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)]
      .map((match) => match[1] ?? '')
      .join('')
      .trim();
    if (/^<w:p\b[^>]*>.*<\/w:p>$/s.test(spacer) && spacerText === '') {
      // Hidden spacers defeat keepNext in LibreOffice/Collabora and can leave
      // “Draft readings” or “Draft details” alone at the bottom of a page.
      parts[index + 2] = '';
    }
  }

  for (let index = 0; index < parts.length; index += 1) {
    const paragraph = parts[index];
    if (!paragraph?.startsWith('<w:p')) continue;

    // These breaks were introduced while sanitizing the client's template, but
    // the approved Word source relies on natural pagination. In Collabora they
    // compound with the template's spacer paragraphs and create blank pages.
    let prepared = paragraph.replace(/<w:pageBreakBefore\b[^>]*\/>/g, '');

    if (imageTag.test(paragraph)) {
      prepared = prepared.replace(/\{%%/g, '{%');
      if (/<w:jc\b/.test(prepared)) {
        prepared = prepared.replace(
          /<w:jc\b[^>]*\/>/,
          '<w:jc w:val="center"/>',
        );
      } else {
        prepared = prepared.replace(
          '</w:pPr>',
          '<w:jc w:val="center"/></w:pPr>',
        );
      }
    }

    const paragraphText = [...paragraph.matchAll(/<w:t\b[^>]*>(.*?)<\/w:t>/gs)]
      .map((match) => match[1])
      .join('')
      .replace(/&nbsp;/g, ' ')
      .trim();
    if (paragraphText === 'Contents') {
      prepared = /<w:pPr\b[^>]*>/.test(prepared)
        ? prepared.replace(/<w:pPr\b[^>]*>/, '$&<w:pageBreakBefore/>')
        : prepared.replace(
            /(<w:p\b[^>]*>)/,
            '$1<w:pPr><w:pageBreakBefore/></w:pPr>',
          );
    }
    if (
      (/w:name="s[345](?:_[156])?"/.test(paragraph) ||
        /Draft (?:details|Details)/.test(paragraphText)) &&
      !/<w:hyperlink\b/.test(paragraph)
    ) {
      prepared = keepWithNext(prepared);
    }
    parts[index] = prepared;
  }

  const documentXml = parts
    .join('')
    .replace(
      /(<w:p\b[^>]*>(?:(?!<\/w:p>).)*w:name="s[345]_1"(?:(?!<\/w:p>).)*<\/w:p>)(<w:tbl\b.*?<\/w:tbl>)/gs,
      (_match, heading: string, table: string) =>
        heading + keepReadingTableTogether(table),
    );
  zip.file('word/document.xml', documentXml);
}

function scaledSize(
  size: readonly [number, number],
  scale: number,
): readonly [number, number] {
  return [Math.round(size[0] * scale), Math.round(size[1] * scale)] as const;
}

function photoGridMetrics(
  count: number,
  scale = 1,
): {
  imageSize: readonly [number, number];
  widthTwips: number;
} {
  return count >= 5
    ? {
        imageSize: scaledSize(COMPACT_GRID_PHOTO_SIZE, scale),
        widthTwips: COMPACT_PHOTO_GRID_WIDTH_TWIPS,
      }
    : {
        imageSize: scaledSize(WIDE_GRID_PHOTO_SIZE, scale),
        widthTwips: WIDE_PHOTO_GRID_WIDTH_TWIPS,
      };
}

function photoGridCell(
  paragraph: string | undefined,
  cellWidthTwips: number,
): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${cellWidthTwips}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${paragraph ?? '<w:p/>'}</w:tc>`;
}

function photoGridTable(paragraphs: string[], widthTwips: number): string {
  const cellWidthTwips = widthTwips / 2;
  const rows: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 2) {
    rows.push(
      `<w:tr><w:trPr><w:cantSplit/></w:trPr>${photoGridCell(paragraphs[index], cellWidthTwips)}${photoGridCell(paragraphs[index + 1], cellWidthTwips)}</w:tr>`,
    );
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="${widthTwips}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${cellWidthTwips}"/><w:gridCol w:w="${cellWidthTwips}"/></w:tblGrid>${rows.join('')}</w:tbl>`;
}

/**
 * Agrupa somente conjuntos com duas ou mais fotos em uma tabela invisível de
 * duas colunas. Uma única foto conserva o parágrafo e o tamanho já aprovados.
 * Cada linha é indivisível, mas a tabela pode continuar na página seguinte.
 */
function arrangePhasePhotosInTwoColumns(
  zip: PizZip,
  counts: { initial: number; intermediate: number; final: number },
): void {
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('Template DOCX sem word/document.xml.');
  let xml = file.asText();
  const phases = [
    { name: 'initial', bookmark: 's3_6', boundaries: ['s4', 's5'] },
    { name: 'intermediate', bookmark: 's4_6', boundaries: ['s5'] },
    { name: 'final', bookmark: 's5_6', boundaries: ['s6'] },
  ] as const;

  for (const phase of phases) {
    const expected = counts[phase.name];
    if (expected < 2) continue;
    const metrics = photoGridMetrics(expected);
    const start = xml.indexOf(`w:name="${phase.bookmark}"`);
    if (start < 0)
      throw new Error(`Documento renderizado sem bookmark ${phase.bookmark}.`);
    const boundaryPositions = phase.boundaries
      .map((bookmark) => xml.indexOf(`w:name="${bookmark}"`, start + 1))
      .filter((position) => position >= 0);
    const end = boundaryPositions.length
      ? Math.min(...boundaryPositions)
      : xml.length;
    const segment = xml.slice(start, end);
    const paragraphs = [
      ...segment.matchAll(
        /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<w:drawing>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g,
      ),
    ];
    if (paragraphs.length !== expected) {
      throw new Error(
        `Photographic Report ${phase.name}: esperadas ${expected} fotos, encontradas ${paragraphs.length}.`,
      );
    }

    let rebuilt = '';
    let cursor = 0;
    for (const [index, match] of paragraphs.entries()) {
      rebuilt += segment.slice(cursor, match.index);
      if (index === 0)
        rebuilt += photoGridTable(
          paragraphs.map((item) => item[0]),
          metrics.widthTwips,
        );
      cursor = (match.index ?? 0) + match[0].length;
    }
    rebuilt += segment.slice(cursor);
    xml = `${xml.slice(0, start)}${rebuilt}${xml.slice(end)}`;
  }
  zip.file('word/document.xml', xml);
}

const VARIANT = {
  loading: {
    verb: 'load',
    bl: 'bound to',
    done: 'loaded',
    official: 'Shore scale',
    officialFig: 'Shore Scale',
  },
  discharge: {
    verb: 'discharge',
    bl: 'loaded in',
    done: 'discharged',
    official: 'Bills of lading',
    officialFig: 'BsL',
  },
} as const;

function value(raw: FieldValue | undefined, fallback = '—'): string {
  return raw == null || raw === '' ? fallback : String(raw);
}

function portName(raw: FieldValue | undefined): string {
  return value(raw).replace(/\s*,\s*Brazil\s*$/i, '').trim();
}

function withoutMr(raw: FieldValue | undefined): string {
  return value(raw).replace(/^Mr\.?\s+/i, '');
}

function ordinal(day: number): string {
  if (day === 1 || day === 21 || day === 31) return 'st';
  if (day === 2 || day === 22) return 'nd';
  if (day === 3 || day === 23) return 'rd';
  return 'th';
}

function formatDate(raw: FieldValue | undefined): string {
  if (raw == null || raw === '') return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw));
  if (!match) return String(raw);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return `${MONTHS[month - 1]} ${day}${ordinal(day)}, ${match[1]}`;
}

function grouped(number: number, decimals: number): string {
  const negative = number < 0;
  const [integer = '0', fraction] = Math.abs(number)
    .toFixed(decimals)
    .split('.');
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${formattedInteger}${fraction == null ? '' : `.${fraction}`}`;
}

function mt(raw: FieldValue | undefined): string {
  return typeof raw === 'number' && Number.isFinite(raw) ? `${grouped(raw, 3)} MT` : '—';
}

function sideLabels(raw: FieldValue | undefined): {
  berthed: string;
  opposite: string;
} {
  const normalized = String(raw ?? '').toLowerCase();
  if (normalized.startsWith('star'))
    return { berthed: 'Starboard side', opposite: 'Port side' };
  if (normalized.startsWith('port'))
    return { berthed: 'Port side', opposite: 'Starboard side' };
  return { berthed: value(raw), opposite: '—' };
}

function partyNames(rows: string[][]): string[] {
  return rows
    .slice(1)
    .map((row) => String(row[0] ?? '').trim())
    .filter(Boolean);
}

function partiesSuffix(rows: string[][]): string {
  const parties = partyNames(rows).map((name) => name.toLowerCase());
  return parties.length ? `, ${parties.join(', ')}` : '';
}

function possessiveFigureLabel(role: string): string {
  const base = role.replace(/\s+surveyor$/i, '').trim();
  return /['’]s?$/.test(base) ? `${base} figures` : `${base}’s figures`;
}

function figureLine(label: string, amount: string): string {
  const dots = '.'.repeat(Math.max(3, 44 - label.length));
  return `${label}${dots}: ${amount}`;
}

function figureLines(
  prefix: 'int' | 'fin',
  numericField: NumericField,
  officialLabel: string,
  acting: string[][],
): string[] {
  const lines = [
    figureLine(
      `${officialLabel} figures (Official)`,
      numericField(`${prefix}_fig_shore_scale`, 3, ' MT', true),
    ),
    figureLine('NAABSA’s surveyor figures', numericField(`${prefix}_fig_naabsa`, 3, ' MT', true)),
    figureLine(
      'Difference as per our figures',
      `${numericField(`${prefix}_fig_diff_mt`, 3, ' MT', true, true)} or ${numericField(`${prefix}_fig_diff_pct`, 3, ' %', true, true)}`,
    ),
    '',
    figureLine('Vessel’s figures', numericField(`${prefix}_fig_vessel`, 3, ' MT', true)),
  ];
  for (const row of acting.slice(1, 4)) {
    const role = String(row[0] ?? '').trim();
    const parsed = row.length > 8 ? Number(row[8]) : Number.NaN;
    lines.push(
      role
        ? figureLine(
            possessiveFigureLabel(role),
            Number.isFinite(parsed) ? mt(parsed) : '—',
          )
        : '',
    );
  }
  while (lines.length < 8) lines.push('');
  return lines.slice(0, 8);
}

function tocData(
  pages: Record<string, number> | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  const ids = [
    's1',
    's2',
    's3',
    's3_1',
    's3_2',
    's3_3',
    's3_4',
    's3_5',
    's3_6',
    's4',
    's4_1',
    's4_2',
    's4_3',
    's4_4',
    's4_5',
    's4_6',
    's5',
    's5_1',
    's5_2',
    's5_3',
    's5_4',
    's5_5',
    's5_6',
    's6',
  ];
  for (const id of ids)
    result[`toc_${id}`] = pages?.[id] == null ? '' : String(pages[id]);
  return result;
}

function makeTemplateData(input: DocxInput): Record<string, unknown> {
  const data = input.data;
  const numericField: NumericField = (name, fallback, suffix = '', grouped = false, signed = false) => {
    const value = data[name];
    if (typeof value !== 'number' || !Number.isFinite(value)) return '';
    const number = formatNumberWithDecimals(
      signed ? Math.abs(value) : value, input.numberFormats?.[name] ?? fallback, grouped,
    );
    return `${signed ? (value >= 0 ? '+ ' : '- ') : ''}${number}${suffix}`;
  };
  const variant = VARIANT[input.variant];
  const hasIntermediate =
    data['intermediate_date'] != null && data['intermediate_date'] !== '';
  const finalActing = input.acting.final ?? [];
  const intermediateActing = input.acting.intermediate ?? [];
  const sides = sideLabels(data['berthing_side']);
  const draftReadings = `${sides.berthed} from shore, alongside vessel and ${sides.opposite} from boat.`;
  const intermediateFigures = figureLines(
    'int',
    numericField,
    variant.officialFig,
    intermediateActing,
  );
  const finalFigures = figureLines(
    'fin',
    numericField,
    variant.officialFig,
    finalActing,
  );

  const initialNarrative = `The initial Draft Survey was carried out on ${formatDate(data['initial_date'])}, upon berthing at ${value(data['terminal'])} Terminal, shed ${value(data['shed'])} from ${value(data['initial_start'])}h up to ${value(data['initial_end'])}h local time jointly with ship's command${partiesSuffix(finalActing)} and the undersigned surveyor.`;
  const phaseNarrative = (
    label: string,
    prefix: 'intermediate' | 'final',
    acting: string[][],
  ) =>
    `The ${label} Draft Survey was carried out on ${formatDate(data[`${prefix}_date`])}, from ${value(data[`${prefix}_start`])} up to ${value(data[`${prefix}_end`])} h local time jointly with ship's command${partiesSuffix(acting)} and the undersigned surveyor to ascertain the total quantity of the cargo ${variant.done} being the following figures disclosed:`;

  return {
    ...tocData(input.tocPages),
    ref: value(data['ref'], ''),
    vessel_name: value(data['vessel_name'], ''),
    flag: value(data['flag']),
    imo: value(data['imo']),
    port: portName(data['port']),
    final_date: formatDate(data['final_date']),
    client: value(data['client']),
    operator: value(data['operator']),
    surveyor_name: value(data['surveyor_name'], UNDERSIGNED_SURVEYOR),
    captain: withoutMr(data['captain']),
    chief_officer: withoutMr(data['chief_officer']),
    background_1: `In compliance with the appointment survey from Messrs. ${value(data['client']).toUpperCase()}, we attended the vessel to carry out the Draft Survey to ascertain the total quantity of cargo ${variant.done} and to compare it with the ${variant.official}.`,
    background_2: `She called ${portName(data['port'])} Port to ${variant.verb} a cargo of ${value(data['cargo'])} in bulk ${variant.bl} ${value(data['discharging_port'])}.`,
    register_port: value(data['register_port']),
    call_sign: value(data['call_sign']),
    vessel_type: value(data['vessel_type']),
    delivered: numericField('delivered') || (typeof data['delivered'] === 'string' ? data['delivered'] : ''),
    loa: numericField('loa', 2),
    lbp: numericField('lbp', 2),
    depth_moulded: numericField('depth_moulded', 2),
    breadth_moulded: numericField('breadth_moulded', 2),
    net_tonnage: numericField('net_tonnage', 3, '', true),
    gross_tonnage: numericField('gross_tonnage', 3, '', true),
    summer_dwt: numericField('summer_dwt', 3, '', true),
    hasIntermediate,
    final_no: hasIntermediate ? 5 : 4,
    initial_narrative: initialNarrative,
    intermediate_narrative: phaseNarrative(
      'intermediate',
      'intermediate',
      intermediateActing,
    ),
    final_narrative: phaseNarrative('final', 'final', finalActing),
    initial_draft_readings: draftReadings,
    intermediate_draft_readings: draftReadings,
    final_draft_readings: draftReadings,
    ...Object.fromEntries(
      intermediateFigures.map((line, index) => [
        `int_figure_line_${index + 1}`,
        line,
      ]),
    ),
    ...Object.fromEntries(
      finalFigures.map((line, index) => [`fin_figure_line_${index + 1}`, line]),
    ),
    init_trim_obs: numericField('init_trim_obs', 4),
    init_fwd_mean: numericField('init_fwd_mean', 3),
    init_fwd_corr: numericField('init_fwd_corr', 4),
    init_trim_corr: numericField('init_trim_corr', 4),
    init_mid_mean: numericField('init_mid_mean', 3),
    init_mid_corr: numericField('init_mid_corr', 4),
    init_heel: numericField('init_heel', 2),
    init_heel_side: value(data['init_heel_side'], ''),
    init_aft_mean: numericField('init_aft_mean', 3),
    init_aft_corr: numericField('init_aft_corr', 4),
    init_deflection: numericField('init_deflection', 1),
    init_deflection_type: value(data['init_deflection_type'], ''),
    int_trim_obs: numericField('int_trim_obs', 4),
    int_fwd_mean: numericField('int_fwd_mean', 3),
    int_fwd_corr: numericField('int_fwd_corr', 4),
    int_trim_corr: numericField('int_trim_corr', 4),
    int_mid_mean: numericField('int_mid_mean', 3),
    int_mid_corr: numericField('int_mid_corr', 4),
    int_list: numericField('int_list', 2),
    int_list_side: value(data['int_list_side'], ''),
    int_aft_mean: numericField('int_aft_mean', 3),
    int_aft_corr: numericField('int_aft_corr', 4),
    int_deflection: numericField('int_deflection', 1),
    int_deflection_type: value(data['int_deflection_type'], ''),
    fin_trim_obs: numericField('fin_trim_obs', 4),
    fin_fwd_mean: numericField('fin_fwd_mean', 3),
    fin_fwd_corr: numericField('fin_fwd_corr', 4),
    fin_trim_corr: numericField('fin_trim_corr', 4),
    fin_mid_mean: numericField('fin_mid_mean', 3),
    fin_mid_corr: numericField('fin_mid_corr', 4),
    fin_list: numericField('fin_list', 2),
    fin_list_side: value(data['fin_list_side'], ''),
    fin_aft_mean: numericField('fin_aft_mean', 3),
    fin_aft_corr: numericField('fin_aft_corr', 4),
    fin_deflection: numericField('fin_deflection', 1),
    fin_deflection_type: value(data['fin_deflection_type'], ''),
    // This image module treats object values as pre-resolved relationship data,
    // so template values are stable string keys resolved by getImage below.
    coverPhoto: 'coverPhoto',
    sheetInitial: 'sheetInitial',
    sheetIntermediate: 'sheetIntermediate',
    sheetFinal: 'sheetFinal',
    photosInitial: (input.phasePhotos.initial ?? []).map((_photo, index) => ({
      photo: `photoInitial${index}`,
    })),
    photosIntermediate: (input.phasePhotos.intermediate ?? []).map(
      (_photo, index) => ({ photo: `photoIntermediate${index}` }),
    ),
    photosFinal: (input.phasePhotos.final ?? []).map((_photo, index) => ({
      photo: `photoFinal${index}`,
    })),
  };
}

export async function buildReportDocxFromTemplate(
  input: DocxInput,
): Promise<Buffer> {
  const template = await readFile(fileURLToPath(TEMPLATE_URL));
  const templateZip = new PizZip(template);
  prepareTemplateLayout(templateZip);
  const photoScale = Math.max(0.7, Math.min(1, input.photoScale ?? 1));
  const photoCounts = {
    initial: input.phasePhotos.initial?.length ?? 0,
    intermediate:
      input.data['intermediate_date'] == null ||
      input.data['intermediate_date'] === ''
        ? 0
        : (input.phasePhotos.intermediate?.length ?? 0),
    final: input.phasePhotos.final?.length ?? 0,
  };
  /**
   * O módulo gratuito sempre grava a mídia com extensão PNG. Para manter o
   * pacote compatível com Word/Collabora sem inflar JPEGs de câmera para dezenas
   * de MB, rasterizamos no máximo a 2x o tamanho físico usado no documento.
   * Isso conserva aproximadamente 192 dpi na impressão e reduz drasticamente
   * memória, upload e instabilidade de paginação no editor.
   */
  const asPng = async (
    image: Buffer | null | undefined,
    displaySize: readonly [number, number],
  ): Promise<Buffer> => {
    if (image == null || image.length === 0) return EMPTY_PNG;
    try {
      return await sharp(image)
        .rotate()
        .resize({
          width: displaySize[0] * 2,
          height: displaySize[1] * 2,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
    } catch (error) {
      // Compatibilidade com PNGs mínimos/legados que Word aceita apesar de CRC
      // não canônico. JPEG/HEIC inválido continua falhando de forma explícita.
      const isPng = image
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      if (isPng) return image;
      throw error;
    }
  };
  const images = new Map<string, Buffer>();
  const fixedImages = await Promise.all([
    asPng(input.coverPhoto, scaledSize(COVER_IMAGE_SIZE, photoScale)),
    asPng(input.sheetImages.initial, [684, 264]),
    asPng(input.sheetImages.intermediate, [684, 244]),
    asPng(input.sheetImages.final, [684, 244]),
  ]);
  images.set('coverPhoto', fixedImages[0]!);
  images.set('sheetInitial', fixedImages[1]!);
  images.set('sheetIntermediate', fixedImages[2]!);
  images.set('sheetFinal', fixedImages[3]!);
  for (const [index, photo] of (input.phasePhotos.initial ?? []).entries())
    images.set(
      `photoInitial${index}`,
      await asPng(
        photo,
        photoCounts.initial > 1
          ? photoGridMetrics(photoCounts.initial, photoScale).imageSize
          : scaledSize(SINGLE_PHOTO_SIZE, photoScale),
      ),
    );
  for (const [index, photo] of (input.phasePhotos.intermediate ?? []).entries())
    images.set(
      `photoIntermediate${index}`,
      await asPng(
        photo,
        photoCounts.intermediate > 1
          ? photoGridMetrics(photoCounts.intermediate, photoScale).imageSize
          : scaledSize(SINGLE_PHOTO_SIZE, photoScale),
      ),
    );
  for (const [index, photo] of (input.phasePhotos.final ?? []).entries())
    images.set(
      `photoFinal${index}`,
      await asPng(
        photo,
        photoCounts.final > 1
          ? photoGridMetrics(photoCounts.final, photoScale).imageSize
          : scaledSize(SINGLE_PHOTO_SIZE, photoScale),
      ),
    );
  const imageModule = new ImageModule({
    centered: false,
    fileType: 'docx',
    getImage: (tagValue) => images.get(String(tagValue)) ?? EMPTY_PNG,
    getSize: (_image, _tagValue, tagName) => {
      if (tagName === 'coverPhoto')
        return [...scaledSize(COVER_IMAGE_SIZE, photoScale)];
      if (tagName === 'sheetInitial') return [684, 264];
      if (tagName === 'sheetIntermediate' || tagName === 'sheetFinal')
        return [684, 244];
      const key = String(_tagValue);
      const inMultiPhotoPhase =
        (key.startsWith('photoInitial') && photoCounts.initial > 1) ||
        (key.startsWith('photoIntermediate') && photoCounts.intermediate > 1) ||
        (key.startsWith('photoFinal') && photoCounts.final > 1);
      if (!inMultiPhotoPhase)
        return [...scaledSize(SINGLE_PHOTO_SIZE, photoScale)];
      const count = key.startsWith('photoInitial')
        ? photoCounts.initial
        : key.startsWith('photoIntermediate')
          ? photoCounts.intermediate
          : photoCounts.final;
      return [...photoGridMetrics(count, photoScale).imageSize];
    },
  });
  const document = new Docxtemplater(templateZip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  document.render(makeTemplateData(input));
  const renderedZip = document.getZip();
  arrangePhasePhotosInTwoColumns(renderedZip, photoCounts);
  return renderedZip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }) as Buffer;
}
