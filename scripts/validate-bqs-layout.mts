/** Native BQS layout acceptance. Uses synthetic fixtures; never writes app data. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { runExtraction, validateSpec } from '../packages/core/src/index.ts';
import { preserveBqsFonts } from '../packages/core/src/docx-fonts.ts';
import {
  buildReportDocxBqs,
  type DocxInputBqs,
} from '../apps/worker/src/lib/buildDocxBqs.ts';
import {
  paginateBqsDocx,
  assertBqsPdfPagination,
  replaceBqsPhotoSections,
} from '../apps/worker/src/lib/bqsDocument.ts';
import { convertDocxToPdf } from '../apps/worker/src/lib/soffice.ts';
import { extractPdfText } from '../apps/worker/src/lib/pdfText.ts';
import {
  bqsXmlTools,
  resolveBqsPhotoRegions,
} from '../apps/worker/src/lib/bqsPhotoRegions.ts';

const requireWorker = createRequire(
  new URL('../apps/worker/package.json', import.meta.url),
);
const PizZip = requireWorker('pizzip');

const arg = process.argv.indexOf('--output-dir');
assert.ok(arg > 0 && process.argv[arg + 1], 'Use --output-dir DIRECTORY');
assert.ok(
  process.env.COLLABORA_URL || process.env.COLLABORA_CONVERSION_URL,
  'Native Collabora endpoint required',
);
const out = resolve(process.argv[arg + 1]!);
await mkdir(out, { recursive: true });
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const checkFonts = async (path: string) => {
  const { stdout } = await promisify(execFile)('pdffonts', [path]);
  for (const family of ['Calibri', 'Tahoma', 'SitkaSmall'])
    assert.ok(
      stdout.includes(family),
      `Expected original font ${family}: ${stdout}`,
    );
  assert.ok(
    !/Carlito|NotoSans|NotoSerif/.test(stdout),
    'Unexpected font substitution',
  );
};
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(
  (await readFile(
    new URL(
      '../tests/fixtures/planilhas/bqs/synthetic-v2.xlsx',
      import.meta.url,
    ),
  )) as never,
);
const validated = validateSpec(
  JSON.parse(
    await readFile(
      new URL('../tests/fixtures/specs/bqs.v2.json', import.meta.url),
      'utf8',
    ),
  ),
);
assert.ok(validated.valid);
const extracted = runExtraction(workbook, validated.spec);
const picture = (label: string, color: string, width: number, height: number) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/><text x="40" y="70" font-size="32" fill="white">BQS LAYOUT TEST ONLY</text><text x="40" y="120" font-size="28" fill="white">${label}</text></svg>`,
    ),
  )
    .png()
    .toBuffer();
const a = await picture('COVER', '#244b6c', 1200, 800);
const b = await picture('PORTRAIT', '#876326', 700, 1050);
const c = await picture('VESSEL TANKS', '#286449', 1200, 800);
const input: DocxInputBqs = {
  templateVersion: 2,
  data: {
    ...extracted.data,
    vessel_name: 'BQS LAYOUT TEST',
    cover_vessel_name: 'BQS LAYOUT TEST',
    client: 'NAABSA LAYOUT TEST CLIENT',
    operator: 'TEST OPERATOR',
    supplier: 'TEST SUPPLIER',
    captain: 'TEST MASTER',
    cover_chief_engineer: 'TEST CHIEF ENGINEER',
    report_reference: 'LAYOUT / TEST ONLY',
  },
  tables: extracted.tables,
  photos: { cover: [a], sounding_tables: [b], vessel_tanks: [c] },
  timeLogRows: [],
};
const marker = 'BQS LAYOUT 20261116 SAVED EDIT';
const zip = new PizZip(await buildReportDocxBqs(input));
zip.file(
  'word/document.xml',
  zip
    .file('word/document.xml')!
    .asText()
    .replace('Surveyor’s final remarks:', marker + ':'),
);
let document = zip.generate({ type: 'nodebuffer' });
const nativeBase = (process.env.COLLABORA_CONVERSION_URL ??
  process.env.COLLABORA_URL)!.replace(/\/$/, '');
const nativeSave = async (file: Buffer) => {
  const form = new FormData();
  form.append('data', new Blob([new Uint8Array(file)]), 'bqs.docx');
  const response = await fetch(nativeBase + '/cool/convert-to/docx', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  assert.equal(response.status, 200, 'Native DOCX save');
  return Buffer.from(await response.arrayBuffer());
};
const outputs: Record<string, unknown> = {};
for (const name of ['with-photos', 'without-photos']) {
  console.log('START ' + name);
  const source = await paginateBqsDocx(
    await buildReportDocxBqs(
      name === 'with-photos' ? input : { ...input, photos: {} },
    ),
  );
  const pdf = await convertDocxToPdf(source);
  const text = await extractPdfText(pdf);
  assertBqsPdfPagination(source, text);
  assert.ok(text.includes('TEST MASTER'));
  assert.ok(text.includes('TEST CHIEF ENGINEER'));
  const pages = text.split('\f').filter((p) => p.trim());
  assert.ok(
    pages.every((p) => p.includes('MARINE SURVEYORS & CONSULTANTS')),
    'Shared header on every page',
  );
  await writeFile(join(out, name + '.docx'), source);
  await writeFile(join(out, name + '.pdf'), pdf);
  await checkFonts(join(out, name + '.pdf'));
  outputs[name] = {
    pages: pages.length,
    docxSha256: hash(source),
    pdfSha256: hash(pdf),
  };
}
for (let cycle = 0; cycle < 2; cycle++) {
  console.log('NATIVE SAVE ' + (cycle + 1));
  const previous = document;
  document = preserveBqsFonts(await nativeSave(document), previous);
  const saved = new PizZip(document);
  const xml = saved.file('word/document.xml')!.asText();
  assert.ok(xml.includes(marker), 'Manual edit survived native save');
  const regions = resolveBqsPhotoRegions(bqsXmlTools.str2xml(xml));
  assert.equal(Object.keys(regions).length, 5);
  const replacement = await buildReportDocxBqs({
    ...input,
    photos: { cover: [a], vessel_tanks: cycle === 0 ? [b, c, b] : [b, c] },
  });
  document = replaceBqsPhotoSections(document, replacement);
  assert.ok(
    new PizZip(document).file('word/document.xml')!.asText().includes(marker),
  );
}
document = await paginateBqsDocx(document);
const finalPdf = await convertDocxToPdf(document);
const finalText = await extractPdfText(finalPdf);
assert.ok(finalText.includes(marker));
assertBqsPdfPagination(document, finalText);
await writeFile(join(out, 'native-roundtrip.docx'), document);
await writeFile(join(out, 'native-roundtrip.pdf'), finalPdf);
await checkFonts(join(out, 'native-roundtrip.pdf'));
outputs.native = {
  cycles: 2,
  manualEditPreserved: true,
  photoRegions: 5,
  docxSha256: hash(document),
  pdfSha256: hash(finalPdf),
};
await writeFile(join(out, 'acceptance.json'), JSON.stringify(outputs, null, 2));
console.log(JSON.stringify(outputs));
