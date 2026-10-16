/** MSC filled in the client's Word package; layout belongs to the template. */
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import sharp from 'sharp';
import {
  formatNumberWithDecimals,
  type FieldValue,
  type NumberFormatMap,
} from '@naabsa/core';
import { fitPhotoSize } from './msc-photo-layout';

export interface TimeLogRow {
  event: string;
  date: string | null;
  start: string | null;
  flag: string | null;
  end: string | null;
}
export interface DocxInputMsc {
  data: Record<string, FieldValue>;
  numberFormats?: NumberFormatMap;
  logo: Buffer | null;
  coverPhoto?: Buffer | null;
  /** Reduced only after native pagination detects overflowing cover contacts. */
  coverMaxHeightMm?: number;
  photos: {
    vessel?: Buffer[];
    engine_room?: Buffer[];
    survey_attendance?: Buffer[];
    ecr?: Buffer[];
    /** Legacy alias: appended to Vessel; no separate Hull section is printed. */
    hull?: Buffer[];
  };
  timeLogRows: TimeLogRow[];
  tocPages?: Record<string, number>;
}

// Docxtemplater supplies its OOXML DOM; no second XML dependency is required.
interface XmlNode {
  nodeName: string;
  nodeType: number;
  textContent: string | null;
  childNodes: ArrayLike<XmlNode>;
  parentNode: XmlNode | null;
  firstChild: XmlNode | null;
  nextSibling: XmlNode | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  getElementsByTagName(name: string): ArrayLike<XmlNode>;
  appendChild(node: XmlNode): XmlNode;
  insertBefore(node: XmlNode, reference: XmlNode | null): XmlNode;
  removeChild(node: XmlNode): XmlNode;
  cloneNode(deep: boolean): XmlNode;
}
interface XmlDocument extends XmlNode {
  createElementNS(namespace: string, name: string): XmlNode;
  createTextNode(value: string): XmlNode;
}
const xmlTools = (
  Docxtemplater as unknown as {
    DocUtils: {
      str2xml(xml: string): XmlDocument;
      xml2str(node: XmlNode): string;
    };
  }
).DocUtils;
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const TEMPLATE_URL = new URL(
  '../../../../templates/msc.clean.docx',
  import.meta.url,
);
const all = (node: XmlNode, tag: string): XmlNode[] =>
  Array.from(node.getElementsByTagName(tag));
const children = (node: XmlNode, tag?: string): XmlNode[] =>
  Array.from(node.childNodes).filter(
    (child) => child.nodeType === 1 && (!tag || child.nodeName === tag),
  );
const remove = (node: XmlNode) => node.parentNode?.removeChild(node);
const value = (raw: FieldValue | undefined, fallback = '—'): string =>
  raw == null || raw === '' ? fallback : String(raw);
const affirmative = (raw: FieldValue | undefined) =>
  raw === true ||
  (typeof raw === 'string' &&
    /^(yes|y|sim|true|x|updated|attached)$/i.test(raw.trim()));
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

