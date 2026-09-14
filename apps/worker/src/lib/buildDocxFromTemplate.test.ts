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
    expect(documentXml).not.toContain('<w:pageBreakBefore');

    const paragraphs =
      documentXml.match(
        /<w:p\b[^>]*>(?:(?!<\/w:p>).)*<\/w:p>/gs,
      ) ?? [];
    const sheetHeadings = paragraphs.filter((paragraph) =>
      /w:name="s[345]_5"/.test(paragraph),
    );
    expect(sheetHeadings).toHaveLength(3);
    expect(
      sheetHeadings.map((paragraph) => paragraph.includes('<w:keepNext/>')),
    ).toEqual([true, true, true]);
  });
});
