import { readFile } from 'node:fs/promises';
import PizZip from 'pizzip';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { buildReportDocxMsc, type DocxInputMsc } from './buildDocxMsc';

const templatePath = new URL(
  '../../../../templates/msc.clean.docx',
  import.meta.url,
);
const base: DocxInputMsc = {
  data: {},
  logo: null,
  photos: {},
  timeLogRows: [],
};
const decode = (text: string) =>
  text.replace(
    /&(?:amp|lt|gt|quot|apos);/g,
    (entity) =>
      ({
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'",
      })[entity]!,
  );
const textOf = (xml: string) =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decode(match[1]!))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
const paragraphs = (xml: string) =>
  [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(([p]) => p);
const properties = (xml: string, tag: string) =>
  xml.match(new RegExp(`<w:${tag}\\b[\\s\\S]*?<\\/w:${tag}>`))?.[0] ?? '';
const headingParagraphs = (xml: string) =>
  Object.fromEntries(
    paragraphs(xml).flatMap((paragraph) => {
      const name = paragraph.match(
        /<w:bookmarkStart\b[^>]*w:name="(s\d+(?:_\d+)?)"/,
      )?.[1];
      return name ? [[name, paragraph]] : [];
    }),
  );
const headings = {
  s1: 'Vessel´s details (Ship´s Particulars)',
  s2: 'Background',
  s3: 'Found at Survey',
  s3_1: 'Purifiers Settings',
  s3_2: 'Temperature',
  s3_3: 'Specific Gravities',
  s3_4: 'Gross volume - m3',
  s3_5: 'Sludge Disposal',
  s3_6: 'Sludge Rate Production',
  s3_7: 'Consumption X Flowmeters',
  s4: 'Time log',
  s5: 'Photographic Report',
  s5_1: 'Vessel',
  s5_2: 'Engine Room',
  s5_3: 'Survey attendance',
  s5_4: 'ECR',
  s6: 'Attachment',
};

async function documentXml(input: Partial<DocxInputMsc> = {}) {
  return new PizZip(await buildReportDocxMsc({ ...base, ...input }))
    .file('word/document.xml')!
    .asText();
}

describe('MSC — fidelity to the revised Word template', () => {
  it('keeps matching exemplar photos visible in Collabora without changing their frames', async () => {
    const template = new PizZip(await readFile(templatePath));
    const relationships = template
      .file('word/_rels/document.xml.rels')!
      .asText();
    const photos = (start: number, count: number) =>
      Array.from({ length: count }, (_, index) => {
        const relation = relationships.match(
          new RegExp(`<Relationship[^>]*Id="rId${start + index}"[^>]*/>`),
        )![0];
        return template
          .file(`word/${relation!.match(/Target="([^"]+)"/)![1]}`)!
          .asNodeBuffer();
      });
    const source = paragraphs(
      template.file('word/document.xml')!.asText(),
    ).filter((p) => p.includes('w:name="msc_photos_'));
    const output = paragraphs(
      await documentXml({
        photos: {
          vessel: photos(16, 8),
          engine_room: photos(24, 6),
          survey_attendance: photos(30, 12),
          ecr: photos(42, 4),
        },
      }),
    ).filter((p) => p.includes('w:name="msc_photos_'));
    expect(output.flatMap((p) => [...p.matchAll(/<w:drawing>/g)])).toHaveLength(
      30,
    );
    expect(
      output.flatMap((p) =>
        [...p.matchAll(/<wp:extent\b[^>]*\/>/g)].map((m) => m[0]),
      ),
    ).toEqual(
      source.flatMap((p) =>
        [...p.matchAll(/<wp:extent\b[^>]*\/>/g)].map((m) => m[0]),
      ),
    );
    for (const paragraph of output)
      expect(properties(paragraph, 'pPr')).not.toContain('w:line="120"');
  });

  it('keeps source Time log styles while replacing only trailing nonbreaking padding', async () => {
    const xml = await documentXml({
      timeLogRows: Array.from({ length: 3 }, (_, index) => ({
        event: `Event ${index + 1}\u00a0\u00a0 `,
        date: '2026-06-15',
        start: '12:30',
        flag: '',
        end: '',
      })),
    });
    const table = [...xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)]
      .map((m) => m[0])
      .find((t) => t.includes('w:name="msc_time_log"'))!;
    const thirdRow = [...table.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)][3]![0];
    const emptyCells = [...thirdRow.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)]
      .map((m) => m[0])
      .filter((cell) => !textOf(cell));
    expect(emptyCells).toHaveLength(2);
    for (const [index, cell] of emptyCells.entries()) {
      expect(cell).toContain('<w:pStyle w:val="Ttulo"/>');
      expect(cell).toContain('<w:sz w:val="20"/>');
      if (index === 1) expect(cell).toContain('<w:jc w:val="right"/>');
    }
    expect(thirdRow).not.toContain('\u00a0');
    expect(thirdRow).toContain('Event 3   ');
  });

  it('carries editable embedded originals so Collabora does not substitute the source fonts', async () => {
    const output = new PizZip(await buildReportDocxMsc(base));
    const fonts = output.file('word/fontTable.xml')!.asText();
    const relationships =
      output.file('word/_rels/fontTable.xml.rels')?.asText() ?? '';
    // Word rasterizes the GeoSlab alternative, Sitka Small. Its invisible
    // searchable PDF text says Calibri, so raster inspection is essential.
    const headerFont = fonts.match(
      /<w:font w:name="GeoSlab703 Md BT">[\s\S]*?<\/w:font>/,
    )?.[0];
    expect(headerFont).toContain('<w:altName w:val="Sitka Small"/>');
    expect(headerFont).toContain('w:embedRegular');
    for (const family of [
      'Calibri',
      'Tahoma',
      'Arial',
      'Times New Roman',
      'Cambria',
      'Symbol',
    ]) {
      const entry =
        fonts.match(
          new RegExp(`<w:font w:name="${family}">[\\s\\S]*?<\\/w:font>`),
        )?.[0] ?? '';
      expect(entry, `${family}: original embedded typeface`).toContain(
        'w:embedRegular',
      );
      const links = [
        ...entry.matchAll(
          /<w:embed(?:Regular|Bold|Italic|BoldItalic)\b[^>]*r:id="([^"]+)"[^>]*w:fontKey="([^"]+)"/g,
        ),
      ];
      expect(
        links.length,
        `${family}: embedded font relationship`,
      ).toBeGreaterThan(0);
      for (const [, id, fontKey] of links) {
        const target = relationships.match(
          new RegExp(`<Relationship\\b[^>]*Id="${id}"[^>]*Target="([^"]+)"`),
        )?.[1];
        expect(target, `${family}: linked payload`).toBeDefined();
        const embedded = output.file(`word/${target}`)?.asNodeBuffer();
        expect(
          embedded?.length,
          `${family}: actual font payload`,
        ).toBeGreaterThan(32);
        const decoded = Buffer.from(embedded!);
        const key = Buffer.from(
          fontKey!.replace(/[{}-]/g, ''),
          'hex',
        ).reverse();
        for (let i = 0; i < 32; i++) decoded[i] = decoded[i]! ^ key[i % 16]!;
        const sfntOffset =
          decoded.toString('ascii', 0, 4) === 'ttcf'
            ? decoded.readUInt32BE(12)
            : 0;
        let os2: number | undefined;
        for (let i = 0; i < decoded.readUInt16BE(sfntOffset + 4); i++) {
          const at = sfntOffset + 12 + 16 * i;
          if (decoded.toString('ascii', at, at + 4) === 'OS/2')
            os2 = decoded.readUInt32BE(at + 8);
        }
        expect(os2, `${family}: original OpenType permissions`).toBeDefined();
        expect(
          decoded.readUInt16BE(os2! + 8),
          `${family}: editable embedding`,
        ).toBe(8);
      }
    }
  });

  it('keeps the original body hierarchy with automatic numbering and one destination per heading', async () => {
    const xml = await documentXml();
    const actual = headingParagraphs(xml);
    expect(Object.keys(actual)).toEqual(Object.keys(headings));
    for (const [bookmark, label] of Object.entries(headings)) {
      expect(textOf(actual[bookmark]!), bookmark).toBe(label);
      expect(
        actual[bookmark],
        `${bookmark}: numbering supplied by Word`,
      ).toContain('<w:numPr>');
      expect(
        xml.match(new RegExp(`w:name="${bookmark}"`, 'g')),
        `${bookmark}: unique body destination`,
      ).toHaveLength(1);
    }
    expect(xml).not.toContain('w:name="s3_8"');
    expect(xml).not.toContain('w:name="s5_5"');
  });

  it('includes the conditional attendance and Hull entries only when their data exists', async () => {
    const photo = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#456789' },
    })
      .png()
      .toBuffer();
    const xml = await documentXml({
      data: { last_attendance: 'Yes' },
      photos: { hull: [photo] },
    });
    const actual = headingParagraphs(xml);
    expect(actual['s3_8']).toBeDefined();
    expect(actual['s5_5']).toBeDefined();
    expect(textOf(actual['s3_8']!)).toMatch(/^Last attend(?:ances|ences)$/);
    expect(textOf(actual['s5_5']!)).toBe('Hull');
    expect(xml.match(/w:name="s3_8"/g)).toHaveLength(1);
    expect(xml.match(/w:name="s5_5"/g)).toHaveLength(1);
    expect(xml).toContain('w:anchor="s3_8"');
    expect(xml).toContain('w:anchor="s5_5"');
    const empty = await documentXml({
      data: { last_attendance: 'No' },
      photos: { hull: [] },
    });
    expect(empty).not.toMatch(/w:(?:name|anchor)="(?:s3_8|s5_5)"/);
    expect(textOf(headingParagraphs(empty)['s5_3']!)).toBe('Survey attendance');
  });

  it('preserves institutional parts and section geometry byte for byte', async () => {
    const template = new PizZip(await readFile(templatePath));
    const output = new PizZip(await buildReportDocxMsc(base));
    const preservedParts = Object.keys(template.files).filter((path) =>
      /^word\/(?:styles|numbering|header\d+|footer\d+)\.xml$/.test(path),
    );
    expect(preservedParts).toEqual(
      expect.arrayContaining([
        'word/styles.xml',
        'word/numbering.xml',
        'word/header1.xml',
        'word/footer1.xml',
      ]),
    );
    for (const part of preservedParts)
      expect(output.file(part)?.asText(), part).toBe(
        template.file(part)!.asText(),
      );
    const institutionalRelationships = Object.keys(template.files).filter(
      (path) => /^word\/_rels\/(?:header\d+|footer\d+)\.xml\.rels$/.test(path),
    );
    for (const part of institutionalRelationships)
      expect(
        output.file(part)?.asText(),
        `${part}: institutional image links`,
      ).toBe(template.file(part)!.asText());
    const sectionProperties = (xml: string) =>
      [...xml.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)].map(
        ([section]) => section,
      );
    const sourceSections = sectionProperties(
      template.file('word/document.xml')!.asText(),
    );
    expect(sourceSections.length).toBeGreaterThan(0);
    expect(
      sectionProperties(output.file('word/document.xml')!.asText()),
    ).toEqual(sourceSections);
  });

  it('preserves each source TOC paragraph layout while updating the destination page', async () => {
    const templateXml = new PizZip(await readFile(templatePath))
      .file('word/document.xml')!
      .asText();
    const tocPages = Object.fromEntries(
      Object.keys(headings).map((name, index) => [name, index + 3]),
    );
    const xml = await documentXml({ tocPages });
    const tocEntries = paragraphs(templateXml).flatMap((paragraph) => {
      const bookmark = textOf(paragraph).match(/\{toc_(s\d+(?:_\d+)?)\}/)?.[1];
      return bookmark && bookmark in headings
        ? [[bookmark, paragraph] as const]
        : [];
    });
    expect(tocEntries).toHaveLength(Object.keys(headings).length);
    for (const [bookmark, source] of tocEntries) {
      const target = paragraphs(xml).find((paragraph) =>
        paragraph.includes(`w:anchor="${bookmark}"`),
      );
      expect(target, `${bookmark}: linked Contents entry`).toBeDefined();
      expect(
        properties(target!, 'pPr'),
        `${bookmark}: exact TOC paragraph properties`,
      ).toBe(properties(source, 'pPr'));
      expect(textOf(target!), `${bookmark}: measured page cache`).toMatch(
        new RegExp(`${tocPages[bookmark]}\\s*$`),
      );
      if (target!.includes('PAGEREF'))
        expect(target).toMatch(new RegExp(`PAGEREF\\s+${bookmark}(?:\\s|<)`));
    }
    const tocText = tocEntries
      .map(([bookmark]) =>
        textOf(
          paragraphs(xml).find((paragraph) =>
            paragraph.includes(`w:anchor="${bookmark}"`),
          )!,
        ),
      )
      .join('\n');
    expect(tocText).toContain('Specific gravity');
    expect(tocText).toContain('Gross volume');
    expect(tocText).not.toContain('Specific Gravities');
    expect(tocText).not.toContain('Gross volume - m3');
  });

  it('preserves every source body heading paragraph property for a complete gallery, including the original pagination rules', async () => {
    const templateXml = new PizZip(await readFile(templatePath))
      .file('word/document.xml')!
      .asText();
    const sourceHeadings = headingParagraphs(templateXml);
    const image = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#456789' },
    })
      .png()
      .toBuffer();
    const outputHeadings = headingParagraphs(
      await documentXml({
        data: { last_attendance: 'Yes' },
        photos: {
          vessel: Array(8).fill(image),
          engine_room: Array(6).fill(image),
          survey_attendance: Array(12).fill(image),
          ecr: Array(4).fill(image),
        },
      }),
    );
    expect(Object.keys(sourceHeadings)).toEqual(
      expect.arrayContaining(['s4', 's5', 's5_1', 's5_3']),
    );
    expect(Object.keys(outputHeadings)).toEqual(Object.keys(sourceHeadings));
    for (const [name, source] of Object.entries(sourceHeadings)) {
      expect(
        properties(outputHeadings[name]!, 'pPr'),
        `${name}: original heading layout and pagination`,
      ).toBe(properties(source, 'pPr'));
    }
  });

  it('keeps the source Time log columns, merged header and intact rows', async () => {
    const templateXml = new PizZip(await readFile(templatePath))
      .file('word/document.xml')!
      .asText();
    const table = (xml: string) =>
      [...xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)]
        .map(([value]) => value)
        .find((value) => value.includes('w:name="msc_time_log"'))!;
    const source = table(templateXml);
    expect(
      source,
      'Time log prototype marked in repository template',
    ).toBeDefined();
    const timeLogRows = Array.from({ length: 45 }, (_, index) => ({
      event: `MSC-${index + 1}`,
      date: '2026-09-30',
      start: '12:34',
      flag: 'X',
      end: '13:45',
    }));
    const outputXml = await documentXml({ timeLogRows });
    const actual = table(outputXml);
    expect(actual).toBeDefined();
    expect(
      properties(actual, 'tblPr').replace(
        /<w:tblBorders>[\s\S]*?<\/w:tblBorders>/,
        '',
      ),
    ).toBe(properties(source, 'tblPr'));
    expect(properties(actual, 'tblGrid')).toBe(properties(source, 'tblGrid'));
    const rows = [...actual.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(
      ([row]) => row,
    );
    expect(rows).toHaveLength(46);
    const cells = [...rows[0]!.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map(
      ([cell]) => cell,
    );
    expect(cells.map(textOf)).toEqual(['', 'Date', 'Time']);
    expect(cells[2]).toContain('<w:gridSpan w:val="3"/>');
    expect(rows[0]).toContain('<w:tblHeader/>');
    expect(rows.every((row) => row.includes('<w:cantSplit/>'))).toBe(true);
    expect(rows.slice(1).map(textOf)).toEqual(
      timeLogRows.map((row) => `${row.event}30/09/202612:34X13:45`),
    );
  });
});