function dateParts(raw: FieldValue | undefined): Record<string, string> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw ?? ''));
  if (match) {
    const year = +match[1]!,
      month = +match[2]!,
      day = +match[3]!;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      const ordinal =
        day === 1 || day === 21 || day === 31
          ? 'st'
          : day === 2 || day === 22
            ? 'nd'
            : day === 3 || day === 23
              ? 'rd'
              : 'th';
      return {
        month: MONTHS[month - 1]!,
        day: String(day),
        ordinal,
        year: String(year),
      };
    }
  }
  return { month: '—', day: '', ordinal: '', year: '' };
}
const shortDate = (raw: string | null): string => {
  if (!raw) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
};
const NUMERIC_DECIMALS: Record<string, number> = {
  delivered: 0,
  loa: 2,
  lbp: 2,
  breadth: 2,
  depth: 2,
  light_ship: 2,
  net_tonnage: 0,
  gross_tonnage: 0,
  purifier_temp: 0,
  purifier_bowl_freq: 0,
  temp_engine_room: 0,
  temp_sea_water: 0,
  sludge_rate_chief: 3,
  sludge_rate_surveyor: 3,
  sludge_percentage: 2,
  flowmeter_accuracy: 2,
  consumption_flowmeter_percentage: 2,
};
function normalName(raw: FieldValue | undefined): string {
  const particles = new Set([
    'de',
    'da',
    'do',
    'das',
    'dos',
    'e',
    'and',
    'of',
    'the',
  ]);
  return value(raw).replace(
    /(^|[\s'’-])(\p{L}[\p{L}\p{M}]*)/gu,
    (_match, separator: string, word: string, offset: number) => {
      const lower = word.toLowerCase();
      const name = word === word.toUpperCase() ? lower : word;
      return (
        separator +
        (offset > 0 && particles.has(lower)
          ? lower
          : name[0]!.toUpperCase() + name.slice(1))
      );
    },
  );
}
function templateData(input: DocxInputMsc): Record<string, string> {
  const data = { ...input.data };
  const flowmeter = data['flowmeter_total'];
  const soundings = Object.hasOwn(data, 'flowmeter_soundings')
    ? data['flowmeter_soundings']
    : data['consumption_surveyor'];
  const finite = (value: FieldValue | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value);
  // The source report uses (flowmeter - soundings) / flowmeter, matching
  // LOG Audit's logbook comparison. Derive before formatting or rounding.
  if (
    !Object.hasOwn(data, 'consumption_flowmeter_difference') &&
    finite(flowmeter) &&
    finite(soundings)
  )
    data['consumption_flowmeter_difference'] = flowmeter - soundings;
  const difference = data['consumption_flowmeter_difference'];
  if (
    !Object.hasOwn(data, 'consumption_flowmeter_percentage') &&
    finite(flowmeter) &&
    flowmeter !== 0 &&
    finite(difference)
  )
    data['consumption_flowmeter_percentage'] = (difference / flowmeter) * 100;
  const result: Record<string, string> = {};
  for (const [name, raw] of Object.entries(data)) {
    if (typeof raw === 'number') {
      const grouped =
        !/^(delivered|loa|lbp|breadth|depth|purifier_|temp_)/.test(name);
      const decimals =
        input.numberFormats?.[name] ??
        NUMERIC_DECIMALS[name] ??
        (/percentage$/.test(name) ? 2 : 3);
      const signed = /^grade_\d+_(difference|percentage)$/.test(name);
      result[name] = Number.isFinite(raw)
        ? `${signed ? (raw >= 0 ? '+ ' : '- ') : ''}${formatNumberWithDecimals(signed ? Math.abs(raw) : raw, decimals, grouped)}`
        : '—';
    } else result[name] = value(raw);
  }
  // Client's institutional surveyor is fixed, independent of Summary!B15.
  result['surveyors'] = 'Mr. Wagner de Abreu';
  for (const field of ['flag', 'port', 'captain', 'chief_engineer'])
    result[field] = normalName(input.data[field]);
  result['contact_manager_company'] = value(
    input.data['contact_manager_company'] ?? input.data['manager'],
  );
  result['contact_manager_name'] = value(
    input.data['contact_manager_name'],
    'Capt. Robert Masse',
  );
  result['flowmeter_soundings'] ??= result['consumption_surveyor'] ?? '—';
  const actor = /^(\d+)(st|nd|rd|th)(.*)$/i.exec(
    value(input.data['surveyed_by']),
  );
  result['surveyed_by'] = actor?.[1] ?? value(input.data['surveyed_by']);
  result['surveyed_by_ordinal'] = actor?.[2] ?? '';
  result['surveyed_by_role'] = actor?.[3] ?? '';
  // Mapping notes do not authorize silently changing Summary B18 to F7/F16.
  for (const [prefix, raw] of [
    ['cover_date', input.data['berthing_date']],
    ['survey_date', input.data['berthing_date']],
    ['last_discharge_date', input.data['last_discharge_date']],
  ] as const) {
    for (const [part, text] of Object.entries(dateParts(raw)))
      result[`${prefix}_${part}`] = text;
  }
  const updated = [
    affirmative(input.data['logbook_updated']) ? 'logbook' : null,
    affirmative(input.data['vrs_updated']) ? 'VRS' : null,
  ].filter(Boolean);
  result['records_updated_sentence'] =
    updated.length === 2
      ? 'After calculations, the logbook  and VRS  were updated\u00a0according to the figures disclosed by surveyor:\u00a0'
      : updated.length
        ? `After calculations, the ${updated[0]} was updated according to the figures disclosed by surveyor:`
        : '';
  for (const [id, page] of Object.entries(input.tocPages ?? {}))
    result[`toc_${id}`] = String(page);
  return result;
}
function ancestor(node: XmlNode, tag: string): XmlNode {
  let current: XmlNode | null = node;
  while (current && current.nodeName !== tag) current = current.parentNode;
  if (!current) throw new Error(`Template MSC sem elemento ${tag}.`);
  return current;
}
function bookmark(doc: XmlNode, name: string): XmlNode {
  const node = all(doc, 'w:bookmarkStart').find(
    (mark) => mark.getAttribute('w:name') === name,
  );
  if (!node) throw new Error(`Template MSC sem bookmark ${name}.`);
  return node;
}
function property(
  doc: XmlDocument,
  node: XmlNode,
  container: string,
  name: string,
  enabled = true,
): void {
  let properties = children(node, container)[0];
  if (!properties) {
    properties = doc.createElementNS(W, container);
    node.insertBefore(properties, node.firstChild);
  }
  for (const old of children(properties, name)) remove(old);
  if (enabled) {
    const created = doc.createElementNS(W, name);
    if (name === 'w:keepNext' || name === 'w:pageBreakBefore')
      properties.insertBefore(
        created,
        children(properties).find(
          (child) =>
            child.nodeName !== 'w:pStyle' &&
            !(
              name === 'w:pageBreakBefore' &&
              (child.nodeName === 'w:keepNext' ||
                child.nodeName === 'w:keepLines')
            ),
        ) ?? null,
      );
    else if (name === 'w:cantSplit')
      properties.insertBefore(
        created,
        children(properties).find(
          (child) =>
            child.nodeName === 'w:trHeight' || child.nodeName === 'w:tblHeader',
        ) ?? null,
      );
    else properties.appendChild(created);
  }
}
function setText(doc: XmlDocument, node: XmlNode, text: string): void {
  while (node.firstChild) node.removeChild(node.firstChild);
  node.appendChild(
    doc.createTextNode(
      // OOXML excludes these ASCII control characters; retain tabs/newlines.
      // eslint-disable-next-line no-control-regex
      text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''),
    ),
  );
  node.setAttribute('xml:space', 'preserve');
}
function fillTags(
  doc: XmlDocument,
  root: XmlNode,
  values: Record<string, string>,
  skip?: ReadonlySet<XmlNode>,
): void {
  for (const node of all(root, 'w:t')) {
    if (skip?.has(node)) continue;
    const text = node.textContent ?? '';
    if (/\{[a-zA-Z][\w]*(?::\d+:\d*)?\}/.test(text))
      setText(
        doc,
        node,
        text.replace(
          /\{([a-zA-Z][\w]*)(?::(\d+):(\d*))?\}/g,
          (_match, tag: string, offset?: string, length?: string) => {
            const replacement =
              values[tag] ?? (tag.startsWith('toc_') ? '' : '—');
            return offset == null
              ? replacement
              : Array.from(replacement)
                  .slice(+offset, length ? +offset + +length : undefined)
                  .join('');
          },
        ),
      );
  }
}
function replaceTextSpan(
  doc: XmlDocument,
  nodes: XmlNode[],
  start: number,
  length: number,
  replacement: string,
): void {
  let offset = 0;
  for (const node of nodes) {
    const content = node.textContent ?? '',
      next = offset + content.length;
    if (next > start && offset < start + length) {
      const from = Math.max(0, start - offset),
        to = Math.min(content.length, start + length - offset);
      setText(
        doc,
        node,
        content.slice(0, from) +
          (offset <= start ? replacement : '') +
          content.slice(to),
      );
    }
    offset = next;
  }
}
function alignSurveyorFigures(doc: XmlDocument): void {
  const heading = ancestor(bookmark(doc, 's3_7'), 'w:p');
  const paragraphs = children(heading.parentNode!, 'w:p');
  const rows = paragraphs
    .slice(paragraphs.indexOf(heading) + 1)
    .filter((paragraph) => (paragraph.textContent ?? '').trim())
    .slice(0, 4);
  const columns = [
    ['Surv', null],
    ['Soundings', 'flowmeter_soundings'],
    ['Flowmeters', 'flowmeter_total'],
    ['Dif', 'consumption_flowmeter_difference'],
  ] as const;
  const insertTab = (paragraph: XmlNode, before: XmlNode) => {
    const run = doc.createElementNS(W, 'w:r');
    const formatting = children(before, 'w:rPr')[0];
    if (formatting) run.appendChild(formatting.cloneNode(true));
    run.appendChild(doc.createElementNS(W, 'w:tab'));
    paragraph.insertBefore(run, before);
  };
  for (const [index, [label, field]] of columns.entries()) {
    const paragraph = rows[index]!;
    const runs = children(paragraph, 'w:r');
    const right = [...runs]
      .reverse()
      .find((run) => (run.textContent ?? '').startsWith(label))!;
    // Replace the source's mixed spaces/default tabs with fixed column stops.
    for (const run of runs.slice(0, runs.indexOf(right)).reverse()) {
      if (!(run.textContent ?? '').trim()) remove(run);
      else {
        const last = all(run, 'w:t').at(-1)!;
        setText(doc, last, (last.textContent ?? '').trimEnd());
        break;
      }
    }
    insertTab(paragraph, right);
    if (field) {
      const texts = all(paragraph, 'w:t');
      const first = texts.findIndex((node) => node.parentNode === right);
      const number = texts.findIndex(
        (node, i) =>
          i > first && (node.textContent ?? '').includes(`{${field}`),
      );
      // Keep the source labels, leaders and run formatting; discard padding.
      for (const node of texts.slice(first, number))
        setText(doc, node, (node.textContent ?? '').trimEnd());
      const numeric = texts[number]!;
      setText(doc, numeric, (numeric.textContent ?? '').trimStart());
      const colon = texts[number - 1]!;
      setText(doc, colon, `${colon.textContent ?? ''} `);
      insertTab(paragraph, ancestor(numeric, 'w:r'));
    }
    const properties = children(paragraph, 'w:pPr')[0]!;
    for (const old of children(properties, 'w:tabs')) remove(old);
    const tabs = doc.createElementNS(W, 'w:tabs');
    for (const position of [4320, 5940]) {
      const tab = doc.createElementNS(W, 'w:tab');
      tab.setAttribute('w:val', 'left');
      tab.setAttribute('w:pos', String(position));
      tabs.appendChild(tab);
    }
    properties.insertBefore(
      tabs,
      children(properties).find((node) =>
        ['w:spacing', 'w:ind', 'w:jc', 'w:rPr'].includes(node.nodeName),
      ) ?? null,
    );
  }
}
function normalizeMissingDates(
  doc: XmlDocument,
  values: Record<string, string>,
): void {
  for (const paragraph of all(doc, 'w:p'))
    for (const prefix of ['cover_date', 'survey_date', 'last_discharge_date']) {
      if (values[`${prefix}_month`] !== '—') continue;
      const nodes = all(paragraph, 'w:t');
      const full = nodes.map((node) => node.textContent ?? '').join('');
      const match = new RegExp(
        `\\{${prefix}_month(?::[^}]*)?\\}[\\s\\S]*\\{${prefix}_year(?::[^}]*)?\\}\\s*(?=[,.]|$)`,
      ).exec(full);
      if (match) replaceTextSpan(doc, nodes, match.index, match[0].length, '—');
    }
}
function linkContents(doc: XmlDocument): void {
  for (const paragraph of all(doc, 'w:p')) {
    const match = /\{toc_(s\d+(?:_\d+)?)\}/.exec(paragraph.textContent ?? '');
    if (!match) continue;
    const link = doc.createElementNS(W, 'w:hyperlink');
    link.setAttribute('w:anchor', match[1]!);
    link.setAttribute('w:history', '1');
    for (const node of children(paragraph).filter(
      (node) => node.nodeName !== 'w:pPr',
    ))
      link.appendChild(node);
    paragraph.appendChild(link);
  }
}
function fillGradeRows(doc: XmlDocument, input: DocxInputMsc): void {
  const table = ancestor(bookmark(doc, 'msc_grade_rows'), 'w:tbl');
  for (const [i, row] of children(table, 'w:tr').slice(1).entries()) {
    if (!affirmative(input.data[`grade_${i + 1}_present`])) remove(row);
  }
}
function fillTimeLog(doc: XmlDocument, input: DocxInputMsc): void {
  const table = ancestor(bookmark(doc, 'msc_time_log'), 'w:tbl');
  const original = children(table, 'w:tr');
  const header = original[0]!;
  property(doc, header, 'w:trPr', 'w:tblHeader');
  property(doc, header, 'w:trPr', 'w:cantSplit');
  for (const row of original.slice(1)) remove(row);
  const compact = input.timeLogRows.length <= 12;
  for (const p of all(header, 'w:p'))
    property(
      doc,
      p,
      'w:pPr',
      'w:keepNext',
      compact && input.timeLogRows.length > 0,
    );
  for (const [i, row] of input.timeLogRows.entries()) {
    const clone = (original[i + 1] ?? original[1])!.cloneNode(true);
    const index = original[i + 1] ? i + 1 : 1;
    const entries = {
      event: row.event,
      date: shortDate(row.date),
      start: row.start ?? '',
      flag: row.flag ?? '',
      end: row.end ?? '',
    };
    fillTags(
      doc,
      clone,
      Object.fromEntries(
        Object.entries(entries).map(([key, text]) => [
          `time_log_${index}_${key}`,
          text,
        ]),
      ),
    );
    for (const cell of children(clone, 'w:tc')) {
      for (const p of all(cell, 'w:p'))
        property(
          doc,
          p,
          'w:pPr',
          'w:keepNext',
          compact && i < input.timeLogRows.length - 1,
        );
    }
    property(doc, clone, 'w:trPr', 'w:cantSplit');
    table.appendChild(clone);
  }
  // The client wants the Time log as aligned text, with no printed grid.
  // Direct cell borders must also override the template's Table Grid style.
  for (const [node, properties, borderTag] of [
    [table, 'w:tblPr', 'w:tblBorders'],
    ...all(table, 'w:tc').map(
      (cell) => [cell, 'w:tcPr', 'w:tcBorders'] as const,
    ),
  ] as const) {
    property(doc, node, properties, borderTag);
    const borders = all(node, borderTag)[0]!;
    for (const side of [
      'top',
      'left',
      'bottom',
      'right',
      'insideH',
      'insideV',
    ]) {
      const border = doc.createElementNS(W, `w:${side}`);
      border.setAttribute('w:val', 'nil');
      borders.appendChild(border);
    }
  }
}
function optionalSections(doc: XmlDocument, input: DocxInputMsc): void {
  if (!affirmative(input.data['last_attendance'])) {
    const start = ancestor(bookmark(doc, 's3_8'), 'w:p'),
      end = ancestor(bookmark(doc, 's4'), 'w:p');
    let node: XmlNode | null = start;
    while (node && node !== end) {
      const next: XmlNode | null = node.nextSibling;
      remove(node);
      node = next;
    }
    const toc = all(doc, 'w:hyperlink').find(
      (link) => link.getAttribute('w:anchor') === 's3_8',
    );
    if (toc) remove(ancestor(toc, 'w:p'));
  }
  const robOnly =
    /\brob\b/i.test(value(input.data['appointed_service'], '')) &&
    !/sludge/i.test(value(input.data['appointed_service'], ''));
  if (robOnly) {
    for (const paragraph of all(doc, 'w:p')) {
      const text = all(paragraph, 'w:t')
        .map((node) => node.textContent ?? '')
        .join('');
      if (
        /Follow-up the sludge disposal|To disclose the fuel oil consumption and to ascertain the sludge rate production/.test(
          text,
        )
      )
        remove(paragraph);
      else if (
        text.includes('and to verify the total amount of sludge disposed')
      ) {
        const texts = all(paragraph, 'w:t');
        const full = texts.map((node) => node.textContent ?? '').join('');
        const match =
          /[,\s]*and to verify the total amount of sludge disposed\.?/.exec(
            full,
          );
        if (match)
          replaceTextSpan(doc, texts, match.index, match[0].length, '.');
      }
    }
  }
}
async function fillImages(
  doc: XmlDocument,
  zip: PizZip,
  input: DocxInputMsc,
): Promise<void> {
  const rels = xmlTools.str2xml(
      zip.file('word/_rels/document.xml.rels')!.asText(),
    ),
    relRoot = children(rels)[0]!;
  let imageId = 0;
  async function replaceImage(
    drawing: XmlNode,
    buffer: Buffer,
    cover = false,
    partialGallery = false,
  ): Promise<boolean> {
    const original = await sharp(buffer).metadata();
    const preserveBytes =
      (original.format === 'jpeg' || original.format === 'png') &&
      (!original.orientation || original.orientation === 1);
    const normalized = preserveBytes
      ? buffer
      : await sharp(buffer).rotate().png().toBuffer();
    const meta = await sharp(normalized).metadata(),
      extent = all(drawing, 'wp:extent')[0]!;
    const box = {
      width: cover
        ? 160
        : partialGallery
          ? 80
          : Math.min(80, Number(extent.getAttribute('cx')) / 36000),
      height: cover
        ? Math.min(120, Math.max(40, input.coverMaxHeightMm ?? 120))
        : partialGallery
          ? 60
          : Math.min(60, Number(extent.getAttribute('cy')) / 36000),
    };
    const size = fitPhotoSize(
      { width: meta.width!, height: meta.height! },
      box,
    );
    const crop = all(drawing, 'a:srcRect')[0];
    const fraction = (side: string) =>
      Number(crop?.getAttribute(side) ?? 0) / 100000;
    const sourceAspect =
      Number(extent.getAttribute('cx')) / Number(extent.getAttribute('cy'));
    const croppedAspect =
      (meta.width! * (1 - fraction('l') - fraction('r'))) /
      (meta.height! * (1 - fraction('t') - fraction('b')));
    const sourceId = all(drawing, 'a:blip')[0]!.getAttribute('r:embed');
    const sourceRelation = all(rels, 'Relationship').find(
      (node) => node.getAttribute('Id') === sourceId,
    );
    const sourceBytes =
      sourceRelation &&
      zip
        .file(posix.normalize(`word/${sourceRelation.getAttribute('Target')}`))
        ?.asNodeBuffer();
    // The exemplar crop belongs to its original bitmap. Never transfer it to
    // operator photos or a partial gallery's new row geometry.
    const keepCrop =
      !partialGallery &&
      !!sourceBytes?.equals(normalized) &&
      Math.abs(croppedAspect - sourceAspect) < 0.0001;
    const sourceWidth = Number(extent.getAttribute('cx')) / 36000,
      sourceHeight = Number(extent.getAttribute('cy')) / 36000;
    const keepFrame =
      keepCrop &&
      (!cover || (sourceWidth <= box.width && sourceHeight <= box.height));
    const fitted = keepCrop
      ? fitPhotoSize({ width: sourceWidth, height: sourceHeight }, box)
      : size;
    const width = keepFrame
        ? extent.getAttribute('cx')!
        : String(Math.round(fitted.width * 36000)),
      height = keepFrame
        ? extent.getAttribute('cy')!
        : String(Math.round(fitted.height * 36000));
    extent.setAttribute('cx', width);
    extent.setAttribute('cy', height);
    for (const ext of all(drawing, 'a:ext'))
      if (ext.getAttribute('cx') != null) {
        ext.setAttribute('cx', width);
        ext.setAttribute('cy', height);
      }
    if (!keepCrop) for (const crop of all(drawing, 'a:srcRect')) remove(crop);
    const id = `rIdMscImage${++imageId}`,
      target = `media/msc-image-${imageId}.${preserveBytes && original.format === 'jpeg' ? 'jpeg' : 'png'}`;
    const relation = rels.createElementNS(REL, 'Relationship');
    relation.setAttribute('Id', id);
    relation.setAttribute(
      'Type',
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
    );
    relation.setAttribute('Target', target);
    relRoot.appendChild(relation);
    all(drawing, 'a:blip')[0]!.setAttribute('r:embed', id);
    zip.file(`word/${target}`, normalized);
    return !!sourceBytes?.equals(normalized);
  }
  const cover = ancestor(bookmark(doc, 'msc_cover'), 'w:p'),
    coverBuffer =
      input.coverPhoto === undefined
        ? input.photos.vessel?.[0]
        : input.coverPhoto;
  for (const drawing of all(cover, 'w:drawing')) {
    if (coverBuffer) await replaceImage(drawing, coverBuffer, true);
    else remove(drawing);
  }
  const groups: [keyof DocxInputMsc['photos'], string, string][] = [
    ['vessel', 's5_1', 's5_2'],
    ['engine_room', 's5_2', 's5_3'],
    ['survey_attendance', 's5_3', 's5_4'],
    ['ecr', 's5_4', 's6'],
  ];
  let partialGallery = false;
  for (const [slot, startId, endId] of groups) {
    const start = ancestor(bookmark(doc, startId), 'w:p'),
      end = ancestor(bookmark(doc, endId), 'w:p');
    const nodes: XmlNode[] = [];
    for (
      let node = start.nextSibling;
      node && node !== end;
      node = node.nextSibling
    )
      nodes.push(node);
    const drawings = nodes.flatMap((node) => all(node, 'w:drawing')),
      photos = input.photos[slot] ?? [];
    const prototype = ancestor(drawings[0]!, 'w:r').cloneNode(true),
      imageParagraph = ancestor(drawings.at(-1)!, 'w:p');
    for (const [index, drawing] of drawings.entries()) {
      if (photos[index])
        await replaceImage(
          drawing,
          photos[index]!,
          false,
          photos.length !== drawings.length,
        );
      else remove(drawing);
    }
    for (const photo of photos.slice(drawings.length)) {
      const run = prototype.cloneNode(true);
      await replaceImage(all(run, 'w:drawing')[0]!, photo, false, true);
      imageParagraph.appendChild(run);
    }
    // The source's 4:3 landscape pairs wrap naturally. Narrower frames need
    // explicit pair breaks to avoid three or four photos on one line.
    for (const paragraph of nodes.filter((node) => node.nodeName === 'w:p')) {
      const images = all(paragraph, 'w:drawing');
      if (images.length) {
        const properties = children(paragraph, 'w:pPr')[0]!;
        let spacing = children(properties, 'w:spacing')[0];
        if (!spacing) {
          spacing = doc.createElementNS(W, 'w:spacing');
          properties.appendChild(spacing);
        }
        // A 50% line height in the exemplar clips inline photos in Collabora.
        // This also applies when the original bitmaps are reused: Collabora
        // clips those pictures too; desktop Word overlaps only the row leading.
        spacing.setAttribute('w:line', '240');
        spacing.setAttribute('w:lineRule', 'auto');
      }
      const needsPairBreaks = images.some((image) => {
        const extent = all(image, 'wp:extent')[0]!;
        return (
          Number(extent.getAttribute('cx')) * 3 <
          Number(extent.getAttribute('cy')) * 4
        );
      });
      if (needsPairBreaks)
        for (let index = 1; index < images.length - 1; index += 2)
          ancestor(images[index]!, 'w:r').appendChild(
            doc.createElementNS(W, 'w:br'),
          );
    }
    if (photos.length !== drawings.length) {
      partialGallery = true;
      // Unfilled source rows are padding for the exemplar's photo count. Keep
      // semantic text and section properties, but remove their empty frames.
      for (const node of nodes)
        if (
          node.nodeName === 'w:p' &&
          !(node.textContent ?? '').trim() &&
          !all(node, 'w:drawing').length &&
          !all(node, 'w:sectPr').length
        )
          remove(node);
      if (photos.length) {
        property(doc, start, 'w:pPr', 'w:keepNext');
        if (slot === 'vessel') {
          const reportHeading = ancestor(bookmark(doc, 's5'), 'w:p');
          for (let node = reportHeading.nextSibling; node && node !== start; ) {
            const next = node.nextSibling;
            if (
              node.nodeName === 'w:p' &&
              !(node.textContent ?? '').trim() &&
              !all(node, 'w:drawing').length &&
              !all(node, 'w:sectPr').length
            )
              remove(node);
            node = next;
          }
          property(doc, reportHeading, 'w:pPr', 'w:keepNext');
        }
      }
    }
  }
  if (partialGallery) {
    // A shorter gallery can leave room for only part of this fixed six-item
    // list. Keep its heading, spacer and items together instead of orphaning
    // the final certificate on a page by itself.
    const attachments: XmlNode[] = [];
    for (
      let node: XmlNode | null = ancestor(bookmark(doc, 's6'), 'w:p');
      node?.nodeName === 'w:p';
      node = node.nextSibling
    )
      attachments.push(node);
    for (const paragraph of attachments.slice(0, -1))
      property(doc, paragraph, 'w:pPr', 'w:keepNext');
  }
  all(doc, 'wp:docPr').forEach((node, index) =>
    node.setAttribute('id', String(index + 100)),
  );
  // Cloned bookmarks are paired in document order, not by reused source IDs.
  let bookmarkId = 1000;
  const pending = new Map<string, string[]>();
  for (const node of all(doc, 'w:bookmarkStart').concat(
    all(doc, 'w:bookmarkEnd'),
  )) {
    const old = node.getAttribute('w:id') ?? '',
      ids = pending.get(old) ?? [];
    if (node.nodeName === 'w:bookmarkStart') {
      const id = String(bookmarkId++);
      ids.push(id);
      node.setAttribute('w:id', id);
      pending.set(old, ids);
    } else node.setAttribute('w:id', ids.shift() ?? String(bookmarkId++));
  }
  const used = new Set(
      all(doc, 'a:blip').map((node) => node.getAttribute('r:embed')),
    ),
    candidates: string[] = [];
  for (const relation of all(rels, 'Relationship'))
    if (
      relation.getAttribute('Type')?.endsWith('/image') &&
      !used.has(relation.getAttribute('Id'))
    ) {
      candidates.push(
        posix.normalize(`word/${relation.getAttribute('Target')}`),
      );
      remove(relation);
    }
  zip.file('word/_rels/document.xml.rels', xmlTools.xml2str(rels));
  const targets = new Set<string>();
  for (const name of Object.keys(zip.files).filter((name) =>
    name.endsWith('.rels'),
  )) {
    const part = xmlTools.str2xml(zip.file(name)!.asText()),
      folder = name.includes('/_rels/')
        ? name.slice(0, name.indexOf('/_rels/'))
        : '';
    for (const relation of all(part, 'Relationship'))
      if (relation.getAttribute('TargetMode') !== 'External')
        targets.add(
          posix
            .normalize(`${folder}/${relation.getAttribute('Target')}`)
            .replace(/^\//, ''),
        );
  }
  for (const name of candidates) if (!targets.has(name)) zip.remove(name);
  if (input.logo)
    for (const part of [
      'word/_rels/header1.xml.rels',
      'word/_rels/header2.xml.rels',
    ]) {
      const xml = zip.file(part);
      if (!xml) continue;
      for (const relation of all(
        xmlTools.str2xml(xml.asText()),
        'Relationship',
      ))
        if (relation.getAttribute('Type')?.endsWith('/image')) {
          const target = posix.normalize(
            `word/${relation.getAttribute('Target')}`,
          );
          if (zip.file(target)?.asNodeBuffer().equals(input.logo)) continue;
          zip.file(
            target,
            posix.extname(target).toLowerCase() === '.png'
              ? await sharp(input.logo).png().toBuffer()
              : await sharp(input.logo).jpeg().toBuffer(),
          );
        }
    }
  const types = xmlTools.str2xml(zip.file('[Content_Types].xml')!.asText());
  if (
    !all(types, 'Default').some(
      (node) => node.getAttribute('Extension') === 'png',
    )
  ) {
    const png = types.createElementNS(
      'http://schemas.openxmlformats.org/package/2006/content-types',
      'Default',
    );
    png.setAttribute('Extension', 'png');
    png.setAttribute('ContentType', 'image/png');
    children(types)[0]!.appendChild(png);
    zip.file('[Content_Types].xml', xmlTools.xml2str(types));
  }
}
export async function buildReportDocxMsc(input: DocxInputMsc): Promise<Buffer> {
  input = {
    ...input,
    photos: {
      ...input.photos,
      vessel: [...(input.photos.vessel ?? []), ...(input.photos.hull ?? [])],
      hull: [],
    },
  };
  const zip = new PizZip(await readFile(TEMPLATE_URL)),
    doc = xmlTools.str2xml(zip.file('word/document.xml')!.asText());
  linkContents(doc);
  fillGradeRows(doc, input);
  optionalSections(doc, input);
  const contents = all(doc, 'w:p').find(
    (node) => node.textContent === 'Contents',
  )!;
  const preceding = children(contents.parentNode!);
  const beforeContents = preceding[preceding.indexOf(contents) - 1]!;
  const contactTable = preceding
    .slice(0, preceding.indexOf(contents))
    .filter((node) => node.nodeName === 'w:tbl')
    .at(-1)!;
  const contactEnd = all(contactTable, 'w:p').at(-1)!;
  const mark = doc.createElementNS(W, 'w:bookmarkStart');
  mark.setAttribute('w:id', '99999');
  mark.setAttribute('w:name', 'msc_cover_contacts_end');
  contactEnd.appendChild(mark);
  const markEnd = doc.createElementNS(W, 'w:bookmarkEnd');
  markEnd.setAttribute('w:id', '99999');
  contactEnd.appendChild(markEnd);
  const coverSpacer = preceding[preceding.indexOf(contents) - 2]!;
  // An extra empty cover paragraph can flow onto page 2 in LibreOffice before
  // this break and create a blank page. Keep only the original leading line.
  if (
    coverSpacer.nodeName === 'w:p' &&
    !(coverSpacer.textContent ?? '').trim() &&
    !all(coverSpacer, 'w:drawing').length &&
    !all(coverSpacer, 'w:bookmarkStart').length &&
    !all(coverSpacer, 'w:bookmarkEnd').length &&
    !all(coverSpacer, 'w:sectPr').length
  )
    remove(coverSpacer);
  // The source uses one empty line at the top of the Contents page. Retain
  // that exact line while anchoring the page independently of cover aspect.
  property(doc, beforeContents, 'w:pPr', 'w:pageBreakBefore');
  property(doc, beforeContents, 'w:pPr', 'w:keepNext');
  await fillImages(doc, zip, input);
  const values = templateData(input);
  if (
    /\brob\b/i.test(value(input.data['appointed_service'], '')) &&
    !/sludge/i.test(value(input.data['appointed_service'], ''))
  ) {
    for (const field of Object.keys(values))
      if (
        /^(sludge_|retained_|consumption_chief$|consumption_surveyor$)/.test(
          field,
        )
      )
        values[field] = '—';
  }
  const timeLogTexts = new Set(
    all(ancestor(bookmark(doc, 'msc_time_log'), 'w:tbl'), 'w:t'),
  );
  normalizeMissingDates(doc, values);
  alignSurveyorFigures(doc);
  fillTags(doc, doc, values, timeLogTexts);
  // Fill operator text after structural transforms, preserving substantive text.
  fillTimeLog(doc, input);
  normalizeTimeLogPadding(doc);
  zip.file('word/document.xml', xmlTools.xml2str(doc));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function normalizeTimeLogPadding(doc: XmlDocument): boolean {
  const mark = all(doc, 'w:bookmarkStart').find(
    (node) => node.getAttribute('w:name') === 'msc_time_log',
  );
  if (!mark) return false;
  const table = ancestor(mark, 'w:tbl');
  let changed = false;
  for (const paragraph of all(table, 'w:p')) {
    if (
      ['w:br', 'w:tab', 'w:drawing', 'w:object', 'w:fldChar'].some(
        (tag) => all(paragraph, tag).length > 0,
      )
    )
      continue;
    // Word ignores trailing nonbreaking padding; Collabora wraps it into
    // blank lines. Preserve every character position and run, using ordinary
    // spaces only in the trailing suffix. Internal NBSPs remain meaningful.
    for (const node of all(paragraph, 'w:t').reverse()) {
      const text = node.textContent ?? '';
      const suffix = /[\s\u00a0]*$/.exec(text)![0];
      if (suffix.includes('\u00a0')) {
        setText(
          doc,
          node,
          text.slice(0, text.length - suffix.length) +
            suffix.replace(/\u00a0/g, ' '),
        );
        changed = true;
      }
      if (suffix.length < text.length) break;
    }
  }
  return changed;
}

/** Apply only known MSC compatibility fixes, retaining operator content. */
export function repairMscCollaboraLayout(docx: Buffer): {
  docx: Buffer;
  changed: boolean;
} {
  const zip = new PizZip(docx);
  const doc = xmlTools.str2xml(zip.file('word/document.xml')!.asText());
  let changed = normalizeTimeLogPadding(doc);
  for (const mark of all(doc, 'w:bookmarkStart').filter((node) =>
    node.getAttribute('w:name')?.startsWith('msc_photos_'),
  )) {
    const first = ancestor(mark, 'w:p');
    for (
      let paragraph: XmlNode | null = first;
      paragraph;
      paragraph = paragraph.nextSibling
    ) {
      if (paragraph.nodeName !== 'w:p') {
        if (paragraph.nodeName === 'w:tbl' || paragraph.nodeName === 'w:sectPr')
          break;
        continue;
      }
      const properties = children(paragraph, 'w:pPr')[0];
      const style =
        properties &&
        children(properties, 'w:pStyle')[0]?.getAttribute('w:val');
      // Original rows have individual markers; inserted rows may not. Stop
      // at the next gallery/section rather than changing unrelated photos.
      if (
        paragraph !== first &&
        (all(paragraph, 'w:bookmarkStart').some((node) =>
          /^(?:s\d+(?:_\d+)?|msc_photos_.+)$/.test(
            node.getAttribute('w:name') ?? '',
          ),
        ) ||
          /^(?:Heading|Ttulo)[1-9]$/.test(style ?? '') ||
          all(paragraph, 'w:sectPr').length > 0)
      )
        break;
      if (!properties || !all(paragraph, 'w:drawing').length) continue;
      const spacing = children(properties, 'w:spacing')[0];
      if (
        spacing?.getAttribute('w:line') === '120' &&
        spacing.getAttribute('w:lineRule') === 'auto'
      ) {
        spacing.setAttribute('w:line', '240');
        changed = true;
      }
    }
  }
  if (!changed) return { docx, changed: false };
  zip.file('word/document.xml', xmlTools.xml2str(doc));
  return {
    docx: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
    changed: true,
  };
}

/** Shrink only the cover frame; retain its crop, bitmap and operator content. */
export function fitMscCoverPhoto(docx: Buffer, maxHeightMm: number): Buffer {
  const zip = new PizZip(docx);
  const doc = xmlTools.str2xml(zip.file('word/document.xml')!.asText());
  const cover = ancestor(bookmark(doc, 'msc_cover'), 'w:p');
  shrinkCoverFrame(cover, maxHeightMm * 36000);
  zip.file('word/document.xml', xmlTools.xml2str(doc));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function shrinkCoverFrame(cover: XmlNode, maxHeightEmu: number): void {
  for (const drawing of all(cover, 'w:drawing')) {
    const extent = all(drawing, 'wp:extent')[0];
    if (!extent) continue;
    const height = Number(extent.getAttribute('cy'));
    if (height <= maxHeightEmu) continue;
    const fitted = fitPhotoSize(
      { width: Number(extent.getAttribute('cx')), height },
      { width: Number(extent.getAttribute('cx')), height: maxHeightEmu },
    );
    for (const frame of [extent, ...all(drawing, 'a:ext')]) {
      if (frame.getAttribute('cx') == null) continue;
      frame.setAttribute('cx', String(Math.round(fitted.width)));
      frame.setAttribute('cy', String(Math.round(fitted.height)));
    }
  }
}

/** Refresh allocated pictures while keeping the operator's other Word edits. */
export function replaceMscPhotoSections(
  original: Buffer,
  rendered: Buffer,
): Buffer {
  const zip = new PizZip(original),
    source = new PizZip(rendered);
  const doc = xmlTools.str2xml(zip.file('word/document.xml')!.asText());
  const fresh = xmlTools.str2xml(source.file('word/document.xml')!.asText());
  const oldStart = ancestor(bookmark(doc, 's5'), 'w:p');
  const oldEnd = ancestor(bookmark(doc, 's6'), 'w:p');
  const newStart = ancestor(bookmark(fresh, 's5'), 'w:p');
  const newEnd = ancestor(bookmark(fresh, 's6'), 'w:p');
  // Collabora rewrites style and numbering IDs when saving. Reuse the
  // destination paragraph properties so new photo headings remain in its
  // existing outline (and Attachment keeps its number).
  const preserveParagraphProperties = (from: XmlNode, to: XmlNode) => {
    const oldProperties = children(from).find(
      (node) => node.nodeName === 'w:pPr',
    );
    if (!oldProperties) return;
    for (const node of children(to).filter((node) => node.nodeName === 'w:pPr'))
      remove(node);
    to.insertBefore(oldProperties.cloneNode(true), to.firstChild);
  };
  const oldHeadings = new Map(
    all(doc, 'w:bookmarkStart')
      .filter((mark) => /^s5(?:_\d+)?$/.test(mark.getAttribute('w:name') ?? ''))
      .map((mark) => [mark.getAttribute('w:name')!, ancestor(mark, 'w:p')]),
  );
  const section = (start: XmlNode, end: XmlNode) => {
    const nodes: XmlNode[] = [];
    for (
      let node: XmlNode | null = start;
      node && node !== end;
      node = node.nextSibling
    )
      nodes.push(node);
    return nodes;
  };
  const incoming = section(newStart, newEnd);
  const knownText = new Set(
    incoming.map((node) => (node.textContent ?? '').trim()),
  );
  const captions = section(oldStart, oldEnd).filter(
    (node) =>
      (node.textContent ?? '').trim() &&
      !knownText.has((node.textContent ?? '').trim()) &&
      !all(node, 'w:bookmarkStart').some((mark) =>
        /^s5(?:_\d+)?$/.test(mark.getAttribute('w:name') ?? ''),
      ) &&
      !all(node, 'w:drawing').length,
  );
  const copied: XmlNode[] = [];
  for (const node of [...incoming, ...captions]) {
    const clone = node.cloneNode(true);
    for (const mark of all(clone, 'w:bookmarkStart')) {
      const id = mark.getAttribute('w:name') ?? '';
      if (!/^s5(?:_\d+)?$/.test(id)) continue;
      const existing = oldHeadings.get(id) ?? oldHeadings.get('s5_4');
      if (existing)
        preserveParagraphProperties(existing, ancestor(mark, 'w:p'));
    }
    oldEnd.parentNode!.insertBefore(clone, oldEnd);
    copied.push(clone);
  }
  for (const node of section(oldStart, copied[0]!)) remove(node);
  const cover = ancestor(bookmark(doc, 'msc_cover'), 'w:p');
  const newCover = ancestor(bookmark(fresh, 'msc_cover'), 'w:p').cloneNode(
    true,
  );
  preserveParagraphProperties(cover, newCover);
  const previousHeight = Number(all(cover, 'wp:extent')[0]?.getAttribute('cy'));
  if (previousHeight > 0) shrinkCoverFrame(newCover, previousHeight);
  cover.parentNode!.insertBefore(newCover, cover);
  remove(cover);
  copied.push(newCover);

  // Only the photo entries change; preserve other Contents labels and styles.
  const tocEnd = all(doc, 'w:hyperlink').find(
    (link) => link.getAttribute('w:anchor') === 's6',
  );
  if (!tocEnd) throw new Error('Sumário MSC sem entrada Attachment.');
  const oldPhotoLinks = all(doc, 'w:hyperlink').filter((link) =>
    /^s5(?:_\d+)?$/.test(link.getAttribute('w:anchor') ?? ''),
  );
  const oldTocParagraphs = new Map(
    oldPhotoLinks.map((link) => [
      link.getAttribute('w:anchor')!,
      ancestor(link, 'w:p'),
    ]),
  );
  for (const link of oldPhotoLinks) remove(ancestor(link, 'w:p'));
  for (const link of all(fresh, 'w:hyperlink').filter((link) =>
    /^s5(?:_\d+)?$/.test(link.getAttribute('w:anchor') ?? ''),
  )) {
    const clone = ancestor(link, 'w:p').cloneNode(true),
      end = ancestor(tocEnd, 'w:p');
    const previous =
      oldTocParagraphs.get(link.getAttribute('w:anchor')!) ??
      oldTocParagraphs.get('s5_4');
    if (previous) preserveParagraphProperties(previous, clone);
    end.parentNode!.insertBefore(clone, end);
  }
  const rels = xmlTools.str2xml(
    zip.file('word/_rels/document.xml.rels')!.asText(),
  );
  const sourceRels = xmlTools.str2xml(
    source.file('word/_rels/document.xml.rels')!.asText(),
  );
  const prefix = `PhotoSync${randomUUID().replaceAll('-', '')}`;
  let imageIndex = 0;
  for (const node of copied)
    for (const blip of all(node, 'a:blip')) {
      const relation = all(sourceRels, 'Relationship').find(
        (rel) => rel.getAttribute('Id') === blip.getAttribute('r:embed'),
      );
      if (!relation) throw new Error('Foto MSC sem relacionamento de imagem.');
      const target = relation.getAttribute('Target')!;
      const name = `media/${prefix}-${++imageIndex}${posix.extname(target)}`;
      const bytes = source.file(posix.normalize(`word/${target}`));
      if (!bytes) throw new Error('Foto MSC ausente no documento atualizado.');
      zip.file(`word/${name}`, bytes.asNodeBuffer());
      const copy = relation.cloneNode(true),
        id = `${prefix}_${imageIndex}`;
      copy.setAttribute('Id', id);
      copy.setAttribute('Target', name);
      children(rels)[0]!.appendChild(copy);
      blip.setAttribute('r:embed', id);
    }
  // Both documents originate from the same MSC template; retain all existing
  // content types and add only image formats introduced by the new pictures.
  const types = xmlTools.str2xml(zip.file('[Content_Types].xml')!.asText());
  const sourceTypes = xmlTools.str2xml(
    source.file('[Content_Types].xml')!.asText(),
  );
  for (const entry of all(sourceTypes, 'Default'))
    if (
      !all(types, 'Default').some(
        (old) =>
          old.getAttribute('Extension') === entry.getAttribute('Extension'),
      )
    )
      children(types)[0]!.appendChild(entry.cloneNode(true));
  let markId = 0;
  const markIds = new Map<string, string[]>();
  for (const node of all(doc, '*').filter(
    (node) =>
      node.nodeName === 'w:bookmarkStart' || node.nodeName === 'w:bookmarkEnd',
  )) {
    const key = node.getAttribute('w:id') ?? '',
      ids = markIds.get(key) ?? [];
    if (node.nodeName === 'w:bookmarkStart') {
      const id = String(++markId);
      ids.push(id);
      markIds.set(key, ids);
      node.setAttribute('w:id', id);
    } else node.setAttribute('w:id', ids.shift() ?? String(++markId));
  }
  all(doc, 'wp:docPr').forEach((node, index) =>
    node.setAttribute('id', String(index + 1)),
  );
  zip.file('word/document.xml', xmlTools.xml2str(doc));
  zip.file('word/_rels/document.xml.rels', xmlTools.xml2str(rels));
  zip.file('[Content_Types].xml', xmlTools.xml2str(types));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function updateMscTocPages(
  docx: Buffer,
  pages: Record<string, number>,
): Buffer {
  const zip = new PizZip(docx),
    doc = xmlTools.str2xml(zip.file('word/document.xml')!.asText());
  for (const link of all(doc, 'w:hyperlink')) {
    const page = pages[link.getAttribute('w:anchor') ?? ''];
    if (!page) continue;
    const text = all(link, 'w:t')
      .reverse()
      .find((node) => /\d+\s*$/.test(node.textContent ?? ''));
    if (!text)
      throw new Error('Sumário MSC sem número de página para atualizar.');
    setText(
      doc,
      text,
      (text.textContent ?? '').replace(/\d+(\s*)$/, `${page}$1`),
    );
  }
  zip.file('word/document.xml', xmlTools.xml2str(doc));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
