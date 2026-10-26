import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import {
  BQS_PHOTO_SLOTS,
  buildReportDocxBqs,
  type DocxInputBqs,
} from './buildDocxBqs';
import { convertDocxToPdf } from './soffice';
import { extractPdfText } from './pdfText';

interface XmlNode {
  nodeName: string;
  textContent: string | null;
  parentNode: XmlNode | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  getElementsByTagName(name: string): ArrayLike<XmlNode>;
  cloneNode(deep: boolean): XmlNode;
  appendChild(node: XmlNode): XmlNode;
  replaceChild(newNode: XmlNode, oldNode: XmlNode): XmlNode;
  removeChild(node: XmlNode): XmlNode;
}
const xmlTools = (
  Docxtemplater as unknown as {
    DocUtils: { str2xml(xml: string): XmlNode; xml2str(node: XmlNode): string };
  }
).DocUtils;
const all = (node: XmlNode, tag: string) =>
  Array.from(node.getElementsByTagName(tag));
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

/** Replace only the five explicit photo controls; preserve all other operator edits. */
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
  const find = (root: XmlNode, slot: string) => {
    const matches = all(root, 'w:sdt').filter((sdt) =>
      all(sdt, 'w:tag').some(
        (tag) => tag.getAttribute('w:val') === `bqs_photos_${slot}`,
      ),
    );
    if (matches.length !== 1)
      throw new Error(
        `BQS: área de foto ${slot} ausente ou duplicada no Word. Preserve o documento e restaure essa área.`,
      );
    return matches[0]!;
  };
  const copies: XmlNode[] = [];
  const oldImageIds = new Set<string>();
  for (const slot of BQS_PHOTO_SLOTS) {
    const old = find(doc, slot),
      replacement = find(other, slot).cloneNode(true);
    for (const node of all(old, '*')) {
      for (const attr of ['r:embed', 'r:link', 'r:id']) {
        const id = node.getAttribute(attr);
        if (id) oldImageIds.add(id);
      }
    }
    old.parentNode!.replaceChild(replacement, old);
    copies.push(replacement);
  }
  const imported = new Map<string, string>();
  for (const copy of copies)
    for (const blip of all(copy, 'a:blip')) {
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
  all(doc, 'wp:docPr').forEach((node, i) =>
    node.setAttribute('id', String(10000 + i)),
  );
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
