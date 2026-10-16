import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import PizZip from 'pizzip';
import sharp from 'sharp';
import {
  buildReportDocxMsc,
  type DocxInputMsc,
  type TimeLogRow,
  replaceMscPhotoSections,
  updateMscTocPages,
} from './buildDocxMsc';

const base: DocxInputMsc = {
  data: {},
  logo: null,
  photos: {},
  timeLogRows: [],
};
const zipOf = async (input: Partial<DocxInputMsc> = {}) =>
  new PizZip(await buildReportDocxMsc({ ...base, ...input }));
const xmlOf = async (input: Partial<DocxInputMsc> = {}) =>
  (await zipOf(input)).file('word/document.xml')!.asText();
const textOf = (xml: string) =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
    .map((match) => match[1])
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
const paragraphs = (xml: string) =>
  [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(
    (match) => match[0],
  );
const paragraphWith = (xml: string, text: string) =>
  paragraphs(xml).find((paragraph) => textOf(paragraph) === text) ?? '';
const logRows = (count: number): TimeLogRow[] =>
  Array.from({ length: count }, (_, i) => ({
    event: `Event ${i + 1}`,
    date: '2026-09-30',
    start: '12:34',
    flag: 'X',
    end: '13:45',
  }));
const logTable = (xml: string) =>
  [...xml.matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g)].find((match) =>
    match[0].includes('w:name="msc_time_log"'),
  )?.[0] ?? '';
const photo = (width: number, height: number, background = '#456789') =>
  sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer();

