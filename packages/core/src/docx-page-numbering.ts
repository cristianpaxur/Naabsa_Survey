import PizZip from 'pizzip';

const PARAGRAPH = /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*<\/w:p>/g;
const textOf = (xml: string) =>
  [...xml.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)]
    .map((match) => match[1])
    .join('')
    .trim();

function withoutPageNumber(xml: string): string {
  return xml
    .replace(/<w:fldSimple\b[^>]*(?:\/>|>[\s\S]*?<\/w:fldSimple>)/g, (field) =>
      /\bw:instr="\s*PAGE(?:\s|&quot;|")/.test(field) ? '' : field,
    )
    .replace(
      /<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:fldChar\b[^>]*w:fldCharType="begin"[^>]*\/>[\s\S]*?<w:fldChar\b[^>]*w:fldCharType="end"[^>]*\/>[\s\S]*?<\/w:r>/g,
      (field) =>
        /<w:instrText\b[^>]*>\s*PAGE(?:\s|<)/.test(field) ? '' : field,
    );
}

/**
 * Split the one-section Draft Survey at Background. Cover/Contents have no
 * numbered footer; the body starts on the next page with PAGE = 1. Preserve the
 * edited body and every unrelated ZIP part. Existing custom sections are kept.
 */
export function restartDraftSurveyPageNumbers(docx: Buffer): Buffer {
  const zip = new PizZip(docx);
  const original = zip.file('word/document.xml')?.asText();
  if (!original) throw new Error('Documento sem word/document.xml.');
  const paragraphs = [...original.matchAll(PARAGRAPH)];
  const start = paragraphs.findIndex((p) =>
    /<w:bookmarkStart\b[^>]*w:name="s1"/.test(p[0]),
  );
  if (start < 0) return docx;
  const front = paragraphs.slice(0, start);
  if (
    !front.some((p) => textOf(p[0]) === 'Draft Survey') ||
    !front.some((p) => textOf(p[0]) === 'Contents')
  )
    return docx;
  const sections = [
    ...original.matchAll(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g),
  ];
  if (sections.length !== 1 || sections[0]!.index! < paragraphs[start]!.index!)
    return docx;
  const section = sections[0]![0];
  let rels = zip.file('word/_rels/document.xml.rels')?.asText();
  let types = zip.file('[Content_Types].xml')?.asText();
  if (!rels || !types)
    throw new Error('Documento sem relacionamentos de rodapé.');
  const cloneFooter = (reference: string): string => {
    const originalId = /r:id="([^"]+)"/.exec(reference)?.[1];
    const rel = (rels!.match(/<Relationship\b[^>]*\/>/g) ?? []).find(
      (r) => /\bId="([^"]+)"/.exec(r)?.[1] === originalId,
    );
    const target = /\bTarget="([^"]+)"/.exec(rel ?? '')?.[1];
    const sourcePath = target?.startsWith('/')
      ? target.slice(1)
      : `word/${target}`;
    const source = zip.file(sourcePath)?.asText();
    if (!source)
      throw new Error('Rodapé original indisponível para ajustar a numeração.');
    const directory = sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1);
    const filename = sourcePath.slice(directory.length);
    let suffix = 1;
    while (
      zip.file(`${directory}naabsa-front-footer${suffix}.xml`) ||
      rels!.includes(`Id="naabsaFrontFooter${suffix}"`)
    )
      suffix += 1;
    const footer = `naabsa-front-footer${suffix}.xml`;
    const id = `naabsaFrontFooter${suffix}`;
    zip.file(`${directory}${footer}`, withoutPageNumber(source));
    const sourceRels = zip.file(`${directory}_rels/${filename}.rels`);
    if (sourceRels)
      zip.file(`${directory}_rels/${footer}.rels`, sourceRels.asNodeBuffer());
    rels = rels!.replace(
      '</Relationships>',
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="/${directory}${footer}"/></Relationships>`,
    );
    types = types!.replace(
      '</Types>',
      `<Override PartName="/${directory}${footer}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`,
    );
    return reference.replace(`r:id="${originalId}"`, `r:id="${id}"`);
  };
  const frontSection = section
    .replace(/<w:footerReference\b[^>]*\/>/g, cloneFooter)
    .replace(/<w:pgNumType\b[^>]*\/>/g, '');
  let bodySection = section
    .replace(/<w:(?:titlePg|pgNumType|type)\b[^>]*\/>/g, '')
    .replace(
      /<w:(?:headerReference|footerReference)\b[^>]*w:type="first"[^>]*\/>/g,
      '',
    );
  bodySection = bodySection
    .replace(/(<w:pgSz\b)/, '<w:type w:val="nextPage"/>$1')
    .replace(
      /(<w:(?:cols|formProt|vAlign|noEndnote|textDirection|bidi|rtlGutter|docGrid|printerSettings|sectPrChange)\b|<\/w:sectPr>)/,
      '<w:pgNumType w:start="1"/>$1',
    );
  const heading = paragraphs[start]!;
  let prefix = original.slice(0, heading.index);
  const preceding = paragraphs[start - 1];
  const boundaryParagraph = preceding?.[0]
    .replace(/<w:br\b[^>]*w:type="page"[^>]*\/>/g, '')
    .replace(/<w:pageBreakBefore\b[^>]*\/>/g, '')
    .replace(/<w:pPr\s*\/>/, '<w:pPr></w:pPr>');
  if (
    preceding &&
    boundaryParagraph &&
    textOf(boundaryParagraph) === '' &&
    !/<w:(?:drawing|br|bookmarkStart|sectPr)\b/.test(boundaryParagraph) &&
    prefix.slice(preceding.index! + preceding[0].length).trim() === ''
  ) {
    const boundary = boundaryParagraph.includes('</w:pPr>')
      ? boundaryParagraph.replace('</w:pPr>', `${frontSection}</w:pPr>`)
      : boundaryParagraph.replace(
          /(<w:p\b[^>]*>)/,
          `$1<w:pPr>${frontSection}</w:pPr>`,
        );
    prefix = prefix.slice(0, preceding.index) + boundary;
  } else {
    prefix += `<w:p><w:pPr>${frontSection}</w:pPr></w:p>`;
  }
  const body = original
    .slice(heading.index! + heading[0].length)
    .replace(section, bodySection);
  zip.file(
    'word/document.xml',
    prefix + heading[0].replace(/<w:pageBreakBefore\b[^>]*\/>/g, '') + body,
  );
  zip.file('word/_rels/document.xml.rels', rels);
  zip.file('[Content_Types].xml', types);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
