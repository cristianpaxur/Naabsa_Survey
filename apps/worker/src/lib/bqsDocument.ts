import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import PizZip from 'pizzip';
import {
  BQS_PHOTO_SLOTS,
  buildReportDocxBqs,
  type DocxInputBqs,
} from './buildDocxBqs';
import { convertDocxToPdf } from './soffice';
import { extractPdfText } from './pdfText';
import {
  bqsXmlTools as xmlTools,
  xmlAll as all,
  resolveBqsPhotoRegions,
  type XmlNode,
} from './bqsPhotoRegions';

const read = (zip: PizZip, part: string) =>
  xmlTools.str2xml(zip.file(part)!.asText());
const norm = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const docPart = 'word/document.xml';

export function bqsPagesFromPdfText(
  docx: Buffer,
  text: string,
): Record<string, number> {
  const pages = text.split('\f'),
    doc = read(new PizZip(docx), docPart);
  const contents = pages.flatMap((page, i) =>
    page.split(/\r?\n/).some((line) => norm(line) === 'contents')
      ? [i + 1]
      : [],
  );
  if (contents.length !== 1 || contents[0]! < 2)
    throw new Error('BQS: sumário não encontrado de forma única no PDF.');
  const result: Record<string, number> = { bqs_cover_end: contents[0]! - 1 };
  for (const mark of all(doc, 'w:bookmarkStart')) {
    const name = mark.getAttribute('w:name') ?? '';
    if (!/^bqs_s\d+(?:_\d+)?$/.test(name)) continue;
    let p = mark.parentNode;
    while (p && p.nodeName !== 'w:p') p = p.parentNode;
    if (!p) throw new Error(`BQS: seção ${name} sem parágrafo.`);
    const rawLabel = all(p, 'w:t')
      .map((n) => n.textContent ?? '')
      .join('');
    // Native Word numbering is rendered in PDF, but is not a w:t in OOXML.
    // Bookmark IDs bind the expected section number, including repeated titles.
    const label =
      all(p, 'w:numPr').length && !/^\s*\d/.test(rawLabel)
        ? `${name.replace('bqs_s', '').replace(/_/g, '.')}. ${rawLabel}`
        : rawLabel;
    const matches = pages.flatMap((page, i) =>
      i + 1 > contents[0]! &&
      page.split(/\r?\n/).some((line) => norm(line) === norm(label))
        ? [i + 1]
        : [],
    );
    if (matches.length !== 1)
      throw new Error(`BQS: seção ${name} ausente ou ambígua no PDF.`);
    result[name] = matches[0]!;
  }
  if (Object.keys(result).length < 2)
    throw new Error('BQS: documento sem seções identificadas.');
  return result;
}

export function updateBqsTocPages(
  docx: Buffer,
  pages: Record<string, number>,
): Buffer {
  const zip = new PizZip(docx),
    doc = read(zip, docPart);
  for (const link of all(doc, 'w:hyperlink')) {
    const target = link.getAttribute('w:anchor') ?? '';
    if (!/^bqs_s\d/.test(target)) continue;
    if (!Number.isInteger(pages[target]) || pages[target]! < 1)
      throw new Error(`BQS: paginação ausente para ${target}.`);
    const texts = all(link, 'w:t'),
      last = texts.at(-1);
    if (!last || texts.length < 2)
      throw new Error(`BQS: item de sumário inválido ${target}.`);
    last.textContent = String(pages[target]);
  }
  zip.file(docPart, xmlTools.xml2str(doc));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Validate the converted snapshot without rebuilding or modifying approved edits. */
export function assertBqsPdfPagination(docx: Buffer, text: string): void {
  const pages = bqsPagesFromPdfText(docx, text);
  if (pages.bqs_cover_end !== 1)
    throw new Error('BQS: contatos da capa excedem uma página.');
  const contents = text.split('\f')[pages.bqs_cover_end]!;
  const lines = contents.split(/\r?\n/).map(norm);
  const doc = read(new PizZip(docx), docPart);
  const links = all(doc, 'w:hyperlink');
  for (const section of Object.keys(pages).filter(
    (id) => id !== 'bqs_cover_end',
  )) {
    if (
      links.filter((link) => link.getAttribute('w:anchor') === section)
        .length !== 1
    )
      throw new Error(
        `BQS: entrada do sumário ausente ou duplicada para ${section}. Restaure o sumário no editor antes de aprovar.`,
      );
  }
  for (const link of links) {
    const target = link.getAttribute('w:anchor') ?? '';
    if (!/^bqs_s\d/.test(target)) continue;
    const label = all(link, 'w:t')
      .slice(0, -1)
      .map((n) => n.textContent ?? '')
      .join('');
    if (!pages[target] || !lines.includes(norm(label) + pages[target]))
      throw new Error(
        `BQS: sumário desatualizado para ${label}. Atualize os campos no editor, salve e aprove novamente.`,
      );
  }
}

export async function measureBqsPages(
  docx: Buffer,
): Promise<Record<string, number>> {
  return bqsPagesFromPdfText(
    docx,
    await extractPdfText(await convertDocxToPdf(docx)),
  );
}

/** Measure the selected converter's actual PDF, including after photo changes. */
export async function paginateBqsDocx(
  docx: Buffer,
  measure = measureBqsPages,
): Promise<Buffer> {
  let pages = await measure(docx);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (pages.bqs_cover_end !== 1)
      throw new Error('BQS: contatos da capa excedem uma página.');
    const numbered = updateBqsTocPages(docx, pages),
      actual = await measure(numbered);
    if (Object.entries(pages).every(([id, page]) => actual[id] === page))
      return numbered;
    pages = actual;
  }
  throw new Error('BQS: paginação não estabilizou.');
}
export async function buildPaginatedDocxBqs(
  input: DocxInputBqs,
): Promise<Buffer> {
  return paginateBqsDocx(await buildReportDocxBqs(input));
}

