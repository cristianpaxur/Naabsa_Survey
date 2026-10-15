import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runExtraction, validateSpec } from '@naabsa/core';
import {
  buildReportDocxMsc,
  replaceMscPhotoSections,
  updateMscTocPages,
  type DocxInputMsc,
  type TimeLogRow,
} from './buildDocxMsc';
import {
  buildPaginatedDocxMsc,
  fitMscCoverContacts,
  mscPagesFromPdfText,
} from './mscPagination';

const execFileAsync = promisify(execFile);
const fixtures = new URL('../../../../tests/fixtures/', import.meta.url);
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const expectedFields = {
  voy: 'MM623R',
  purifier_temp: 98,
  purifier_flow: '1 x 2,0',
  purifier_bowl_freq: 60,
};
const sections: Record<string, { number: string; body: string; toc?: string }> =
  {
    s1: { number: '1', body: 'Vessel´s details (Ship´s Particulars)' },
    s2: { number: '2', body: 'Background' },
    s3: { number: '3', body: 'Found at Survey' },
    s3_1: { number: '3.1', body: 'Purifiers Settings' },
    s3_2: { number: '3.2', body: 'Temperature' },
    s3_3: {
      number: '3.3',
      body: 'Specific Gravities',
      toc: 'Specific gravity',
    },
    s3_4: { number: '3.4', body: 'Gross volume - m3', toc: 'Gross volume' },
    s3_5: { number: '3.5', body: 'Sludge Disposal' },
    s3_6: {
      number: '3.6',
      body: 'Sludge Rate Production',
      toc: 'Sludge rate production',
    },
    s3_7: {
      number: '3.7',
      body: 'Consumption X Flowmeters',
      toc: 'Consumption x Flowmeter',
    },
    s3_8: { number: '3.8', body: 'Last attendences', toc: 'Last attendances' },
    s4: { number: '4', body: 'Time log' },
    s5: {
      number: '5',
      body: 'Photographic Report',
      toc: 'Photographic report',
    },
    s5_1: { number: '5.1', body: 'Vessel' },
    s5_2: { number: '5.2', body: 'Engine Room' },
    s5_3: { number: '5.3', body: 'Survey attendance' },
    s5_4: { number: '5.4', body: 'ECR' },
    s5_5: { number: '5.5', body: 'Hull' },
    s6: { number: '6', body: 'Attachment' },
  };
const nativeHeadingPattern = (id: string, label: string) =>
  new RegExp(
    `(?:^|\\s)${escapeRegex(sections[id]!.number)}\\.?\\s*${escapeRegex(label)}(?=\\s|$)`,
  );
const syntheticColors: Record<string, readonly [number, number, number]> = {
  cover: [102, 119, 153],
  landscape: [68, 102, 136],
  portrait: [119, 136, 68],
  wide: [136, 68, 102],
  engine: [68, 119, 102],
  ecr: [136, 102, 68],
  hull: [102, 85, 136],
  survey: [136, 85, 34],
};
const photoIdentity = (image: PdfImage) =>
  Object.entries(syntheticColors).find(([, rgb]) =>
    image.sampleRgb?.every(
      (channel, index) => Math.abs(channel - rgb[index]!) <= 3,
    ),
  )?.[0];

interface PdfImage {
  width: number;
  height: number;
  x0: number;
  top: number;
  sourceWidth: number;
  sourceHeight: number;
  sampleRgb: number[] | null;
}
interface PdfPage {
  page: number;
  text: string;
  width?: number;
  height?: number;
  /** null means the text-only inspector cannot confirm image placement. */
  images: PdfImage[] | null;
  surveyVisiblePixels?: number;
}
interface PdfInspection {
  engine: string;
  pages: PdfPage[];
}

