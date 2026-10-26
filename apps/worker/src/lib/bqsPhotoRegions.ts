import Docxtemplater from 'docxtemplater';
import type PizZip from 'pizzip';

export const BQS_PHOTO_SLOTS = [
  'cover',
  'sounding_tables',
  'vessel_tanks',
  'barge_tanks',
  'sampling',
] as const;
export type BqsPhotoSlot = (typeof BQS_PHOTO_SLOTS)[number];

export interface XmlNode {
  nodeName: string;
  textContent: string | null;
  parentNode: XmlNode | null;
  childNodes: ArrayLike<XmlNode>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  getElementsByTagName(name: string): ArrayLike<XmlNode>;
  cloneNode(deep: boolean): XmlNode;
  appendChild(node: XmlNode): XmlNode;
  insertBefore(node: XmlNode, before: XmlNode | null): XmlNode;
  replaceChild(newNode: XmlNode, oldNode: XmlNode): XmlNode;
  removeChild(node: XmlNode): XmlNode;
}
export const bqsXmlTools = (
  Docxtemplater as unknown as {
    DocUtils: { str2xml(xml: string): XmlNode; xml2str(node: XmlNode): string };
  }
).DocUtils;
export const xmlAll = (node: XmlNode, tag: string) =>
  Array.from(node.getElementsByTagName(tag));
const nameFor = (slot: BqsPhotoSlot) => `bqs_photos_${slot}`;
const invalid = (slot: BqsPhotoSlot): never => {
  throw new Error(
    `BQS: área de foto ${slot} ausente, duplicada ou com limites inválidos no Word. Preserve o documento e restaure essa área.`,
  );
};
const controls = (doc: XmlNode, slot: BqsPhotoSlot) =>
  xmlAll(doc, 'w:sdt').filter((sdt) =>
    xmlAll(sdt, 'w:tag').some(
      (tag) => tag.getAttribute('w:val') === nameFor(slot),
    ),
  );

/** Add native ranges inside existing paragraphs; no layout blocks are added. */
export function addBqsPhotoBookmarks(zip: PizZip): void {
  const doc = bqsXmlTools.str2xml(zip.file('word/document.xml')!.asText());
  let nextId =
    Math.max(
      0,
      ...xmlAll(doc, 'w:bookmarkStart').map(
        (mark) => Number(mark.getAttribute('w:id')) || 0,
      ),
    ) + 1;
  for (const slot of BQS_PHOTO_SLOTS) {
    const matches = controls(doc, slot);
    if (matches.length !== 1) invalid(slot);
    const paragraphs = xmlAll(matches[0]!, 'w:p');
    const first = paragraphs[0],
      last = paragraphs.at(-1);
    if (!first || !last) invalid(slot);
    const id = String(nextId++);
    const markerDoc = bqsXmlTools.str2xml(
      `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:bookmarkStart w:id="${id}" w:name="${nameFor(slot)}"/><w:bookmarkEnd w:id="${id}"/></w:p>`,
    );
    const start = xmlAll(markerDoc, 'w:bookmarkStart')[0]!;
    const end = xmlAll(markerDoc, 'w:bookmarkEnd')[0]!;
    first!.insertBefore(
      start,
      Array.from(first!.childNodes).find((node) => node.nodeName !== 'w:pPr') ??
        null,
    );
    last!.appendChild(end);
  }
  zip.file('word/document.xml', bqsXmlTools.xml2str(doc));
}

export interface BqsPhotoRegion {
  blocks: XmlNode[];
  start?: XmlNode;
  end?: XmlNode;
}

/** Resolve only explicit ranges or exact legacy body controls, never headings. */
export function resolveBqsPhotoRegions(
  doc: XmlNode,
): Record<BqsPhotoSlot, BqsPhotoRegion> {
  const bodies = xmlAll(doc, 'w:body');
  if (bodies.length !== 1) invalid('cover');
  const body = bodies[0]!;
  const bodyBlocks = Array.from(body.childNodes);
  const elements = xmlAll(doc, '*');
  const starts = xmlAll(doc, 'w:bookmarkStart');
  const ends = xmlAll(doc, 'w:bookmarkEnd');
  const native = starts.some((mark) =>
    mark.getAttribute('w:name')?.startsWith('bqs_photos_'),
  );
  const owned = new Set<XmlNode>();
  let previousEnd = -1;
  const result = {} as Record<BqsPhotoSlot, BqsPhotoRegion>;
  const bodyBlock = (node: XmlNode, slot: BqsPhotoSlot): XmlNode => {
    let current = node;
    while (current.parentNode && current.parentNode !== body)
      current = current.parentNode;
    if (current.parentNode !== body) invalid(slot);
    return current;
  };
  for (const slot of BQS_PHOTO_SLOTS) {
    const sdts = controls(doc, slot);
    if (sdts.length > 1) invalid(slot);
    let region: BqsPhotoRegion;
    if (!native) {
      if (sdts.length !== 1 || sdts[0]!.parentNode !== body) invalid(slot);
      region = { blocks: [sdts[0]!] };
    } else {
      const matching = starts.filter(
        (mark) => mark.getAttribute('w:name') === nameFor(slot),
      );
      if (matching.length !== 1) invalid(slot);
      const start = matching[0]!;
      const id = start.getAttribute('w:id');
      const matchingEnds = ends.filter(
        (mark) => mark.getAttribute('w:id') === id,
      );
      if (
        !id ||
        starts.filter((mark) => mark.getAttribute('w:id') === id).length !==
          1 ||
        matchingEnds.length !== 1
      )
        invalid(slot);
      const end = matchingEnds[0]!;
      const from = elements.indexOf(start),
        to = elements.indexOf(end);
      if (
        from < 0 ||
        to <= from ||
        from <= previousEnd ||
        start.parentNode?.nodeName !== 'w:p' ||
        end.parentNode?.nodeName !== 'w:p'
      )
        invalid(slot);
      previousEnd = to;
      if (
        elements
          .slice(from + 1, to)
          .some(
            (node) =>
              node.nodeName === 'w:sectPr' ||
              (node.nodeName === 'w:bookmarkStart' &&
                /^(?:bqs_s\d|bqs_photos_)/.test(
                  node.getAttribute('w:name') ?? '',
                )) ||
              (node.nodeName === 'w:tag' &&
                /^(?:bqs_manual_|bqs_photos_)/.test(
                  node.getAttribute('w:val') ?? '',
                ) &&
                node.getAttribute('w:val') !== nameFor(slot)),
          )
      )
        invalid(slot);
      const first = bodyBlocks.indexOf(bodyBlock(start, slot));
      const last = bodyBlocks.indexOf(bodyBlock(end, slot));
      if (first < 0 || last < first) invalid(slot);
      region = { blocks: bodyBlocks.slice(first, last + 1), start, end };
    }
    for (const block of region.blocks) {
      if (owned.has(block)) invalid(slot);
      owned.add(block);
      // Whole block replacement must never consume an unrelated manual field,
      // section anchor, or another photo control, even outside the range.
      if (
        xmlAll(block, 'w:bookmarkStart').some((mark) =>
          /^bqs_s\d/.test(mark.getAttribute('w:name') ?? ''),
        ) ||
        xmlAll(block, 'w:tag').some((tag) =>
          /^bqs_manual_/.test(tag.getAttribute('w:val') ?? ''),
        )
      )
        invalid(slot);
    }
    result[slot] = region;
  }
  return result;
}
