import PizZip from 'pizzip';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { repairMscCollaboraLayout } from './buildDocxMsc';

const makeDocx = (body: string) => {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  zip.file('word/media/operator-photo.jpeg', Buffer.from('original bitmap'));
  zip.file('word/header1.xml', 'operator header');
  zip.file('word/styles.xml', 'original styles');
  return zip.generate({ type: 'nodebuffer' });
};
const cell = (runs: string) =>
  `<w:tc><w:p><w:pPr><w:pStyle w:val="Ttulo"/><w:jc w:val="left"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>${runs}</w:p></w:tc>`;

describe('repair existing MSC documents for Collabora', () => {
  it('does not cross an unmarked heading or table when repairing additional photo rows', () => {
    const photo =
      '<w:p><w:pPr><w:spacing w:line="120" w:lineRule="auto"/></w:pPr><w:r><w:drawing/></w:r></w:p>';
    for (const boundary of [
      '<w:p><w:pPr><w:pStyle w:val="Ttulo2"/></w:pPr><w:r><w:t>Operator section</w:t></w:r></w:p>',
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Operator table</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    ]) {
      const input = makeDocx(
        photo.replace(
          '<w:r>',
          '<w:bookmarkStart w:name="msc_photos_vessel"/><w:r>',
        ) +
          boundary +
          photo,
      );
      const xml = new PizZip(repairMscCollaboraLayout(input).docx)
        .file('word/document.xml')!
        .asText();
      expect(
        [...xml.matchAll(/w:line="(\d+)"/g)].map((match) => match[1]),
      ).toEqual(['240', '120']);
      expect(xml).toContain(boundary);
    }
  });

  it('repairs all rows of a marked gallery without reaching photos in the next section', () => {
    const row = (mark = '') =>
      `<w:p><w:pPr><w:spacing w:line="120" w:lineRule="auto"/></w:pPr>${mark}<w:r><w:drawing/></w:r></w:p>`;
    const input = makeDocx(
      row('<w:bookmarkStart w:name="msc_photos_survey_attendance"/>') +
        '<w:p><w:r><w:t>Operator caption</w:t></w:r></w:p>' +
        row() +
        '<w:p><w:bookmarkStart w:name="s5_4"/><w:r><w:t>ECR</w:t></w:r></w:p>' +
        row(),
    );
    const xml = new PizZip(repairMscCollaboraLayout(input).docx)
      .file('word/document.xml')!
      .asText();
    const photos = [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)]
      .map(([paragraph]) => paragraph)
      .filter((paragraph) => paragraph.includes('<w:drawing'));
    expect(
      photos.map((paragraph) => paragraph.match(/w:line="(\d+)"/)![1]),
    ).toEqual(['240', '240', '120']);
    expect(xml).toContain('Operator caption');
  });

  it('repairs every clipped photo row in the actual MSC template while retaining all drawing frames', async () => {
    const input = await readFile(
      new URL('../../../../templates/msc.clean.docx', import.meta.url),
    );
    const before = new PizZip(input),
      after = new PizZip(repairMscCollaboraLayout(input).docx);
    const original = before.file('word/document.xml')!.asText(),
      actual = after.file('word/document.xml')!.asText();
    const photoRows = (xml: string) =>
      [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)]
        .map(([paragraph]) => paragraph)
        .filter(
          (paragraph) =>
            paragraph.includes('<w:drawing') &&
            paragraph.includes('w:line="120"'),
        );
    expect(photoRows(original).length).toBeGreaterThan(1);
    expect(photoRows(actual)).toHaveLength(0);
    const drawings = (xml: string) =>
      [...xml.matchAll(/<w:drawing\b[\s\S]*?<\/w:drawing>/g)].map(
        ([drawing]) => drawing,
      );
    expect(drawings(actual)).toEqual(drawings(original));
    for (const part of Object.keys(before.files).filter(
      (part) => !before.files[part]!.dir && part !== 'word/document.xml',
    ))
      expect(
        after
          .file(part)!
          .asNodeBuffer()
          .equals(before.file(part)!.asNodeBuffer()),
        part,
      ).toBe(true);
    expect(
      repairMscCollaboraLayout(after.generate({ type: 'nodebuffer' })).changed,
    ).toBe(false);
  });

  it('preserves styles, run fragmentation, substantive text and other package parts', () => {
    const input = makeDocx(
      `<w:tbl><w:tr><w:tc><w:p><w:bookmarkStart w:name="msc_time_log"/></w:p></w:tc>${cell('<w:r><w:t>Capt.\u00a0Name 🛳\u00a0</w:t></w:r><w:r><w:t>\u00a0 </w:t></w:r>')}</w:tr></w:tbl>` +
        '<w:p><w:pPr><w:spacing w:line="120" w:lineRule="auto"/></w:pPr><w:bookmarkStart w:name="msc_photos_survey_attendance"/><w:r><w:drawing/></w:r></w:p>' +
        '<w:p><w:r><w:t>Operator note\u00a0</w:t></w:r></w:p>',
    );
    const result = repairMscCollaboraLayout(input);
    expect(result.changed).toBe(true);
    const before = new PizZip(input),
      after = new PizZip(result.docx);
    for (const part of Object.keys(before.files).filter(
      (part) => !before.files[part]!.dir && part !== 'word/document.xml',
    ))
      expect(after.file(part)!.asNodeBuffer()).toEqual(
        before.file(part)!.asNodeBuffer(),
      );
    const xml = after.file('word/document.xml')!.asText();
    expect(xml).toContain('<w:pStyle w:val="Ttulo"/>');
    expect(xml).toContain('<w:jc w:val="left"/>');
    expect(xml).toContain('Capt.\u00a0Name 🛳 ');
    expect(xml).toMatch(/<w:t[^>]*> {2}<\/w:t>/);
    expect(xml).toContain('Operator note\u00a0');
    expect(xml).toContain('w:line="240"');
    const again = repairMscCollaboraLayout(result.docx);
    expect(again.changed).toBe(false);
    expect(again.docx).toBe(result.docx);
  });

  it('leaves existing documents byte for byte intact when no correction applies', () => {
    const input = makeDocx(
      `<w:tbl><w:tr>${cell('<w:r><w:t>Event\u00a0</w:t></w:r>')}</w:tr></w:tbl>`,
    );
    expect(repairMscCollaboraLayout(input)).toEqual({
      docx: input,
      changed: false,
    });
  });

  it('preserves deliberately inserted line breaks and allows photos without direct paragraph properties', () => {
    const input = makeDocx(
      `<w:tbl><w:tr><w:tc><w:p><w:bookmarkStart w:name="msc_time_log"/></w:p></w:tc>${cell('<w:r><w:t>Event\u00a0</w:t><w:br/></w:r>')}</w:tr></w:tbl>` +
        '<w:p><w:bookmarkStart w:name="msc_photos_vessel"/><w:r><w:drawing/></w:r></w:p>',
    );
    expect(repairMscCollaboraLayout(input).changed).toBe(false);
  });
});