// This is only a local test harness. No Python or PDF dependency is added to the worker.
const pythonInspector = `import io, json, sys
from pypdf import PdfReader
from PIL import Image
import pdfplumber
def sample_rgb(image):
    stream = image.get("stream")
    if stream is None:
        return None
    data = stream.get_data()
    try:
        decoded = Image.open(io.BytesIO(data)).convert("RGB")
    except (OSError, ValueError):
        size = (int(image["srcsize"][0]), int(image["srcsize"][1]))
        if len(data) != size[0] * size[1] * 3:
            return None
        decoded = Image.frombytes("RGB", size, data)
    return list(decoded.getpixel((decoded.width // 2, decoded.height // 2)))
reader = PdfReader(sys.argv[1])
pages = []
with pdfplumber.open(sys.argv[1]) as document:
    for index, page in enumerate(reader.pages):
        images = []
        for image in document.pages[index].images:
            size = image.get("srcsize", (0, 0))
            images.append({"width": float(image["width"]), "height": float(image["height"]),
                "x0": float(image["x0"]), "top": float(image["top"]),
                "sourceWidth": int(size[0]), "sourceHeight": int(size[1]), "sampleRgb": sample_rgb(image)})
        rendered=document.pages[index].to_image(resolution=72).original.convert("RGB")
        survey_pixels=sum(count for count,rgb in rendered.getcolors(rendered.width*rendered.height) if all(abs(rgb[i]-target)<=3 for i,target in enumerate((136,85,34))))
        pages.append({"page": index + 1, "text": page.extract_text() or "", "surveyVisiblePixels":survey_pixels,
            "width": float(page.mediabox.width), "height": float(page.mediabox.height), "images": images})
print(json.dumps({"engine": "pypdf/pdfplumber", "pages": pages}, ensure_ascii=True))`;

async function inspectPdf(path: string): Promise<PdfInspection> {
  const options = {
    encoding: 'utf8' as const,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  };
  const withPython = async () => {
    const { stdout } = await execFileAsync(
      process.env['PYTHON_PATH'] || 'python',
      ['-c', pythonInspector, path],
      options,
    );
    return JSON.parse(stdout) as PdfInspection;
  };
  if (process.env['PYTHON_PATH']) return withPython();
  let textInspection: PdfInspection | undefined;
  try {
    const { stdout } = await execFileAsync(
      process.env['PDFTOTEXT_PATH'] || 'pdftotext',
      ['-layout', '-enc', 'UTF-8', path, '-'],
      options,
    );
    const texts = stdout.split('\f');
    // Poppler terminates the last real page with a form feed, not an extra page.
    if (texts.at(-1)?.trim() === '') texts.pop();
    textInspection = {
      engine: 'pdftotext',
      pages: texts.map((text, i) => ({ page: i + 1, text, images: null })),
    };
  } catch {
    // A bundled Python with pypdf/pdfplumber is an alternative to Poppler.
  }
  try {
    const inspected = await withPython();
    if (textInspection)
      return {
        ...inspected,
        engine: 'pdftotext + pypdf/pdfplumber',
        pages: inspected.pages.map((page, i) => ({
          ...page,
          text: textInspection.pages[i]!.text,
        })),
      };
    return inspected;
  } catch (error) {
    if (textInspection) return textInspection;
    throw new Error(
      'RUN_LO_TESTS=1 requires PDFTOTEXT_PATH/pdftotext or PYTHON_PATH/python with pypdf and pdfplumber.',
      { cause: error },
    );
  }
}

