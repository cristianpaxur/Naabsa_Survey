import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { buildReportDocxMsc, type DocxInputMsc } from './buildDocxMsc';
import { collaboraConversionUrl } from './collaboraConversion';
import { extractPdfText } from './pdfText';
import { convertDocxToPdf, measureBookmarkPages } from './soffice';

const normalize = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
interface XmlNode {
  nodeName: string;
  parentNode: XmlNode | null;
  textContent: string | null;
  getAttribute(name: string): string | null;
  getElementsByTagName(name: string): ArrayLike<XmlNode>;
}
const xmlTools = (
  Docxtemplater as unknown as { DocUtils: { str2xml(xml: string): XmlNode } }
).DocUtils;
const documentRoot = (docx: Buffer) =>
  xmlTools.str2xml(new PizZip(docx).file('word/document.xml')!.asText());
function requireMeasuredPages(
  pages: Record<string, number>,
  ids = ['msc_cover_contacts_end', 's1', 's6'],
): void {
  for (const id of ids)
    if (!Number.isInteger(pages[id]) || pages[id]! < 1)
      throw new Error(`Paginação MSC: não foi possível medir a seção ${id}.`);
}

/** Read the final PDF's body headings; dotted TOC lines never match exactly. */
export function mscPagesFromPdfText(
  docx: Buffer,
  text: string,
): Record<string, number> {
  const pages = text.split('\f');
  if (!pages.at(-1)?.trim()) pages.pop();
  const contents = pages.flatMap((page, index) =>
    page.split(/\r?\n/).some((line) => normalize(line) === 'contents')
      ? [index + 1]
      : [],
  );
  if (contents.length !== 1 || contents[0]! < 2)
    throw new Error(
      'Paginação MSC: página Contents não encontrada de forma única.',
    );
  const dom = documentRoot(docx);
  const result: Record<string, number> = {
    msc_cover_contacts_end: contents[0]! - 1,
  };
  for (const mark of Array.from(dom.getElementsByTagName('w:bookmarkStart'))) {
    const id = mark.getAttribute('w:name') ?? '';
    if (!/^s\d+(?:_\d+)?$/.test(id)) continue;
    let paragraph = mark.parentNode;
    while (paragraph && paragraph.nodeName !== 'w:p')
      paragraph = paragraph.parentNode;
    if (!paragraph)
      throw new Error(`Paginação MSC: seção ${id} sem parágrafo.`);
    const label = Array.from(paragraph.getElementsByTagName('w:t'))
      .map((node) => node.textContent ?? '')
      .join('');
    const wanted = normalize(id.slice(1).replace('_', '.') + '. ' + label);
    const matches = pages.flatMap((page, index) =>
      index + 1 > contents[0]! &&
      page.split(/\r?\n/).some((line) => normalize(line) === wanted)
        ? [index + 1]
        : [],
    );
    if (matches.length !== 1)
      throw new Error(
        `Paginação MSC: seção ${id} (${label}) ausente ou ambígua no PDF.`,
      );
    result[id] = matches[0]!;
  }
  return result;
}

/** Use the destination editor's engine whenever Collabora is configured. */
export async function measureMscPages(
  docx: Buffer,
): Promise<Record<string, number>> {
  if (!collaboraConversionUrl()) {
    const pages = await measureBookmarkPages(docx);
    const ids = Array.from(
      documentRoot(docx).getElementsByTagName('w:bookmarkStart'),
    )
      .map((mark) => mark.getAttribute('w:name') ?? '')
      .filter((id) => /^s\d+(?:_\d+)?$/.test(id));
    requireMeasuredPages(pages, ['msc_cover_contacts_end', ...ids]);
    return pages;
  }
  return mscPagesFromPdfText(
    docx,
    await extractPdfText(await convertDocxToPdf(docx)),
  );
}

interface PaginationDependencies {
  build: (input: DocxInputMsc) => Promise<Buffer>;
  measure: (docx: Buffer) => Promise<Record<string, number>>;
}
const samePages = (
  before: Record<string, number>,
  after: Record<string, number>,
) =>
  Object.entries(before)
    .filter(([id]) => /^s\d/.test(id) || id === 'msc_cover_contacts_end')
    .every(([id, page]) => after[id] === page);

/** Bounded native fit, followed by verification of the numbered final package. */
export async function buildPaginatedDocxMsc(
  input: DocxInputMsc,
  deps: PaginationDependencies = {
    build: buildReportDocxMsc,
    measure: measureMscPages,
  },
): Promise<Buffer> {
  let candidate = { ...input };
  let measured: Record<string, number> = {};
  for (const height of [undefined, 104, 88, 72]) {
    candidate = {
      ...input,
      ...(height == null ? {} : { coverMaxHeightMm: height }),
    };
    measured = await deps.measure(await deps.build(candidate));
    requireMeasuredPages(measured);
    if (measured['msc_cover_contacts_end'] === 1) break;
  }
  if (measured['msc_cover_contacts_end'] !== 1)
    throw new Error(
      'A capa MSC não comporta os contatos; revise os dados antes de gerar o documento.',
    );
  for (let attempt = 0; attempt < 2; attempt++) {
    const docx = await deps.build({ ...candidate, tocPages: measured });
    const finalPages = await deps.measure(docx);
    requireMeasuredPages(finalPages);
    if (samePages(measured, finalPages)) return docx;
    measured = finalPages;
  }
  throw new Error('A paginação MSC não estabilizou após atualizar o sumário.');
}
