import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { buildReportDocxFromTemplate } from './buildDocxFromTemplate';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lW8UqAAAAABJRU5ErkJggg==',
  'base64',
);

describe('buildReportDocxFromTemplate', () => {
  it('renders image paragraphs as valid sibling paragraphs for Collabora', async () => {
    const docx = await buildReportDocxFromTemplate({
      data: { intermediate_date: '2026-09-14' },
      variant: 'loading',
      logo: null,
      coverPhoto: PNG,
      sheetImages: { initial: PNG, intermediate: PNG, final: PNG },
      phasePhotos: { initial: [PNG], intermediate: [PNG], final: [PNG] },
      acting: {},
    });

    const zip = new PizZip(docx);
    const documentXml = zip.file('word/document.xml')!.asText();

    expect(documentXml.match(/<w:drawing>/g)).toHaveLength(7);
    expect(documentXml).not.toMatch(
      /<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>).)*<w:p(?:\s|>)/s,
    );
    const imageParagraphs =
      documentXml.match(/<w:p\b[^>]*>.*?<w:drawing>.*?<\/w:p>/gs) ?? [];
    expect(imageParagraphs).toHaveLength(7);
    expect(
      imageParagraphs.every((paragraph) =>
        paragraph.includes('<w:jc w:val="center"/>'),
      ),
    ).toBe(true);
    expect(documentXml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1);
    const contentsParagraph =
      documentXml.match(
        /<w:p\b[^>]*>(?:(?!<\/w:p>).)*<w:t>Contents<\/w:t>(?:(?!<\/w:p>).)*<\/w:p>/s,
      )?.[0] ?? '';
    expect(contentsParagraph).toContain('<w:pageBreakBefore/>');
    expect(documentXml).toContain('<wp:extent cx="4572000" cy="3429000"/>');

    const paragraphs =
      documentXml.match(/<w:p\b[^>]*>(?:(?!<\/w:p>).)*<\/w:p>/gs) ?? [];
    const sheetHeadings = paragraphs.filter((paragraph) =>
      /w:name="s[345]_5"/.test(paragraph),
    );
    expect(sheetHeadings).toHaveLength(3);
    expect(
      sheetHeadings.map((paragraph) => paragraph.includes('<w:keepNext/>')),
    ).toEqual([true, true, true]);

    for (const bookmark of ['s3_6', 's4_6', 's5_6']) {
      expect(documentXml).toContain(`w:name="${bookmark}"`);
      expect(documentXml).toContain(`w:anchor="${bookmark}"`);
    }
    expect(documentXml).not.toMatch(/w:(?:name|anchor)="s6_[123]"/);
    expect(documentXml).not.toMatch(/w:(?:name|anchor)="s7"/);
    expect(documentXml).toContain('w:name="s6"');
    expect(documentXml).toContain('w:anchor="s6"');
    expect(documentXml).toContain('3.6. Photographic Report');
    expect(documentXml).toContain('4.6. Photographic Report');
    expect(documentXml).toContain('5.6. Photographic Report');
    expect(documentXml).not.toContain('{photo_no}');

    const paragraphIndex = (marker: string) =>
      paragraphs.findIndex((paragraph) => paragraph.includes(marker));
    const drawings = paragraphs
      .map((paragraph, index) =>
        paragraph.includes('<w:drawing>') ? index : -1,
      )
      .filter((index) => index >= 0);
    const order = [
      paragraphIndex('w:name="s3_5"'),
      drawings[1]!,
      paragraphIndex('w:name="s3_6"'),
      drawings[2]!,
      paragraphIndex('w:name="s4_5"'),
      drawings[3]!,
      paragraphIndex('w:name="s4_6"'),
      drawings[4]!,
      paragraphIndex('w:name="s5_5"'),
      drawings[5]!,
      paragraphIndex('w:name="s5_6"'),
      drawings[6]!,
      paragraphIndex('w:name="s6"'),
    ];
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('omits the intermediate photographic report when the phase is absent', async () => {
    const docx = await buildReportDocxFromTemplate({
      data: {},
      variant: 'loading',
      logo: null,
      coverPhoto: PNG,
      sheetImages: { initial: PNG, intermediate: PNG, final: PNG },
      phasePhotos: { initial: [PNG], intermediate: [PNG], final: [PNG] },
      acting: {},
    });

    const documentXml = new PizZip(docx).file('word/document.xml')!.asText();
    expect(documentXml.match(/<w:drawing>/g)).toHaveLength(5);
    expect(documentXml).toContain('w:name="s3_6"');
    expect(documentXml).not.toMatch(/w:(?:name|anchor)="s4_6"/);
    expect(documentXml).toContain('w:name="s5_6"');
    expect(documentXml).toContain('4.6. Photographic Report');
    expect(documentXml).not.toContain('5.6. Photographic Report');
  });
});
