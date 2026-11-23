import PizZip from 'pizzip';

/**
 * Upgrade the generated Contents page in-place: only its numeric runs become
 * PAGEREF fields. Keep the measured page as the cached result, and preserve
 * operator text, formatting and every unrelated package part.
 * Returning the original buffer also makes repeated opens a byte-for-byte no-op.
 */
export function enableDynamicToc(docx: Buffer): Buffer {
  const zip = new PizZip(docx);
  const original = zip.file('word/document.xml')?.asText();
  if (!original) throw new Error('Documento sem word/document.xml.');
  const marks = [
    ...original.matchAll(
      /<w:bookmarkStart\b[^>]*\bw:name="(s\d+(?:_\d+)?)"[^>]*\/?\s*>/g,
    ),
  ];
  if (!marks.length) return docx;
  const targets = new Set(marks.map((mark) => mark[1]));
  const firstSection = marks[0]!.index!;
  let changed = false;
  const xml = original.replace(
    /<w:hyperlink\b[^>]*\bw:anchor="(s\d+(?:_\d+)?)"[^>]*>[\s\S]*?<\/w:hyperlink>/g,
    (link: string, anchor: string, offset: number) => {
      if (offset >= firstSection || !targets.has(anchor)) return link;
      // Native fields from Word/Collabora (simple or complex) already work.
      if (/<w:(?:fldSimple|fldChar|instrText)\b/.test(link)) return link;
      const runs = [...link.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g)];
      const last = runs.at(-1);
      if (!last || !/<w:t\b/.test(last[0])) return link;
      const text = [...last[0].matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)]
        .map((match) => match[1])
        .join('');
      if (!/^\s*\d*\s*$/.test(text) || /<w:(?:tab|br|drawing)\b/.test(last[0]))
        return link;
      changed = true;
      const field = `<w:fldSimple w:instr=" PAGEREF ${anchor} \\h " w:dirty="true">${last[0]}</w:fldSimple>`;
      return (
        link.slice(0, last.index) +
        field +
        link.slice(last.index! + last[0].length)
      );
    },
  );
  if (!changed) return docx;
  const settings = zip.file('word/settings.xml')?.asText();
  if (!settings || !settings.includes('</w:settings>'))
    throw new Error('Documento sem configurações de atualização de campos.');
  const update = '<w:updateFields w:val="true"/>';
  zip.file('word/document.xml', xml);
  zip.file(
    'word/settings.xml',
    /<w:updateFields\b/.test(settings)
      ? settings.replace(
          /<w:updateFields\b[^>]*(?:\/>|>[\s\S]*?<\/w:updateFields>)/g,
          update,
        )
      : settings.replace('</w:settings>', `${update}</w:settings>`),
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