describe('buildReportDocxMsc — template values and dynamic content', () => {
  it('keeps the edited cover style and fitted height when refreshing a larger photo', async () => {
    const previousPhoto = await photo(800, 600, '#ff0000');
    const replacement = await photo(600, 800, '#00ff00');
    const before = await zipOf({
      coverPhoto: previousPhoto,
      coverMaxHeightMm: 88,
    });
    const originalXml = before.file('word/document.xml')!.asText();
    const originalCover = paragraphs(originalXml).find((p) =>
      p.includes('w:name="msc_cover"'),
    )!;
    const editedCover = originalCover.replace('SemEspaamento', 'NoSpacing');
    before.file(
      'word/document.xml',
      originalXml.replace(originalCover, editedCover),
    );
    const fresh = await buildReportDocxMsc({
      ...base,
      coverPhoto: replacement,
    });
    const result = new PizZip(
      replaceMscPhotoSections(before.generate({ type: 'nodebuffer' }), fresh),
    );
    const actualCover = paragraphs(
      result.file('word/document.xml')!.asText(),
    ).find((p) => p.includes('w:name="msc_cover"'))!;
    expect(actualCover.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0]).toBe(
      editedCover.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0],
    );
    const dimensions = (xml: string) =>
      [
        ...xml.matchAll(
          /<(?:wp:extent|a:ext)\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/g,
        ),
      ].map(([, width, height]) => ({ width: +width!, height: +height! }));
    const frames = dimensions(actualCover);
    expect(frames.length).toBeGreaterThanOrEqual(2);
    for (const frame of frames) {
      expect(frame.height).toBeLessThanOrEqual(88 * 36000);
      expect(frame.width / frame.height).toBeCloseTo(600 / 800, 5);
    }
    const blipId = actualCover.match(/r:embed="([^"]+)"/)![1];
    const target = result
      .file('word/_rels/document.xml.rels')!
      .asText()
      .match(new RegExp(`Id="${blipId}"[^>]*Target="([^"]+)"`))![1];
    expect(result.file(`word/${target}`)!.asNodeBuffer()).toEqual(replacement);
  });

  it('refreshes photo sections and Contents while preserving manual text and package parts', async () => {
    const oldPhoto = await photo(800, 600, '#ff0000');
    const newPhoto = await photo(800, 600, '#00ff00');
    const before = await zipOf({
      data: { vessel_name: 'ORIGINAL BODY' },
      photos: { vessel: [oldPhoto] },
      tocPages: { s1: 3, s5: 5, s5_1: 5, s6: 6 },
    });
    let xml = before
      .file('word/document.xml')!
      .asText()
      .replace(
        'Complying with Messrs.',
        'MANUAL BODY TEXT. Complying with Messrs.',
      )
      .replace(/w:numId w:val="15"/g, 'w:numId w:val="42"')
      .replace(/w:pStyle w:val="Ttulo"/g, 'w:pStyle w:val="EditorTitle"');
    before.file(
      'word/numbering.xml',
      before
        .file('word/numbering.xml')!
        .asText()
        .replace(/w:numId="15"/g, 'w:numId="42"'),
    );
    const attachments = paragraphs(xml).find((p) => p.includes('w:name="s6"'))!;
    xml = xml.replace(
      attachments,
      '<w:p><w:bookmarkStart w:id="99998" w:name="s5_5"/><w:r><w:t>Hull</w:t></w:r><w:bookmarkEnd w:id="99998"/></w:p>' +
        '<w:p><w:r><w:t>MANUAL PHOTO CAPTION</w:t></w:r></w:p>' +
        attachments,
    );
    before.file('word/document.xml', xml);
    const original = before.generate({ type: 'nodebuffer' });
    const fresh = await buildReportDocxMsc({
      ...base,
      data: { vessel_name: 'UNUSED FRESH BODY' },
      coverPhoto: newPhoto,
      photos: { vessel: Array(12).fill(newPhoto), hull: [newPhoto] },
      tocPages: { s5: 7, s5_1: 7, s5_5: 9, s6: 10 },
    });
    const result = new PizZip(replaceMscPhotoSections(original, fresh));
    const actual = result.file('word/document.xml')!.asText();
    expect(textOf(actual)).toContain('MANUAL BODY TEXT');
    expect(textOf(actual)).toContain('MANUAL PHOTO CAPTION');
    expect(textOf(actual)).toContain('ORIGINAL BODY');
    expect(textOf(actual)).not.toContain('UNUSED FRESH BODY');
    expect(
      actual
        .slice(actual.indexOf('w:name="s5_1"'), actual.indexOf('w:name="s5_2"'))
        .match(/<w:drawing>/g),
    ).toHaveLength(13);
    expect(actual).not.toMatch(/w:(?:name|anchor)="s5_5"/);
    for (const id of ['s5', 's5_1', 's5_2', 's5_3', 's5_4']) {
      const oldId = id;
      const properties = (text: string, mark: string) =>
        paragraphs(text)
          .find((p) => p.includes(`w:name="${mark}"`))
          ?.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0];
      expect(properties(actual, id), id).toBe(properties(xml, oldId));
    }
    const ids = [
      ...actual.matchAll(/<w:bookmarkStart[^>]*w:id="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const name of Object.keys(before.files).filter(
      (name) =>
        !before.files[name]!.dir &&
        /^word\/(?:styles\.xml|numbering\.xml|fontTable\.xml|header\d+\.xml|footer\d+\.xml|media\/)/.test(
          name,
        ),
    ))
      expect(
        result
          .file(name)!
          .asNodeBuffer()
          .equals(before.file(name)!.asNodeBuffer()),
        name,
      ).toBe(true);
    const numbered = new PizZip(
      updateMscTocPages(result.generate({ type: 'nodebuffer' }), {
        s1: 3,
        s5: 7,
        s5_1: 8,
        s5_5: 9,
        s6: 10,
      }),
    )
      .file('word/document.xml')!
      .asText();
    expect(
      paragraphs(numbered).find((p) => p.includes('w:anchor="s5_1"')),
    ).toMatch(/8\s*<\/w:t>/);
  });
  it('fills the default manager contact and preserves an explicit contact', async () => {
    expect(textOf(await xmlOf())).toContain('Capt. Robert Masse');
    expect(
      textOf(await xmlOf({ data: { contact_manager_name: 'Capt. Client' } })),
    ).toContain('Capt. Client');
  });

  it('keeps a dedicated cover and appends legacy Hull photos to Vessel without losing their order', async () => {
    const coverPhoto = await photo(800, 600, '#ff0000');
    const vessel = await photo(800, 600, '#00ff00');
    const hull = await photo(800, 600, '#0000ff');
    const zip = await zipOf({
      coverPhoto,
      photos: { vessel: [vessel], hull: [hull] },
    });
    const xml = zip.file('word/document.xml')!.asText();
    const relationships = zip.file('word/_rels/document.xml.rels')!.asText();
    const bitmaps = (paragraph: string) =>
      [...paragraph.matchAll(/r:embed="([^"]+)"/g)].map(([, id]) => {
        const relation = relationships.match(
          new RegExp(`<Relationship[^>]*Id="${id}"[^>]*/>`),
        )![0];
        const target = relation.match(/Target="([^"]+)"/)![1];
        return zip.file(`word/${target}`)!.asNodeBuffer();
      });
    const cover = paragraphs(xml).find((p) =>
      p.includes('w:name="msc_cover"'),
    )!;
    const vesselGallery = paragraphs(xml).find((p) =>
      p.includes('w:name="msc_photos_vessel"'),
    )!;
    expect(bitmaps(cover)).toEqual([coverPhoto]);
    expect(bitmaps(vesselGallery)).toEqual([vessel, hull]);
    expect(xml).not.toMatch(/w:name="(?:msc_photos_hull|s5_5)"/);
    const noCover = await xmlOf({
      coverPhoto: null,
      photos: { vessel: [vessel] },
    });
    expect(
      paragraphs(noCover).find((p) => p.includes('w:name="msc_cover"')),
    ).not.toContain('<w:drawing');
    expect(noCover.match(/<w:drawing>/g)).toHaveLength(1);
  });

  it('renders the Time log without table or cell grid borders', async () => {
    const table = logTable(await xmlOf({ timeLogRows: logRows(12) }));
    const borders = [
      ...table.matchAll(
        /<w:(?:tblBorders|tcBorders)>[\s\S]*?<\/w:(?:tblBorders|tcBorders)>/g,
      ),
    ];
    expect(borders.length).toBeGreaterThan(12);
    for (const [border] of borders)
      expect(border).not.toMatch(/w:val="(?!nil)/);
    expect(textOf(table)).toContain('Event 12');
  });

  it('removes unused gallery paragraphs and keeps a partial gallery title with its first photo', async () => {
    const xml = await xmlOf({ photos: { vessel: [await photo(800, 600)] } });
    const group = paragraphs(xml).filter(
      (p) =>
        xml.indexOf(p) >= xml.indexOf(paragraphWith(xml, 'Vessel')) &&
        xml.indexOf(p) < xml.indexOf(paragraphWith(xml, 'Engine Room')),
    );
    expect(
      group.filter((p) => !textOf(p) && !p.includes('<w:drawing>')),
    ).toHaveLength(0);
    expect(paragraphWith(xml, 'Vessel')).toContain('<w:keepNext/>');
    expect(paragraphWith(xml, 'Photographic Report')).toContain(
      '<w:keepNext/>',
    );
    const empty = xml.slice(
      xml.indexOf('w:name="s5_4"'),
      xml.indexOf('w:name="s6"'),
    );
    expect(empty).not.toContain('<w:drawing>');
    expect(paragraphs(empty).filter((p) => !textOf(p))).toHaveLength(0);
  });

  it('scales a matching cover frame down when a measured cover height is supplied', async () => {
    const cover = await photo(800, 600);
    const original = await xmlOf({ coverPhoto: cover });
    const xml = await xmlOf({ coverPhoto: cover, coverMaxHeightMm: 72 });
    const p = paragraphs(xml).find((p) => p.includes('w:name="msc_cover"'))!;
    const [, cx, cy] = p.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)!;
    expect(Number(cy) / 36000).toBeLessThanOrEqual(72);
    const originalParagraph = paragraphs(original).find((p) =>
      p.includes('w:name="msc_cover"'),
    )!;
    const [, originalCx, originalCy] = originalParagraph.match(
      /<wp:extent cx="(\d+)" cy="(\d+)"\/>/,
    )!;
    expect(Number(cx) / Number(cy)).toBeCloseTo(
      Number(originalCx) / Number(originalCy),
      5,
    );
    expect(p.match(/<a:srcRect[^>]*\/>/)?.[0]).toBe(
      originalParagraph.match(/<a:srcRect[^>]*\/>/)?.[0],
    );
    expect(xml).toContain('w:name="msc_cover_contacts_end"');
  });
  it('keeps the complete attachment list together for a partial gallery', async () => {
    const xml = await xmlOf({ photos: { vessel: [await photo(800, 600)] } });
    const body = paragraphs(xml);
    const start = body.findIndex((p) => p.includes('w:name="s6"'));
    const attachments = body.slice(start).filter((p) => textOf(p));
    expect(attachments).toHaveLength(7);
    expect(
      attachments.slice(0, -1).every((p) => p.includes('<w:keepNext/>')),
    ).toBe(true);
    expect(attachments.at(-1)).not.toContain('<w:keepNext/>');
  });
  it('does not inherit cropped panorama frames for operator photos in a partial Survey attendance gallery', async () => {
    const xml = await xmlOf({
      photos: { survey_attendance: [await photo(800, 600)] },
    });
    const group = xml.slice(
      xml.indexOf('w:name="s5_3"'),
      xml.indexOf('w:name="s5_4"'),
    );
    const [, cx, cy] = group.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)!;
    expect(Number(cx) / 36000).toBeCloseTo(80, 3);
    expect(Number(cy) / 36000).toBeCloseTo(60, 3);
    expect(group).not.toContain('<a:srcRect');
    expect(group).toContain('w:line="240"');
  });
  it('preserves the default institutional logo bytes instead of recompressing them', async () => {
    const source = new PizZip(
      await readFile(
        new URL('../../../../templates/msc.clean.docx', import.meta.url),
      ),
    );
    const logo = source.file('word/media/image2.jpg')!.asNodeBuffer();
    const result = await zipOf({ logo });
    expect(
      result.file('word/media/image2.jpg')!.asNodeBuffer().equals(logo),
    ).toBe(true);
  });
  it('preserves supplementary Unicode characters across the source run fragments', async () => {
    const name = '𠮷 TEST 🚢';
    const text = textOf(await xmlOf({ data: { vessel_name: name } }));
    expect(text).toContain(`we did attend ${name} at`);
    expect(text).not.toContain('�');
  });
  it('preserves literal braces in operator text instead of interpreting them as template fields', async () => {
    const xml = await xmlOf({
      data: { vessel_name: 'MSC TEST' },
      timeLogRows: [{ ...logRows(1)[0]!, event: 'EVENT <&> {vessel_name}' }],
    });
    expect(textOf(logTable(xml))).toContain('{vessel_name}');
    expect(logTable(xml)).toContain('&lt;&amp;&gt;');
    expect(textOf(logTable(xml))).not.toContain('MSC TEST');
  });
  it.each([
    'EVENT {survey_date_month} {survey_date_year}, note',
    'Follow-up the sludge disposal',
    'and to verify the total amount of sludge disposed',
  ])(
    'preserves operator event %s during date and ROB transformations',
    async (event) => {
      const xml = await xmlOf({
        data: { appointed_service: 'ROB Survey' },
        timeLogRows: [{ ...logRows(1)[0]!, event }],
      });
      expect(textOf(logTable(xml))).toContain(event);
    },
  );
  it('keeps Contents left aligned and the unique Vessel 5.1 destination', async () => {
    const xml = await xmlOf({ photos: { vessel: [await photo(800, 600)] } });
    expect(paragraphWith(xml, 'Contents')).not.toContain(
      '<w:jc w:val="center"/>',
    );
    expect(xml.match(/w:name="s5_1"/g)).toHaveLength(1);
    expect(xml.includes('w:anchor="s5_1"')).toBe(true);
    const heading = paragraphs(xml).find((paragraph) =>
      paragraph.includes('w:name="s5_1"'),
    )!;
    expect(heading).not.toContain('<w:jc w:val="center"/>');
  });

  it('fills contacts without losing full names or overriding the source geometry', async () => {
    const xml = await xmlOf({
      data: {
        vessel_name: 'MSC CONTACT',
        surveyors: 'ARMANDO JUNIOR',
        flag: 'PANAMA',
        port: 'PARANAGUA',
        captain: 'DUDKO VIACHESLAV',
        chief_engineer: 'ZARZECKI DARIUSZ ROBERT',
      },
    });
    const text = textOf(xml);
    for (const name of [
      'MSC CONTACT',
      'Mr. Wagner de Abreu',
      'Panama',
      'Paranagua Port',
      'Dudko Viacheslav',
      'Zarzecki Dariusz Robert',
    ])
      expect(text).toContain(name);
    expect(text).not.toContain('ARMANDO JUNIOR');
    expect(xml.includes('<w:gridCol w:w="2694"/><w:gridCol w:w="6281"/>')).toBe(
      true,
    );
  });

  it('fills the purifier paragraphs and preserves their source units', async () => {
    const text = textOf(
      await xmlOf({
        data: {
          purifier_temp: 98,
          purifier_flow: '1 x 2,0',
          purifier_bowl_freq: 60,
        },
      }),
    );
    for (const entry of ['98 °C', '1 x 2,0 m³', '60 minutes'])
      expect(text).toContain(entry);
    expect(text).not.toMatch(/sludge K\d+|summary B\d+|manter sempre/i);
  });

  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [30, '30th'],
    [31, '31st'],
  ])(
    'uses a long narrative date on day %i while the Time log stays numeric',
    async (day, expected) => {
      const date = `2026-01-${String(day).padStart(2, '0')}`;
      const text = textOf(
        await xmlOf({
          data: { berthing_date: date },
          timeLogRows: [{ ...logRows(1)[0]!, date }],
        }),
      );
      expect(text).toContain(
        `We did attend vessel on January ${expected}, 2026`,
      );
      expect(text).toContain(`${String(day).padStart(2, '0')}/01/2026`);
      expect(text).toContain('12:34');
    },
  );
  it.each(['', '2026-02-30', '2026-13-01', '2026-00-01', 'not a date', null])(
    'does not invent a date for %s',
    async (date) => {
      const text = textOf(await xmlOf({ data: { berthing_date: date } }));
      expect(text).toContain('We did attend vessel on —,');
      expect(text).not.toMatch(/undefined|Invalid Date|—\s*,\s*,/);
    },
  );

  it.each([12, 45])(
    'retains %i complete events and a repeatable merged header',
    async (count) => {
      const table = logTable(await xmlOf({ timeLogRows: logRows(count) }));
      const rows = [
        ...table.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g),
      ].map((match) => match[0]);
      expect(rows).toHaveLength(count + 1);
      expect(rows.every((row) => row.includes('<w:cantSplit/>'))).toBe(true);
      expect(rows[0]).toContain('<w:tblHeader/>');
      expect(table).toContain(`Event ${count}`);
      if (count === 12) {
        expect(
          rows.slice(0, -1).every((row) => row.includes('<w:keepNext/>')),
        ).toBe(true);
        expect(rows.at(-1)).not.toContain('<w:keepNext/>');
      } else
        expect(
          rows.slice(1).every((row) => !row.includes('<w:keepNext/>')),
        ).toBe(true);
    },
  );
  it('keeps the compact twelve-event chain for descriptions spanning several lines', async () => {
    const table = logTable(
      await xmlOf({
        timeLogRows: logRows(12).map((row) => ({
          ...row,
          event: `${row.event} ${'a'.repeat(97)}`,
        })),
      }),
    );
    const rows = [...table.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map(
      (match) => match[0],
    );
    expect(
      rows.slice(0, -1).every((row) => row.includes('<w:keepNext/>')),
    ).toBe(true);
    expect(rows.at(-1)).not.toContain('<w:keepNext/>');
  });

  it('fits portrait and landscape images in the native source drawings', async () => {
    const photos = await Promise.all([
      photo(800, 600),
      photo(600, 800),
      photo(1600, 900),
    ]);
    const xml = await xmlOf({
      photos: { vessel: photos },
      coverPhoto: photos[2],
    });
    const gallery = xml.slice(
      xml.indexOf('w:name="s5_1"'),
      xml.indexOf('w:name="s5_2"'),
    );
    expect(gallery.includes('<w:tbl>')).toBe(false);
    const extents = [
      ...gallery.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g),
    ].map((m) => [+m[1]!, +m[2]!]);
    expect(extents).toHaveLength(3);
    for (const [width, height] of extents) {
      expect(width).toBeLessThanOrEqual(80 * 36000);
      expect(height).toBeLessThanOrEqual(60 * 36000);
    }
    expect(extents[0]![0]! / extents[0]![1]!).toBeCloseTo(4 / 3, 2);
    expect(extents[1]![0]! / extents[1]![1]!).toBeCloseTo(3 / 4, 2);
    const cover = xml.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)!;
    expect(+cover[1]!).toBeGreaterThan(80 * 36000);
    expect(+cover[1]!).toBeLessThanOrEqual(160 * 36000);
  });
  it.each([
    [600, 800],
    [600, 600],
    [700, 600],
  ])('keeps narrower %i×%i photos in pairs', async (width, height) => {
    const image = await photo(width!, height!);
    const xml = await xmlOf({
      photos: { vessel: Array.from({ length: 6 }, () => image) },
    });
    const gallery = xml.slice(
      xml.indexOf('w:name="s5_1"'),
      xml.indexOf('w:name="s5_2"'),
    );
    expect(gallery.match(/<w:br\/>/g)).toHaveLength(2);
  });
  it('replaces all exemplar photos and preserves input order beyond the source capacity', async () => {
    const photos = await Promise.all(
      Array.from({ length: 11 }, (_, i) => photo(800 + i, 600, '#654321')),
    );
    const zip = await zipOf({ photos: { vessel: photos } });
    const xml = zip.file('word/document.xml')!.asText();
    const gallery = xml.slice(
      xml.indexOf('w:name="s5_1"'),
      xml.indexOf('w:name="s5_2"'),
    );
    const ids = [...gallery.matchAll(/r:embed="rIdMscImage(\d+)"/g)].map(
      (m) => +m[1]!,
    );
    expect(ids).toEqual(Array.from({ length: 11 }, (_, i) => i + 2)); // first Vessel also supplies cover
    expect(
      Object.keys(zip.files).filter((name) =>
        /^word\/media\/image\d+\.jpe?g$/.test(name),
      ),
    ).toEqual(['word/media/image2.jpg']); // institutional logo
  });
  it('keeps the client mixed gallery counts in their own sections', async () => {
    const image = await photo(800, 600);
    const xml = await xmlOf({
      photos: {
        vessel: Array(12).fill(image),
        engine_room: Array(4).fill(image),
        survey_attendance: Array(10).fill(image),
        ecr: Array(4).fill(image),
      },
    });
    for (const [section, next, count] of [
      ['s5_1', 's5_2', 12],
      ['s5_2', 's5_3', 4],
      ['s5_3', 's5_4', 10],
      ['s5_4', 's6', 4],
    ] as const) {
      const body = xml.slice(
        xml.indexOf(`w:name="${section}"`),
        xml.indexOf(`w:name="${next}"`),
      );
      expect(body.match(/<w:drawing>/g), section).toHaveLength(count);
    }
  });
  it('applies the requested precision to Delivered', async () => {
    const text = textOf(
      await xmlOf({
        data: { delivered: 1981 },
        numberFormats: { delivered: 1 },
      }),
    );
    expect(text).toContain('1981.0');
  });
  it.each([
    [0, '81 m'],
    [1, '81.0 m'],
    [2, '81.00 m'],
    [3, '81.000 m'],
  ] as const)('uses %i decimals in LOA', async (decimals, expected) => {
    expect(
      textOf(
        await xmlOf({ data: { loa: 81 }, numberFormats: { loa: decimals } }),
      ),
    ).toContain(expected);
  });
  it('retains precision for grades, sludge, flowmeter and temperatures', async () => {
    const text = textOf(
      await xmlOf({
        data: {
          grade_1_present: 'Yes',
          grade_1_surveyor: 1250,
          grade_1_percentage: 2,
          sludge_berthing: 12,
          sludge_rate_chief: 3,
          flowmeter_accuracy: 4,
          temp_engine_room: 30,
          purifier_temp: 40,
        },
        numberFormats: {
          grade_1_surveyor: 1,
          grade_1_percentage: 0,
          sludge_berthing: 2,
          sludge_rate_chief: 3,
          flowmeter_accuracy: 1,
          temp_engine_room: 1,
          purifier_temp: 2,
        },
      }),
    );
    for (const expected of [
      '1,250.0',
      '12.00',
      '3.000',
      '4.0',
      '30.0 °C',
      '40.00 °C',
    ])
      expect(text).toContain(expected);
    expect(text).not.toContain('1,250.000');
  });
  it('preserves explicit flowmeter soundings and falls back to surveyor consumption when absent', async () => {
    for (const [soundings, expected] of [
      [981.008, '981.008'],
      [undefined, '947.665'],
    ] as const) {
      const xml = await xmlOf({
        data: {
          consumption_surveyor: 947.665,
          ...(soundings === undefined
            ? {}
            : { flowmeter_soundings: soundings }),
        },
      });
      const paragraph = paragraphs(xml).find((p) =>
        textOf(p).includes('Soundings'),
      )!;
      expect(textOf(paragraph)).toContain(expected);
    }
  });
  it.each([
    [
      { flowmeter_total: 1689.099, consumption_surveyor: 981.008 },
      ['708.091', '41.92'],
    ],
    [
      { flowmeter_total: 1682.357, consumption_surveyor: 1736.1340778983003 },
      ['-53.777', '-3.20'],
    ],
    [
      {
        flowmeter_total: 1689.099,
        consumption_surveyor: 100,
        flowmeter_soundings: 981.008,
      },
      ['708.091', '41.92'],
    ],
    [{ flowmeter_total: 10, consumption_surveyor: 10 }, ['0.000', '0.00']],
    [{ flowmeter_total: 10, consumption_surveyor: 0 }, ['10.000', '100.00']],
  ] as const)(
    'derives the surveyor flowmeter comparison before rounding: %j',
    async (data, expected) => {
      const comparison = paragraphs(await xmlOf({ data }))
        .map(textOf)
        .find((p) => p.includes('mt or'))!;
      for (const value of expected) expect(comparison).toContain(value);
    },
  );

  it.each([
    [{ flowmeter_total: 10 }, '—', '—'],
    [{ consumption_surveyor: 8 }, '—', '—'],
    [{ flowmeter_total: 0, consumption_surveyor: 8 }, '-8.000', '—'],
    [
      {
        flowmeter_total: 10,
        consumption_surveyor: 8,
        flowmeter_soundings: null,
      },
      '—',
      '—',
    ],
    [
      {
        flowmeter_total: 10,
        consumption_surveyor: 8,
        consumption_flowmeter_difference: '',
        consumption_flowmeter_percentage: '',
      },
      '—',
      '—',
    ],
    [
      {
        flowmeter_total: 10,
        consumption_surveyor: 8,
        consumption_flowmeter_difference: 0,
        consumption_flowmeter_percentage: 0,
      },
      '0.000',
      '0.00',
    ],
    [{ flowmeter_total: Infinity, consumption_surveyor: 8 }, '—', '—'],
  ] as const)(
    'preserves missing values, zero denominators and explicit flowmeter results: %j',
    async (data, difference, percentage) => {
      const xml = await xmlOf({ data });
      const line = paragraphs(xml)
        .map(textOf)
        .find((p) => p.includes('mt or'))!;
      expect(line).toContain(
        `Dif………………….: ${difference} mt or ${percentage} %`,
      );
    },
  );
  it('shows positive and negative grade differences with the signs used by the model', async () => {
    const text = textOf(
      await xmlOf({
        data: {
          grade_1_present: 'Yes',
          grade_1_difference: 5.07,
          grade_1_percentage: 2.34,
          grade_2_present: 'Yes',
          grade_2_difference: -7,
        },
      }),
    );
    for (const expected of ['+ 5.070', '+ 2.34', '- 7.000'])
      expect(text).toContain(expected);
  });
  it('does not print non-finite values or template instructions', async () => {
    const xml = await xmlOf({
      data: {
        loa: Infinity,
        sludge_berthing: NaN,
        flowmeter_accuracy: -Infinity,
      },
    });
    expect(textOf(xml)).not.toMatch(
      /NaN|Infinity|summary B\d+|time log F\d+|manter sempre|ler em formato/i,
    );
    expect(/<w:highlight\b|\{(?:%%?|#|\/)?[A-Za-z_][^{}]*\}/.test(xml)).toBe(
      false,
    );
  });
  it('retains the exact attachment labels, conditional attendance and ROB narrative', async () => {
    const xml = await xmlOf({
      data: {
        appointed_service: 'ROB Survey',
        vessel_name: 'MSC TEST',
        last_attendance: 'Yes',
        logbook_updated: 'Attached',
        vrs_updated: 'No',
      },
    });
    const text = textOf(xml);
    for (const item of [
      'Survey Report issued by undersigned surveyor',
      'Berthing message',
      'VRS updated',
      'Last manual sounding',
      'Logbook update',
      'Sludge removal certificates',
    ])
      expect(text).toContain(item);
    expect(text).not.toContain('verify the total amount of sludge disposed');
    expect(text).toContain('the logbook was updated');
    expect(text).not.toContain('the logbook and VRS were updated');
    expect(xml.includes('w:name="s3_8"')).toBe(true);
    expect(xml.includes('w:name="s5_5"')).toBe(false);
  });
});