/** Replace explicit photo ranges, including controls flattened by native editors. */
export function replaceBqsPhotoSections(
  original: Buffer,
  fresh: Buffer,
): Buffer {
  const zip = new PizZip(original),
    source = new PizZip(fresh);
  const doc = read(zip, docPart),
    other = read(source, docPart);
  const relPart = 'word/_rels/document.xml.rels';
  const rels = read(zip, relPart),
    freshRels = read(source, relPart);
  const oldRegions = resolveBqsPhotoRegions(doc);
  const freshRegions = resolveBqsPhotoRegions(other);
  const copies: XmlNode[] = [];
  const replacementsBySlot = BQS_PHOTO_SLOTS.map((slot) =>
    freshRegions[slot].blocks.map((block) => block.cloneNode(true)),
  );
  copies.push(...replacementsBySlot.flat());
  const importedBlips = copies.flatMap((copy) => all(copy, 'a:blip'));
  let bookmarkId =
    Math.max(
      0,
      ...all(doc, 'w:bookmarkStart').map(
        (mark) => Number(mark.getAttribute('w:id')) || 0,
      ),
    ) + 1;
  const bookmarkIds = new Map<string, string>();
  for (const mark of copies.flatMap((copy) => all(copy, 'w:bookmarkStart'))) {
    const oldId = mark.getAttribute('w:id')!;
    const newId = String(bookmarkId++);
    bookmarkIds.set(oldId, newId);
    mark.setAttribute('w:id', newId);
  }
  for (const mark of copies.flatMap((copy) => all(copy, 'w:bookmarkEnd'))) {
    const newId = bookmarkIds.get(mark.getAttribute('w:id')!);
    if (newId) mark.setAttribute('w:id', newId);
  }
  let drawingId =
    Math.max(
      0,
      ...all(doc, 'wp:docPr').map(
        (node) => Number(node.getAttribute('id')) || 0,
      ),
    ) + 1;
  for (const node of copies.flatMap((copy) => all(copy, 'wp:docPr')))
    node.setAttribute('id', String(drawingId++));
  const oldImageIds = new Set<string>();
  for (const [index, slot] of BQS_PHOTO_SLOTS.entries()) {
    const old = oldRegions[slot];
    const replacements = replacementsBySlot[index]!;
    for (const node of old.blocks.flatMap((block) => all(block, '*'))) {
      for (const attr of ['r:embed', 'r:link', 'r:id']) {
        const id = node.getAttribute(attr);
        if (id) oldImageIds.add(id);
      }
    }
    if (old.start && old.end) {
      const newStart = replacements
        .flatMap((block) => all(block, 'w:bookmarkStart'))
        .find((mark) => mark.getAttribute('w:name') === `bqs_photos_${slot}`);
      const newEnd = replacements
        .flatMap((block) => all(block, 'w:bookmarkEnd'))
        .find(
          (mark) =>
            mark.getAttribute('w:id') === newStart?.getAttribute('w:id'),
        );
      if (!newStart || !newEnd)
        throw new Error(`BQS: limites novos de foto ${slot} ausentes.`);
      const startParagraph = old.start.parentNode!;
      const endParagraph = old.end.parentNode!;
      const prefix = Array.from(startParagraph.childNodes)
        .slice(0, Array.from(startParagraph.childNodes).indexOf(old.start))
        .filter((node) => node.nodeName !== 'w:pPr');
      const suffix = Array.from(endParagraph.childNodes)
        .slice(Array.from(endParagraph.childNodes).indexOf(old.end) + 1)
        .filter((node) => node.nodeName !== 'w:pPr');
      for (const node of prefix)
        newStart.parentNode!.insertBefore(node.cloneNode(true), newStart);
      for (const node of suffix)
        newEnd.parentNode!.appendChild(node.cloneNode(true));
      // Paragraph formatting also belongs to text outside the photo range.
      for (const [previous, next, outside] of [
        [startParagraph, newStart.parentNode!, prefix],
        [endParagraph, newEnd.parentNode!, suffix],
      ] as const) {
        if (!outside.length) continue;
        for (const prop of Array.from(next.childNodes).filter(
          (node) => node.nodeName === 'w:pPr',
        ))
          next.removeChild(prop);
        const prop = Array.from(previous.childNodes).find(
          (node) => node.nodeName === 'w:pPr',
        );
        if (prop)
          next.insertBefore(
            prop.cloneNode(true),
            Array.from(next.childNodes)[0] ?? null,
          );
      }
    }
    const parent = old.blocks[0]!.parentNode!;
    for (const replacement of replacements)
      parent.insertBefore(replacement, old.blocks[0]!);
    for (const block of old.blocks) parent.removeChild(block);
  }
  const imported = new Map<string, string>();
  for (const blip of importedBlips) {
    const id = blip.getAttribute('r:embed');
    if (!id) throw new Error('BQS: imagem sem referência embutida.');
    if (!imported.has(id)) {
      const relation = all(freshRels, 'Relationship').find(
        (r) => r.getAttribute('Id') === id,
      );
      const target = relation?.getAttribute('Target') ?? '';
      if (!relation || !/^media\/[\w.-]+\.png$/.test(target))
        throw new Error('BQS: referência de foto inválida.');
      const payload = source.file(`word/${target}`);
      if (!payload) throw new Error('BQS: arquivo de foto ausente.');
      const token = randomUUID().replace(/-/g, ''),
        newId = `bqs_${token}`,
        newTarget = `media/bqs_${token}.png`;
      zip.file(`word/${newTarget}`, payload.asUint8Array());
      const rel = relation.cloneNode(true);
      rel.setAttribute('Id', newId);
      rel.setAttribute('Target', newTarget);
      all(rels, 'Relationships')[0]!.appendChild(rel);
      imported.set(id, newId);
    }
    blip.setAttribute('r:embed', imported.get(id)!);
  }
  const types = read(zip, '[Content_Types].xml');
  if (
    !all(types, 'Default').some((t) => t.getAttribute('Extension') === 'png')
  ) {
    const png = all(read(source, '[Content_Types].xml'), 'Default').find(
      (t) => t.getAttribute('Extension') === 'png',
    );
    if (imported.size && !png)
      throw new Error('BQS: tipo PNG ausente no pacote.');
    if (png) all(types, 'Types')[0]!.appendChild(png.cloneNode(true));
  }
  zip.file(docPart, xmlTools.xml2str(doc));
  // A removed photograph must also disappear from the downloadable ZIP. Keep
  // shared images if any remaining relationship (including headers) uses them.
  const usedIds = new Set(
    all(doc, '*').flatMap((node) =>
      ['r:embed', 'r:link', 'r:id']
        .map((attr) => node.getAttribute(attr))
        .filter(Boolean),
    ),
  );
  const obsoleteMedia = new Set<string>();
  for (const rel of all(rels, 'Relationship')) {
    const id = rel.getAttribute('Id') ?? '';
    if (
      !oldImageIds.has(id) ||
      usedIds.has(id) ||
      !rel.getAttribute('Type')?.endsWith('/image')
    )
      continue;
    const target = rel.getAttribute('Target') ?? '';
    if (rel.getAttribute('TargetMode') !== 'External') {
      obsoleteMedia.add(
        posix.normalize(
          target.startsWith('/')
            ? target.slice(1)
            : `word/${decodeURIComponent(target)}`,
        ),
      );
    }
    rel.parentNode!.removeChild(rel);
  }
  zip.file(relPart, xmlTools.xml2str(rels));
  const referenced = new Set<string>();
  for (const name of Object.keys(zip.files).filter((name) =>
    name.endsWith('.rels'),
  )) {
    const base = posix.dirname(posix.dirname(name));
    for (const rel of all(read(zip, name), 'Relationship')) {
      const target = rel.getAttribute('Target') ?? '';
      if (rel.getAttribute('TargetMode') !== 'External')
        referenced.add(
          posix.normalize(
            target.startsWith('/')
              ? target.slice(1)
              : posix.join(base, decodeURIComponent(target)),
          ),
        );
    }
  }
  for (const media of obsoleteMedia) {
    if (media.startsWith('word/media/') && !referenced.has(media)) {
      zip.remove(media);
      for (const override of all(types, 'Override')) {
        if (override.getAttribute('PartName') === `/${media}`)
          override.parentNode!.removeChild(override);
      }
    }
  }
  zip.file('[Content_Types].xml', xmlTools.xml2str(types));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
