import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import sharp from 'sharp';
import { buildReportDocxFromTemplate } from './buildDocxFromTemplate';
import { buildReportDocxLegacy } from './buildDocx';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lW8UqAAAAABJRU5ErkJggg==',
  'base64',
);

function documentText(docx: Buffer): string {
  const xml = new PizZip(docx).file('word/document.xml')!.asText();
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)]
    .map((match) => match[1]).join('\n');
}

describe.each([
  ['template', buildReportDocxFromTemplate],
  ['rollback nativo', buildReportDocxLegacy],
] as const)('precisão Draft Survey: %s', (_name, build) => {
  it('aplica precisão ao campo numérico Delivered, antes exibido como texto', async () => {
    const text = documentText(await build({
      data: { delivered: 1981 }, numberFormats: { delivered: 1 },
      variant: 'loading', logo: null, sheetImages: {}, phasePhotos: {}, acting: {},
    }));
    expect(text.split('\n').filter((value) => /^1981(?:\.\d+)?$/.test(value))).toEqual(['1981.0']);
  });
  it.each([[0, '81'], [1, '81.0'], [2, '81.00'], [3, '81.000']] as const)(
    'renderiza Summer DWT com %i casas sem outro literal concorrente',
    async (decimals, expected) => {
      const docx = await build({
        data: { summer_dwt: 81 }, numberFormats: { summer_dwt: decimals },
        variant: 'loading', logo: null, sheetImages: {}, phasePhotos: {}, acting: {},
      });
      const xml = new PizZip(docx).file('word/document.xml')!.asText();
      const row = (xml.match(/<w:tr\b[^>]*>.*?<\/w:tr>/gs) ?? [])
        .find((entry) => entry.includes('Summer DWT'));
      expect(row).toBeDefined();
      const text = [...row!.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)]
        .map((match) => match[1]).join('');
      expect(text.match(/81(?:\.\d+)?/g)).toEqual([expected]);
    },
  );

  it('aplica o mapa em particulares, leituras e figures sem alterar acting-as', async () => {
    const docx = await build({
      data: { loa: 228.9, net_tonnage: 12345, init_fwd_mean: 4.5,
        init_fwd_corr: 4.5, init_heel: 0, init_deflection: 2,
        fin_fig_shore_scale: 1250, fin_fig_naabsa: 1250, fin_fig_vessel: 1250,
        fin_fig_diff_mt: -1.5, fin_fig_diff_pct: 0.12 },
      numberFormats: { loa: 3, net_tonnage: 0, init_fwd_mean: 1,
        init_fwd_corr: 2, init_heel: 0, init_deflection: 2,
        fin_fig_shore_scale: 1, fin_fig_naabsa: 1, fin_fig_vessel: 1,
        fin_fig_diff_mt: 1, fin_fig_diff_pct: 2 },
      variant: 'loading', logo: null, sheetImages: {}, phasePhotos: {},
      acting: { final: [['Role'], ["Terminal's Surveyor", '', '', '', '', '', '', '', '5000']] },
    });
    const text = documentText(docx);
    const xml = new PizZip(docx).file('word/document.xml')!.asText();
    const rows = (xml.match(/<w:tr\b[^>]*>.*?<\/w:tr>/gs) ?? []).map((row) =>
      [...row.matchAll(/<w:tc\b[^>]*>(.*?)<\/w:tc>/gs)].map((cell) =>
        [...cell[1]!.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)].map((match) => match[1]).join('')).join(' '));
    const numbersInRow = (label: string) => rows.find((row) => row.includes(label))
      ?.match(/-?\d+(?:,\d{3})*(?:\.\d+)?/g);
    expect(numbersInRow('LOA')).toEqual(['228.900']);
    expect(numbersInRow('Net tonnage')).toEqual(['12,345']);
    expect(numbersInRow('Fwd')).toEqual(['4.5', '4.50']);
    expect(numbersInRow('Ms')).toEqual(['0']);
    expect(numbersInRow('Aft')).toEqual(['2.00']);
    for (const expected of ['1,250.0 MT', '- 1.5 MT', '+ 0.12 %', '5,000.000 MT']) expect(text).toContain(expected);
    expect(text).not.toContain('1,250.000 MT');
    expect(text).not.toContain('- 1.500 MT');
  });

  it('omite números não finitos e aceita mapas ausentes', async () => {
    const text = documentText(await build({
      data: { delivered: Number.NaN, summer_dwt: Number.NaN, loa: Infinity, init_fwd_mean: null,
        init_heel: -Infinity, fin_fig_diff_mt: Infinity },
      variant: 'loading', logo: null, sheetImages: {}, phasePhotos: {}, acting: {},
    }));
    expect(text).not.toMatch(/NaN|Infinity|null|undefined/);
  });
});

describe('buildReportDocxFromTemplate', () => {
  it('usa só o nome do porto na capa e preserva Delivered textual e os horários das fases', async () => {
    const docx = await buildReportDocxFromTemplate({
      data: {
        port: 'PARANAGUA, BRAZIL', delivered: '2023',
        initial_date: '2026-08-13', initial_start: '07:10', initial_end: '08:50',
        final_date: '2026-08-18', final_start: '06:30', final_end: '08:00',
      },
      variant: 'loading', logo: null, sheetImages: {}, phasePhotos: {}, acting: {},
    });
    const text = documentText(docx);
    expect(text).toContain('PARANAGUA');
    expect(text).not.toContain('PARANAGUA, BRAZIL');
    expect(text).toContain('2023');
    expect(text).toContain('August 13th, 2026, upon berthing');
    expect(text).toContain('from 07:10h up to 08:50h');
    expect(text).toContain('August 18th, 2026, from 06:30 up to 08:00 h');
  });

  it('define bordas visíveis nas três tabelas Draft readings', async () => {
    const docx = await buildReportDocxFromTemplate({
      data: { intermediate_date: '2026-08-15' },
      variant: 'loading', logo: null, sheetImages: {}, phasePhotos: {}, acting: {},
    });
    const xml = new PizZip(docx).file('word/document.xml')!.asText();
    for (const bookmark of ['s3_1', 's4_1', 's5_1']) {
      const table = xml.match(new RegExp(`w:name="${bookmark}"(?:(?!<\\/w:p>).)*<\\/w:p>(<w:tbl\\b.*?<\\/w:tbl>)`, 's'))?.[1] ?? '';
      const borders = table.match(/<w:tblBorders>.*?<\/w:tblBorders>/s)?.[0] ?? '';
      expect(borders, bookmark).toContain('<w:top w:val="single"');
      expect(borders, bookmark).toContain('<w:insideH w:val="single"');
      expect(borders, bookmark).toContain('<w:insideV w:val="single"');
    }
  });

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
    const backgroundParagraph =
      documentXml.match(
        /<w:p\b[^>]*>(?:(?!<\/w:p>).)*w:name="s1"(?:(?!<\/w:p>).)*<\/w:p>/s,
      )?.[0] ?? '';
    expect(backgroundParagraph).not.toContain('<w:pageBreakBefore/>');
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