function bookmarkHeadings(docx: Buffer): Record<string, string> {
  const xml = new PizZip(docx).file('word/document.xml')!.asText();
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
  return Object.fromEntries(
    [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].flatMap(([paragraph]) => {
      const id = paragraph.match(
        /<w:bookmarkStart\b[^>]*w:name="(s\d+(?:_\d+)?)"/,
      )?.[1];
      if (!id) return [];
      const text = [...paragraph.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((match) => decode(match[1]!))
        .join('');
      return [[id, normalize(text)]];
    }),
  );
}

function fixtureLogRows(workbook: ExcelJS.Workbook): TimeLogRow[] {
  const sheet = workbook.getWorksheet('Time Log')!;
  const value = (row: number, column: number): unknown => {
    const raw = sheet.getCell(row, column).value;
    return raw && typeof raw === 'object' && 'result' in raw ? raw.result : raw;
  };
  const date = (raw: unknown) =>
    raw instanceof Date
      ? raw.toISOString().slice(0, 10)
      : raw == null
        ? null
        : String(raw);
  const time = (raw: unknown) =>
    raw instanceof Date
      ? raw.toISOString().slice(11, 16)
      : raw == null
        ? null
        : String(raw);
  return Array.from({ length: 12 }, (_, i) => ({
    event: `MSC-${String(i + 1).padStart(2, '0')} ${String(value(i + 5, 2) ?? '').trim()}`,
    date: date(value(i + 5, 6)),
    start: time(value(i + 5, 7)),
    flag: String(value(i + 5, 8) ?? '').trim(),
    end: time(value(i + 5, 9)),
  }));
}

// Opt-in: real local LibreOffice, fixture-only data, synthetic photos, no DB/network.
// Artifacts are retained for inspection of EVERY page. Environment overrides:
// MSC_VALIDATION_DIR, SOFFICE_PATH, PDFTOTEXT_PATH, PYTHON_PATH (pypdf/pdfplumber).
describe.skipIf(process.env['RUN_LO_TESTS'] !== '1')(
  'MSC — native PDF acceptance (RF-001–RF-009)',
  () => {
    let runtimeDir: string;
    let outputDir: string;
    let input: DocxInputMsc;
    let surveyAttendancePhoto: Buffer;
    let converter: typeof import('./soffice');
    const evidence: Record<string, unknown> = {};

    beforeAll(async () => {
      runtimeDir = await mkdtemp(join(tmpdir(), 'naabsa-msc-native-'));
      outputDir = process.env['MSC_VALIDATION_DIR']
        ? resolve(process.env['MSC_VALIDATION_DIR'])
        : await mkdtemp(join(tmpdir(), 'naabsa-msc-validation-'));
      await mkdir(outputDir, { recursive: true });
      // A filtered rerun adds its evidence without removing other retained scenarios.
      try {
        Object.assign(
          evidence,
          JSON.parse(
            await readFile(join(outputDir, 'pages.json'), 'utf8'),
          ) as Record<string, unknown>,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      vi.stubEnv('LO_PROFILE_DIR', join(runtimeDir, 'profile'));
      vi.stubEnv('COLLABORA_CONVERSION_URL', '');
      vi.stubEnv('COLLABORA_URL', '');
      vi.stubGlobal('fetch', () => {
        throw new Error(
          'Network access is forbidden in the native MSC PDF test.',
        );
      });
      // soffice reads LO_PROFILE_DIR at module evaluation time.
      vi.resetModules();
      converter = await import('./soffice');

      const spec = validateSpec(
        JSON.parse(
          await readFile(new URL('specs/msc.v1.json', fixtures), 'utf8'),
        ) as unknown,
      );
      if (!spec.valid) throw new Error(spec.errors.join('; '));
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(
        fileURLToPath(new URL('planilhas/msc/msc.real.v1.xlsx', fixtures)),
      );
      const extracted = runExtraction(workbook, spec.spec);
      expect(
        extracted.issues.filter((issue) => issue.level === 'error'),
      ).toEqual([]);
      expect(extracted.data).toMatchObject(expectedFields);
      const photo = (width: number, height: number, background: string) =>
        sharp({ create: { width, height, channels: 3, background } })
          .png()
          .toBuffer();
      const [cover, landscape, portrait, wide, engine, ecr, hull] =
        await Promise.all([
          photo(1200, 750, '#667799'),
          photo(800, 600, '#446688'),
          photo(600, 800, '#778844'),
          photo(1600, 900, '#884466'),
          photo(960, 540, '#447766'),
          photo(540, 960, '#886644'),
          photo(900, 600, '#665588'),
        ]);
      input = {
        // A known date tests narrative formatting; the four RF-007 values remain extracted.
        data: { ...extracted.data, berthing_date: '2026-09-30' },
        logo: null,
        coverPhoto: cover!,
        photos: {
          vessel: [landscape!, portrait!, wide!],
          engine_room: [engine!, engine!, engine!],
          survey_attendance: [],
          ecr: [ecr!],
          hull: [hull!, hull!],
        },
        timeLogRows: fixtureLogRows(workbook),
      };
      surveyAttendancePhoto = await photo(800, 600, '#885522');
      evidence['fixtureFields'] = expectedFields;
      evidence['notes'] = [
        'Synthetic cover/landscape/portrait photos; odd Vessel/Engine Room groups and empty Survey attendance.',
        'Logo geometry and visual alignment require inspection of the retained PDFs and validation in the destination editor.',
      ];
      console.info(`MSC native validation artifacts: ${outputDir}`);
    }, 30_000);

    afterAll(async () => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      if (runtimeDir) await rm(runtimeDir, { recursive: true, force: true });
    });

    it('refreshed cover: keeps command contacts on page 1 and remeasures the edited Word TOC', async () => {
      const caseInput: DocxInputMsc = {
        ...input,
        coverPhoto: input.photos.vessel![0],
        // A saved Word already has numeric TOC entries from its initial build.
        tocPages: Object.fromEntries(
          Object.keys(sections).map((id) => [id, 1]),
        ),
        data: {
          ...input.data,
          manager: 'MSC SHIPMANAGEMENT LIMITED, LIMASSOL, CYPRUS',
          surveyors: 'ARMANDO JUNIOR',
          captain: 'MUKESH MAHENDRA MIRANDA',
          chief_engineer: 'SIBI JESU ANTHONY',
        },
      };
      const saved = new PizZip(await buildReportDocxMsc(caseInput));
      saved.file(
        'word/document.xml',
        saved
          .file('word/document.xml')!
          .asText()
          .replaceAll('SemEspaamento', 'EditorNoSpacing')
          .replace(
            'Complying with Messrs.',
            'MANUAL EDIT RETAINED. Complying with Messrs.',
          ),
      );
      saved.file(
        'word/styles.xml',
        saved
          .file('word/styles.xml')!
          .asText()
          .replaceAll('SemEspaamento', 'EditorNoSpacing'),
      );
      const refreshed = replaceMscPhotoSections(
        saved.generate({ type: 'nodebuffer' }),
        await buildReportDocxMsc(caseInput),
      );
      const measurements: Record<string, number>[] = [];
      let pdf: Buffer;
      const measure = async (docx: Buffer) => {
        pdf = await converter.convertDocxToPdf(docx);
        const measurementPath = join(outputDir, 'refreshed-cover-measure.pdf');
        await writeFile(measurementPath, pdf);
        const inspected = await inspectPdf(measurementPath);
        const pages = mscPagesFromPdfText(
          docx,
          inspected.pages.map((page) => page.text).join('\f'),
        );
        measurements.push(pages);
        return pages;
      };
      const fitted = await fitMscCoverContacts(refreshed, measure);
      expect(measurements[0]!['msc_cover_contacts_end']).toBeGreaterThan(1);
      expect(fitted.pages['msc_cover_contacts_end']).toBe(1);
      const docx = updateMscTocPages(fitted.docx, fitted.pages);
      expect(await measure(docx)).toEqual(fitted.pages);
      const pdfPath = join(outputDir, 'refreshed-cover.pdf');
      await writeFile(pdfPath, pdf!);
      await writeFile(join(outputDir, 'refreshed-cover.docx'), docx);
      const inspected = await inspectPdf(pdfPath);
      expect(normalize(inspected.pages[0]!.text)).toContain(
        'MUKESH MAHENDRA MIRANDA',
      );
      expect(normalize(inspected.pages[0]!.text)).toContain(
        'SIBI JESU ANTHONY',
      );
      expect(inspected.pages[1]!.text).toContain('Contents');
      expect(inspected.pages.map((page) => page.text).join('\n')).toContain(
        'MANUAL EDIT RETAINED',
      );
      for (const [id, label] of Object.entries(bookmarkHeadings(docx))) {
        const tocLabel = sections[id]!.toc ?? label;
        expect(normalize(inspected.pages[1]!.text)).toMatch(
          new RegExp(
            `${escapeRegex(sections[id]!.number)}\\.?\\s+${escapeRegex(tocLabel)}[\\s.·…]+${fitted.pages[id]}(?=\\s|$)`,
          ),
        );
      }
      evidence['refreshed-cover'] = {
        measurements,
        pages: inspected.pages,
        pdfPath,
      };
      await writeFile(
        join(outputDir, 'pages.json'),
        JSON.stringify(evidence, null, 2),
        'utf8',
      );
    }, 300_000);

    it.each([
      ['compact', 12],
      ['long', 45],
      ['multiline', 12],
      ['long-contacts', 12],
    ] as const)(
      '%s: measured TOC, intact Time log, photos and fixture values',
      async (name, count) => {
        const rows = Array.from({ length: count }, (_, i) => {
          const marker = `MSC-${String(i + 1).padStart(2, '0')}`;
          const event =
            name === 'multiline'
              ? `${marker} Complete maritime attendance record with vessel dates and times preserved during native pagination.`
                  .slice(0, 97)
                  .padEnd(97, '.')
              : `${marker} ${input.timeLogRows[i % 12]!.event.replace(/^MSC-\d+ /, '')}`;
          return { ...input.timeLogRows[i % 12]!, event };
        });
        if (name === 'multiline')
          expect(rows.every((row) => row.event.length === 97)).toBe(true);
        const caseInput = {
          ...input,
          timeLogRows: rows,
          ...(name === 'long-contacts'
            ? {
                coverPhoto: input.photos.vessel![0],
                photos: {
                  ...input.photos,
                  survey_attendance: [
                    surveyAttendancePhoto,
                    surveyAttendancePhoto,
                  ],
                },
                data: {
                  ...input.data,
                  manager: 'MSC SHIPMANAGEMENT LIMITED, LIMASSOL, CYPRUS',
                  surveyors: 'ARMANDO JUNIOR',
                  captain: 'MUKESH MAHENDRA MIRANDA',
                  chief_engineer: 'SIBI JESU ANTHONY',
                },
              }
            : {}),
        };
        const pass1 = await buildReportDocxMsc(caseInput);
        // Persist the first pass too if native measurement fails before final assembly.
        const docxPath = join(outputDir, `${name}.docx`);
        await writeFile(docxPath, pass1);
        if (name === 'long-contacts')
          expect(
            (await converter.measureBookmarkPages(pass1))[
              'msc_cover_contacts_end'
            ],
          ).toBeGreaterThan(1);
        const docx = await buildPaginatedDocxMsc(caseInput, {
          build: buildReportDocxMsc,
          measure: converter.measureBookmarkPages,
        });
        const measured = await converter.measureBookmarkPages(docx);
        await writeFile(docxPath, docx);
        const pdf = await converter.convertDocxToPdf(docx);
        const pdfPath = join(outputDir, `${name}.pdf`);
        await writeFile(pdfPath, pdf);
        expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
        const inspected = await inspectPdf(pdfPath);
        const pdfMeasured = mscPagesFromPdfText(
          docx,
          inspected.pages.map((page) => page.text).join('\f'),
        );
        expect(pdfMeasured['msc_cover_contacts_end']).toBe(1);
        expect(normalize(inspected.pages[0]!.text)).toContain(
          name === 'long-contacts'
            ? 'SIBI JESU ANTHONY'
            : String(caseInput.data['chief_engineer']),
        );
        const headings = bookmarkHeadings(docx);
        const firstTocEntry = new RegExp(
          `${escapeRegex(sections['s1']!.body)}[\\s.·…]+\\d+(?=\\s|$)`,
        );
        const tocPages = inspected.pages.filter(
          (page) =>
            /\bContents\b/.test(page.text) ||
            firstTocEntry.test(normalize(page.text)),
        );
        const tocPageNumbers = new Set(tocPages.map((page) => page.page));
        const bodyPages = inspected.pages.filter(
          (page) => !tocPageNumbers.has(page.page),
        );
        const actualHeadings = Object.fromEntries(
          Object.entries(headings).map(([id, label]) => [
            id,
            bodyPages
              .filter((page) =>
                nativeHeadingPattern(id, label).test(normalize(page.text)),
              )
              .map((page) => page.page),
          ]),
        );
        const eventPages = Object.fromEntries(
          rows.map((row, i) => [
            i + 1,
            inspected.pages
              .filter((page) => page.text.includes(row.event.slice(0, 6)))
              .map((page) => page.page),
          ]),
        );
        // Save evidence before layout assertions so a regression remains reviewable.
        evidence[name] = {
          generatedAt: new Date().toISOString(),
          docxPath,
          pdfPath,
          engine: inspected.engine,
          tocPageNumbers: [...tocPageNumbers],
          measured,
          actualHeadings,
          eventPages,
          inputRows: rows,
          pages: inspected.pages,
        };
        await writeFile(
          join(outputDir, 'pages.json'),
          JSON.stringify(evidence, null, 2),
          'utf8',
        );

        expect(inspected.pages.length).toBeGreaterThan(0);
        expect(headings['s5_1']).toBe('Vessel');
        expect(Object.keys(headings)).not.toContain('s2_10');
        expect(tocPages).toHaveLength(1);
        for (const [id, label] of Object.entries(headings)) {
          expect(
            sections[id],
            `${name}: expected revised Word heading ${id}`,
          ).toBeDefined();
          expect(label).not.toMatch(/^\d+\./);
          expect(
            actualHeadings[id],
            `${name}: one body heading ${label}`,
          ).toHaveLength(1);
          const actualPage = actualHeadings[id]![0]!;
          expect(measured[id], `${name}: measured page for ${label}`).toBe(
            actualPage,
          );
          const tocLabel = sections[id]!.toc ?? label;
          expect(
            normalize(tocPages[0]!.text),
            `${name}: visible Contents page for ${label}`,
          ).toMatch(
            new RegExp(
              `${escapeRegex(sections[id]!.number)}\\.?\\s+${escapeRegex(tocLabel)}[\\s.·…]+${actualPage}(?=\\s|$)`,
            ),
          );
        }

        const text = normalize(
          inspected.pages.map((page) => page.text).join('\n'),
        );
        expect(text).toMatch(/Quantity disposed[\s.·…]*: 47\.020\b/);
        expect(text).toMatch(/Quantity retained[\s.·…]*: 16\.680\b/);
        for (const value of [
          'MM623R',
          '60 minutes',
          'We did attend vessel on September 30th, 2026',
        ])
          expect(text).toContain(value);
        expect(text).toMatch(/98\s*°\s*C/);
        expect(text).toMatch(/1\s*x\s*2,0\s*[mM]\s*[3³]/);
        expect(text).not.toMatch(
          /We did attend vessel on 30\/09\/2026|undefined|NaN|Infinity|Print da planilha|Neste item|autom[aá]tico|Summary![A-Z]|Sludge![A-Z]|Time Log![A-Z]|\{(?:%%?|#|\/)?[A-Za-z_][^{}]*\}/i,
        );
        const firstDate = rows[0]!.date;
        if (firstDate?.match(/^\d{4}-\d{2}-\d{2}$/))
          expect(text).toContain(firstDate.split('-').reverse().join('/'));
        let previousPosition = -1;
        for (let i = 1; i <= count; i++) {
          const marker = `MSC-${String(i).padStart(2, '0')}`;
          expect(
            eventPages[i],
            `${name}: event ${i} stays on one page`,
          ).toHaveLength(1);
          expect(
            [...text.matchAll(new RegExp(escapeRegex(marker), 'g'))],
            `${name}: event ${i} appears once`,
          ).toHaveLength(1);
          expect(text.indexOf(marker)).toBeGreaterThan(previousPosition);
          previousPosition = text.indexOf(marker);
          const row = rows[i - 1]!;
          const next =
            i === count
              ? text.length
              : text.indexOf(`MSC-${String(i + 1).padStart(2, '0')}`);
          const rowText = text.slice(previousPosition, next);
          if (row.date?.match(/^\d{4}-\d{2}-\d{2}$/))
            expect(rowText, `${name}: event ${i} date`).toContain(
              row.date.split('-').reverse().join('/'),
            );
          for (const time of [row.start, row.end])
            if (time)
              expect(rowText, `${name}: event ${i} time`).toContain(time);
          if (row.flag)
            expect(rowText, `${name}: event ${i} flag`).toMatch(
              new RegExp(`(?:^|\\s)${escapeRegex(row.flag)}(?:\\s|$)`),
            );
        }
        const logPages = new Set(Object.values(eventPages).flat());
        if (name !== 'long') {
          expect(logPages.size).toBe(1);
          expect(eventPages[1]).toEqual(eventPages[12]);
          expect(
            actualHeadings['s4']![0],
            `${name}: source title precedes its table`,
          ).toBeLessThanOrEqual(eventPages[1]![0]!);
        } else {
          expect(logPages.size).toBeGreaterThan(1);
          for (const page of inspected.pages.filter((page) =>
            logPages.has(page.page),
          ))
            expect(
              normalize(page.text),
              `repeated merged Time log header on page ${page.page}`,
            ).toMatch(/\bDate\s+Time\b/);
        }

        const vesselPage = actualHeadings['s5_1']![0]!;
        for (const label of [
          'Survey Report issued by undersigned surveyor',
          'Berthing message',
          'VRS updated',
          'Last manual sounding',
          'Logbook update',
          'Sludge removal certificates',
        ])
          expect(
            inspected.pages
              .filter((page) =>
                page.text
                  .split(/\r?\n/)
                  .some(
                    (line) =>
                      normalize(line).replace(/^[•]\s*/u, '') === label,
                  ),
              )
              .map((page) => page.page),
            `${name}: complete attachment block stays with its heading`,
          ).toEqual([actualHeadings['s6']![0]!]);
        expect(
          actualHeadings['s5']![0],
          `${name}: source Photographic Report precedes Vessel`,
        ).toBeLessThanOrEqual(vesselPage);
        expect(
          actualHeadings['s5']![0],
          `${name}: Photographic Report stays with Vessel and its first photo`,
        ).toBe(vesselPage);
        if (inspected.pages.every((page) => page.images !== null)) {
          // PDF export may resample raster dimensions. The uniform fixture colors identify
          // input photos independently of resolution and distinguish them from institutional logos.
          const photos = inspected.pages
            .flatMap((page) =>
              page.images!.map((image) => ({ ...image, page: page.page })),
            )
            .filter((image) => photoIdentity(image));
          const firstVesselImage = photos.find(
            (image) =>
              image.page >= vesselPage && photoIdentity(image) === 'landscape',
          );
          expect(
            firstVesselImage,
            'first actual Vessel photo is present',
          ).toBeDefined();
          expect(
            firstVesselImage!.page,
            'source Vessel title precedes its first PDF photo',
          ).toBe(vesselPage);
          const gallery = photos.filter((image) => image.page >= vesselPage);
          expect(gallery).toHaveLength(name === 'long-contacts' ? 11 : 9);
          expect(photos).toHaveLength(name === 'long-contacts' ? 12 : 10);
          expect(gallery.map(photoIdentity)).toEqual([
            'landscape',
            'portrait',
            'wide',
            'engine',
            'engine',
            'engine',
            ...(name === 'long-contacts' ? ['survey', 'survey'] : []),
            'ecr',
            'hull',
            'hull',
          ]);
          const mmToPt = 72 / 25.4;
          if (name === 'long-contacts')
            expect(
              inspected.pages.reduce(
                (sum, page) => sum + (page.surveyVisiblePixels ?? 0),
                0,
              ),
              'complete visible Survey attendance frames, without 50% line-height clipping',
            ).toBeGreaterThan(2 * 80 * 60 * mmToPt * mmToPt * 0.9);
          for (const image of photos) {
            const cover = image.page < vesselPage;
            expect(image.width).toBeLessThanOrEqual(
              (cover ? 160 : 80) * mmToPt + 0.5,
            );
            expect(image.height).toBeLessThanOrEqual(
              (cover ? 120 : 60) * mmToPt + 0.5,
            );
            expect(image.width / image.height).toBeCloseTo(
              image.sourceWidth / image.sourceHeight,
              2,
            );
          }
          expect(photos[0]!.width).toBeGreaterThan(80 * mmToPt);
        } else {
          const xml = new PizZip(docx).file('word/document.xml')!.asText();
          const vesselTitle =
            [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].find(([paragraph]) =>
              paragraph.includes('w:name="s5_1"'),
            )?.[0] ?? '';
          const vessel = xml.slice(
            xml.indexOf('w:name="s5_1"'),
            xml.indexOf('w:name="s5_2"'),
          );
          expect(vesselTitle).toContain('<w:numPr>');
          expect(vessel).toContain('<w:drawing>');
          console.info(
            `${name}: text-only PDF inspection; confirm Vessel/photo placement visually in ${pdfPath}.`,
          );
        }
        for (const page of inspected.pages) {
          expect(
            normalize(page.text),
            `institutional header on page ${page.page}`,
          ).toContain('MARINE SURVEYORS & CONSULTANTS');
          expect(normalize(page.text)).toContain('Main Brazilian Ports');
          const body = normalize(page.text)
            .replace('MARINE SURVEYORS & CONSULTANTS', '')
            .replace('Main Brazilian Ports', '')
            .replace(
              /surveyors@naabsa\.com(?:\.br)?\s*\|\s*(?:www\.)?naabsa\.com(?:\s*\|\s*tel\.:\s*\+55\s*13\s*3394[-\s]?0655)?/g,
              '',
            )
            .replace(/[\d\s.|]+/g, '');
          const hasInputPhoto = page.images?.some((image) =>
            photoIdentity(image),
          );
          if (page.images !== null)
            expect(
              body.length > 0 || hasInputPhoto,
              `${name}: no page containing only institutional furniture ${page.page}`,
            ).toBe(true);
        }
      },
      300_000,
    );
  },
);
