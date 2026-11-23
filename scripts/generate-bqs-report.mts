/** Local, reproducible BQS generation. Never reads application credentials. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  runExtraction,
  validateSpec,
  validate,
  resolveFieldValue,
  collectFields,
  type FieldValue,
} from '../packages/core/src/index.ts';
import {
  buildReportDocxBqs,
  auditBqsCalculations,
  readBqsTimeLog,
} from '../apps/worker/src/lib/buildDocxBqs.ts';
const args = process.argv.slice(2);
const option = (key: string) => {
  const i = args.indexOf(key);
  return i === -1 ? undefined : args[i + 1];
};
const xlsxPath = option('--xlsx');
const outputDir = option('--output-dir');
if (!xlsxPath || !outputDir)
  throw new Error(
    'Use --xlsx ARQUIVO --output-dir PASTA [--version 1|2] [--overrides JSON] [--photos JSON] [--toc JSON]',
  );
const templateVersion = Number(option('--version') ?? '1');
if (templateVersion !== 1 && templateVersion !== 2)
  throw new Error('Unsupported BQS version');
const source = await readFile(xlsxPath);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(source as never);
const checked = validateSpec(
  JSON.parse(
    await readFile(
      new URL(
        `../tests/fixtures/specs/bqs.v${templateVersion}.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);
if (!checked.valid) throw new Error(checked.errors.join('; '));
const extracted = runExtraction(workbook, checked.spec);
const overridePath = option('--overrides');
const overrides = (
  overridePath ? JSON.parse(await readFile(overridePath, 'utf8')) : {}
) as Record<string, FieldValue>;
const data = Object.fromEntries(
  collectFields(checked.spec, null).map(([name]) => [
    name,
    resolveFieldValue(name, overrides, extracted.data),
  ]),
);
const outstanding = extracted.issues.filter(
  (issue) =>
    issue.origin === 'extraction' &&
    issue.level === 'error' &&
    !Object.hasOwn(overrides, issue.field),
);
outstanding.push(
  ...validate(data, checked.spec, null).filter((i) => i.level === 'error'),
);
if (outstanding.length) throw new Error(JSON.stringify(outstanding));
const tocPath = option('--toc');
const tocPages = tocPath
  ? (JSON.parse(await readFile(tocPath, 'utf8')) as Record<string, number>)
  : undefined;
const photoPaths = option('--photos');
const photoMapping = photoPaths
  ? (JSON.parse(await readFile(photoPaths, 'utf8')) as Record<string, string[]>)
  : {};
const photos = Object.fromEntries(
  await Promise.all(
    Object.entries(photoMapping).map(async ([id, paths]) => [
      id,
      await Promise.all(paths.map((p) => readFile(p))),
    ]),
  ),
);
const input = {
  templateVersion,
  data,
  tables: extracted.tables,
  photos,
  timeLogRows: readBqsTimeLog(workbook, data),
  tocPages,
};
const audit = auditBqsCalculations(input);
if (audit.length) throw new Error(audit.join('; '));
const out = resolve(outputDir);
await mkdir(out, { recursive: true });
const docx = await buildReportDocxBqs(input);
await writeFile(join(out, 'BQS_REPORT.docx'), docx);
await writeFile(
  join(out, 'extraction.json'),
  JSON.stringify(
    {
      source: resolve(xlsxPath),
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      overrides,
      extracted,
      effectiveData: data,
      timeLog: input.timeLogRows,
      calculationIssues: audit,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    docx: join(out, 'BQS_REPORT.docx'),
    fields: Object.keys(data).length,
    tableRows: Object.fromEntries(
      Object.entries(extracted.tables).map(([k, v]) => [k, v.length]),
    ),
    audit,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
  }),
);
