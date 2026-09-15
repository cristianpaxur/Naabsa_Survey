import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import sharp from 'sharp';
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
    expect(documentXml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(2);
    const contentsParagraph =
      documentXml.match(
        /<w:p\b[^>]*>(?:(?!<\/w:p>).)*<w:t>Contents<\/w:t>(?:(?!<\/w:p>).)*<\/w:p>/s,
      )?.[0] ?? '';
    expect(contentsParagraph).toContain('<w:pageBreakBefore/>');
    const backgroundParagraph =
      documentXml.match(
        /<w:p\b[^>]*>(?:(?!<\/w:p>).)*w:name="s1"(?:(?!<\/w:p>).)*<\/w:p>/s,
      )?.[0] ?? '';
    expect(backgroundParagraph).toContain('<w:pageBreakBefore/>');
    expect(documentXml).toContain('<wp:extent cx="5181600" cy="3886200"/>');

    const paragraphs =
      documentXml.match(/<w:p\b[^>]*>(?:(?!<\/w:p>).)*<\/w:p>/gs) ?? [];
    const sheetHeadings = paragraphs.filter((paragraph) =>
      /w:name="s[345]_5"/.test(paragraph),
    );
    expect(sheetHeadings).toHaveLength(3);
    for (const heading of sheetHeadings) {
      expect(heading).toContain('<w:keepNext/>');
      expect(heading).not.toContain('<w:pageBreakBefore/>');
    }
    for (const phase of [3, 4, 5]) {
      const readingsEnd = documentXml.indexOf(
        '</w:p>',
        documentXml.indexOf(`w:name="s${phase}_1"`),
      );
      expect(documentXml.slice(readingsEnd + 6)).toMatch(/^<w:tbl\b/);

      const detailsEnd = documentXml.indexOf(
        '</w:p>',
        documentXml.indexOf(`w:name="s${phase}_5"`),
      );
      expect(documentXml.slice(detailsEnd + 6)).toMatch(
        /^<w:p\b(?:(?!<\/w:p>).)*<w:drawing>/s,
      );
    }
    const initialReadingsTable =
      documentXml.match(
        /w:name="s3_1"(?:(?!<\/w:p>).)*<\/w:p>(<w:tbl\b.*?<\/w:tbl>)/s,
      )?.[1] ?? '';
    const readingRows =
      initialReadingsTable.match(/<w:tr\b[^>]*>.*?<\/w:tr>/gs) ?? [];
    expect(readingRows).toHaveLength(4);
    for (const row of readingRows) expect(row).toContain('<w:cantSplit/>');
    for (const row of readingRows.slice(0, -1)) {
      expect(row).toContain('<w:keepNext/>');
    }
    expect(
      sheetHeadings.map((paragraph) => paragraph.includes('<w:keepNext/>')),
    ).toEqual([true, true, true]);

    const headingsThatCannotBeOrphans = paragraphs.filter((paragraph) =>
      /w:name="s[345](?:_[16])?"/.test(paragraph),
    );
    expect(headingsThatCannotBeOrphans).toHaveLength(9);
    expect(
      headingsThatCannotBeOrphans.every((paragraph) =>
        paragraph.includes('<w:keepNext/>'),
      ),
    ).toBe(true);

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

  it('uses at most two photo columns and preserves the single-photo layout', async () => {
    const docx = await buildReportDocxFromTemplate({
      data: { intermediate_date: '2026-09-14' },
      variant: 'loading',
      logo: null,
      coverPhoto: PNG,
      sheetImages: { initial: PNG, intermediate: PNG, final: PNG },
      phasePhotos: {
        initial: [PNG, PNG, PNG, PNG, PNG, PNG],
        intermediate: [PNG, PNG],
        final: [PNG],
      },
      acting: {},
    });

    const documentXml = new PizZip(docx).file('word/document.xml')!.asText();
    const phaseXml = (start: string, end: string) => {
      const from = documentXml.indexOf(`w:name="${start}"`);
      const to = documentXml.indexOf(`w:name="${end}"`, from + 1);
      return documentXml.slice(from, to);
    };
    const initial = phaseXml('s3_6', 's4');
    const intermediate = phaseXml('s4_6', 's5');
    const final = phaseXml('s5_6', 's6');

    expect(initial.match(/<w:tbl>/g)).toHaveLength(1);
    expect(initial.match(/<w:tr>/g)).toHaveLength(3);
    expect(initial.match(/<w:tc>/g)).toHaveLength(6);
    expect(initial.match(/<w:drawing>/g)).toHaveLength(6);
    expect(initial).toContain('<w:jc w:val="center"/>');
    expect(intermediate.match(/<w:tbl>/g)).toHaveLength(1);
    expect(intermediate.match(/<w:tr>/g)).toHaveLength(1);
    expect(intermediate.match(/<w:tc>/g)).toHaveLength(2);
    expect(final).not.toContain('<w:tbl>');
    expect(final.match(/<w:drawing>/g)).toHaveLength(1);
    expect(initial).toContain('<w:tblW w:w="9360" w:type="dxa"/>');
    expect(initial).toContain('<w:gridCol w:w="4680"/>');
    expect(intermediate).toContain('<w:tblW w:w="10260" w:type="dxa"/>');
    expect(intermediate).toContain('<w:gridCol w:w="5130"/>');
    expect(documentXml).toContain('<wp:extent cx="2571750" cy="1933575"/>');
    expect(documentXml).toContain('<wp:extent cx="3143250" cy="2362200"/>');
    expect(documentXml).toContain('<wp:extent cx="5181600" cy="3886200"/>');
    expect(documentXml.match(/<w:cantSplit\/>/g)).toHaveLength(16);
    const initialPhotoHeading =
      documentXml.match(
        /<w:p\b[^>]*>(?:(?!<\/w:p>).)*w:name="s3_6"(?:(?!<\/w:p>).)*<\/w:p>/s,
      )?.[0] ?? '';
    expect(initialPhotoHeading).not.toContain('<w:pageBreakBefore/>');
    const intermediateHeading =
      documentXml.match(
        /<w:p\b[^>]*>(?:(?!<\/w:p>).)*w:name="s4"(?:(?!<\/w:p>).)*<\/w:p>/s,
      )?.[0] ?? '';
    expect(intermediateHeading).not.toContain('<w:pageBreakBefore/>');
  });

  it('limits embedded photo pixels and supports a compact physical scale', async () => {
    const largeJpeg = await sharp({
      create: {
        width: 2500,
        height: 1875,
        channels: 3,
        background: { r: 80, g: 120, b: 160 },
      },
    })
      .jpeg({ quality: 82 })
      .toBuffer();
    const docx = await buildReportDocxFromTemplate({
      data: {},
      variant: 'loading',
      logo: null,
      coverPhoto: largeJpeg,
      sheetImages: { initial: PNG, final: PNG },
      phasePhotos: { initial: [largeJpeg], final: [largeJpeg] },
      acting: {},
      photoScale: 0.92,
    });

    const zip = new PizZip(docx);
    const media = Object.keys(zip.files).filter((name) =>
      /^word\/media\/image_generated_\d+\.png$/.test(name),
    );
    const largeMedia = await Promise.all(
      media.map(async (name) => {
        const bytes = zip.file(name)!.asNodeBuffer();
        const meta = await sharp(bytes).metadata();
        return { bytes, width: meta.width ?? 0, height: meta.height ?? 0 };
      }),
    );
    expect(
      largeMedia.some((image) => image.width === 1000 && image.height === 750),
    ).toBe(true);
    expect(
      Math.max(...largeMedia.map((image) => image.width)),
    ).toBeLessThanOrEqual(1368);
    const documentXml = zip.file('word/document.xml')!.asText();
    expect(documentXml).toContain('<wp:extent cx="4762500" cy="3571875"/>');
  });
});
