# Decimal Display Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the decimal places displayed in Excel and subsequently chosen by the operator while keeping every field value numeric for calculations and validation.

**Architecture:** Store numeric value and display precision separately. Extraction produces a per-field precision map; PostgreSQL stores extracted and operator maps; a shared resolver applies operator → Excel → spec precedence; review, AI and document builders consume the resolved map.

**Tech Stack:** TypeScript, ExcelJS, Next.js Server Actions, React, PostgreSQL/Supabase JSONB, Vitest, Docxtemplater, LibreOffice production build pipeline.

**Spec:** `docs/superpowers/specs/2026-09-17-decimal-display-precision-design.md`

## Global Constraints

- Apply the behavior to every field whose spec has `type: "number"`.
- Keep numeric values as JSON numbers; never encode trailing zeros into `FieldValue` strings.
- Accept display precision from 0 through 100 decimal places.
- Precedence is operator precision, then extracted Excel precision, then `FieldDef.decimals`, then unrestricted numeric rendering.
- Clearing a numeric override removes its operator precision metadata.
- Existing reports with empty precision maps continue to use the frozen spec as fallback.
- UI text and errors remain in pt-BR.
- Do not add `unsafe-eval` or import the root `@naabsa/core` runtime into client components.
- Every production change follows RED → GREEN → refactor and receives its own focused commit.

---

## File map

- `packages/core/src/number-format.ts`: pure parsing, Excel format inference, precision resolution and numeric display formatting.
- `packages/core/src/types.ts`: `NumberFormatMap` and `ExtractionResult.numberFormats` contracts.
- `packages/core/src/extractor/extract.ts`: capture `Cell.numFmt` beside extracted numeric values.
- `packages/core/src/extractor/coerce.ts`: stop using display precision to round stored values.
- `packages/db/migrations/0019_report_number_formats.sql`: two JSONB maps, constraints and data-revision trigger update.
- `apps/web/app/api/reports/[id]/spreadsheet/route.ts`: persist extracted precision.
- `apps/web/lib/effective-values.ts`: attach effective display precision to review fields.
- `apps/web/lib/localized-number.ts`: parse both numeric value and typed decimal count.
- `apps/web/lib/actions/review.ts`: atomically persist numeric override and operator precision.
- `apps/web/components/review/FieldRow.tsx`: display and submit the exact typed precision.
- `apps/worker/src/jobs/aiReview.ts`: use effective precision in `display_value`.
- `apps/worker/src/jobs/generatePdf.ts`: load and resolve precision maps for document generation.
- `apps/worker/src/lib/buildDocxFromTemplate.ts`, `buildDocx.ts`, `buildDocxMsc.ts`: format spec-backed numbers with the effective precision map.
- `packages/core/src/document-builder/**`: propagate the same map through the legacy TipTap builder.

---

### Task 1: Core numeric precision contract and Excel extraction

**Files:**
- Create: `packages/core/src/number-format.ts`
- Create: `packages/core/src/number-format.test.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/extractor/extract.ts`
- Modify: `packages/core/src/extractor/extract.test.ts`
- Modify: `packages/core/src/extractor/coerce.ts`
- Modify: `packages/core/src/extractor/coerce.test.ts`

**Interfaces:**
- Produces: `type NumberFormatMap = Record<string, number>`.
- Produces: `inferExcelDisplayDecimals(numFmt: string | undefined, value: number): number | undefined`.
- Produces: `resolveDisplayDecimals(field, fieldDef, extractedFormats, operatorFormats, overrides): number | undefined`.
- Produces: `formatNumberWithDecimals(value, decimals, grouped?): string`.
- Changes: `ExtractionResult` gains `numberFormats: NumberFormatMap`.
- Produces: package subpath `@naabsa/core/number-format`, containing only the pure formatter contract and no AJV/spec-validation runtime.

- [ ] **Step 1: Write failing pure-function tests**

Add table-driven tests with literal expectations:

```ts
it.each([
  ['0', 81, 0],
  ['0.0', 81, 1],
  ['#,##0.00', 81, 2],
  ['#,##0.000;[Red]-#,##0.000', -81, 3],
  ['0.##', 81, 0],
  ['0.##', 81.2, 1],
  ['0.##', 81.23, 2],
  ['General', 81, undefined],
])('infere %s para %s', (numFmt, value, expected) => {
  expect(inferExcelDisplayDecimals(numFmt, value)).toBe(expected);
});

it('resolve operador antes de Excel e spec', () => {
  expect(resolveDisplayDecimals('dwt', numberField(3), { dwt: 2 }, { dwt: 1 }, { dwt: 81 })).toBe(1);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @naabsa/core test -- src/number-format.test.ts`

Expected: FAIL because `number-format.ts` and its exports do not exist.

- [ ] **Step 3: Implement the pure contract minimally**

Implement these exact public shapes:

```ts
export type NumberFormatMap = Record<string, number>;

export function inferExcelDisplayDecimals(
  numFmt: string | undefined,
  value: number,
): number | undefined;

export function resolveDisplayDecimals(
  field: string,
  def: FieldDef,
  extracted: NumberFormatMap,
  operator: NumberFormatMap,
  overrides: Record<string, FieldValue>,
): number | undefined;

export function formatNumberWithDecimals(
  value: number,
  decimals?: number,
  grouped?: boolean,
): string;
```

Strip quoted text, escaped characters, bracket directives and all but the applicable positive/negative numeric section before interpreting placeholders. Count required `0` placeholders and retain optional `#`/`?` positions only through the last non-zero fractional digit. Reject inferred values outside 0–100 by returning `undefined`.

Export the module through `package.json` as `"./number-format": "./src/number-format.ts"`. Client components must import runtime functions from this subpath; the root export remains available to server/worker code and for type-only imports.

- [ ] **Step 4: Verify pure tests GREEN**

Run: `pnpm --filter @naabsa/core test -- src/number-format.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing extraction and coercion tests**

Create an in-memory workbook whose numeric cells use `0`, `0.0`, `0.00`, `0.000` and a cached formula result. Assert literal `numberFormats` entries. Add a coercion regression proving a field with `decimals: 2` preserves `81.2345` rather than returning `81.23`.

- [ ] **Step 6: Run the extractor tests and verify RED**

Run: `pnpm --filter @naabsa/core test -- src/extractor/extract.test.ts src/extractor/coerce.test.ts`

Expected: FAIL because extraction returns no format map and coercion still rounds by spec precision.

- [ ] **Step 7: Implement extraction metadata and remove storage rounding**

Initialize `numberFormats = {}` in every `ExtractionResult` return path. For each numeric field, retain the `Cell` object, coerce its value, then call `inferExcelDisplayDecimals(cell.numFmt, result.value)` when the result is a number. Change `coerceNumber(raw, decimals)` to `coerceNumber(raw)` and remove `roundTo` if no remaining caller needs it.

- [ ] **Step 8: Run core tests and typecheck**

Run: `pnpm --filter @naabsa/core test`

Run: `pnpm --filter @naabsa/core typecheck`

Expected: all core tests and typecheck PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core
git commit -m "feat(core): preservar precisao numerica do Excel"
```

---

### Task 2: PostgreSQL persistence and revision integrity

**Files:**
- Create: `packages/db/migrations/0019_report_number_formats.sql`
- Modify: `packages/db/src/migrations.test.ts`
- Modify: `packages/db/src/editor-integrity.test.ts`

**Interfaces:**
- Produces columns: `reports.extracted_number_formats jsonb not null default '{}'::jsonb`.
- Produces columns: `reports.operator_number_formats jsonb not null default '{}'::jsonb`.
- Preserves: changing `operator_number_formats` increments `data_revision` and invalidates stale AI state exactly like `operator_overrides`.

- [ ] **Step 1: Write failing migration tests**

After applying all migrations, assert both columns default to `{}` and reject JSON arrays. Update a report by changing only `operator_number_formats` from `{}` to `{"summer_dwt":2}` and assert `data_revision` increments and `ai_review.status` becomes `stale` under the same conditions already tested for overrides.

- [ ] **Step 2: Run database tests and verify RED**

Run: `pnpm --filter @naabsa/db test -- src/migrations.test.ts src/editor-integrity.test.ts`

Expected: FAIL because migration `0019` and columns do not exist.

- [ ] **Step 3: Implement idempotent migration**

Add both columns with object constraints:

```sql
alter table public.reports
  add column if not exists extracted_number_formats jsonb not null default '{}'::jsonb,
  add column if not exists operator_number_formats jsonb not null default '{}'::jsonb;

alter table public.reports
  add constraint reports_extracted_number_formats_object
    check (jsonb_typeof(extracted_number_formats) = 'object'),
  add constraint reports_operator_number_formats_object
    check (jsonb_typeof(operator_number_formats) = 'object');
```

Use guarded `pg_constraint` checks so rerunning is safe. Replace the function introduced by `0013_ai_review_state.sql` so its change predicate also compares both precision maps.

- [ ] **Step 4: Verify database tests GREEN**

Run: `pnpm --filter @naabsa/db test`

Expected: all DB tests PASS, including migration idempotency.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): armazenar precisao decimal por relatorio"
```

---

### Task 3: Persist Excel precision during spreadsheet upload

**Files:**
- Modify: `apps/web/app/api/reports/[id]/spreadsheet/route.ts`
- Create: `apps/web/app/api/reports/[id]/spreadsheet/route.test.ts`

**Interfaces:**
- Consumes: `runExtraction(...).numberFormats` from Task 1.
- Consumes: `reports.extracted_number_formats` from Task 2.
- Produces: the upload update writes `extracted_data`, `extracted_number_formats` and issues together.

- [ ] **Step 1: Write a failing route test**

Create a route test with hoisted Vitest state and explicit mocks for `@/lib/supabase/server`, `@/lib/supabase/service`, audit, transition, queue, AI request and rate limiting. The Supabase query fake must return the report and frozen spec rows and capture the `reports.update(...)` payload; the storage fake must accept the uploaded buffer. Upload an in-memory `.xlsx` with `summer_dwt` formatted `0.00`, execute `POST`, and assert the captured update contains:

```ts
expect(update).toMatchObject({
  extracted_data: expect.objectContaining({ summer_dwt: 81 }),
  extracted_number_formats: expect.objectContaining({ summer_dwt: 2 }),
});
```

- [ ] **Step 2: Run the route test and verify RED**

Run: `pnpm --filter @naabsa/web test -- "app/api/reports/[id]/spreadsheet/route.test.ts"`

Expected: FAIL because the update omits `extracted_number_formats`.

- [ ] **Step 3: Persist the map and audit its field count**

Destructure `{ data, issues, numberFormats }` and include `extracted_number_formats: numberFormats` in the same report update. Add `formattedFields: Object.keys(numberFormats).length` to the extraction audit payload.

- [ ] **Step 4: Verify route and web tests GREEN**

Run: `pnpm --filter @naabsa/web test`

Expected: all web tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/reports/[id]/spreadsheet
git commit -m "feat(web): persistir precisao extraida da planilha"
```

---

### Task 4: Operator precision round-trip in review

**Files:**
- Modify: `apps/web/lib/localized-number.ts`
- Modify: `apps/web/lib/localized-number.test.ts`
- Modify: `apps/web/lib/effective-values.ts`
- Modify: `apps/web/lib/effective-values.test.ts`
- Modify: `apps/web/lib/actions/review.ts`
- Modify: `apps/web/lib/actions/review.test.ts`
- Modify: `apps/web/app/(app)/reports/[id]/review/page.tsx`
- Modify: `apps/web/components/review/FieldRow.tsx`
- Modify: `apps/web/components/review/ReviewClient.tsx`

**Interfaces:**
- Produces: `parseLocalizedNumberDraft(raw): { value: number | null; decimals?: number } | null`; `null` means invalid input, while blank input returns `{ value: null }`.
- Changes: `EffectiveField` gains `displayDecimals?: number`.
- Changes: `setOverride(reportId, field, value, decimals?)` accepts precision only for numeric fields.

- [ ] **Step 1: Write failing parser tests**

Assert literal results:

```ts
expect(parseLocalizedNumberDraft('81')).toEqual({ value: 81, decimals: 0 });
expect(parseLocalizedNumberDraft('81.0')).toEqual({ value: 81, decimals: 1 });
expect(parseLocalizedNumberDraft('81.00')).toEqual({ value: 81, decimals: 2 });
expect(parseLocalizedNumberDraft('1.234,500')).toEqual({ value: 1234.5, decimals: 3 });
expect(parseLocalizedNumberDraft('')).toEqual({ value: null });
expect(parseLocalizedNumberDraft('abc')).toBeNull();
```

- [ ] **Step 2: Run parser tests and verify RED**

Run: `pnpm --filter @naabsa/web test -- lib/localized-number.test.ts`

Expected: FAIL because `parseLocalizedNumberDraft` does not exist.

- [ ] **Step 3: Implement parser and keep compatibility wrapper**

Count the fraction length after identifying the last decimal separator and before converting with `Number`. Reject precision above 100. Keep `parseLocalizedNumber(raw)` as a wrapper returning `parseLocalizedNumberDraft(raw)?.value ?? null` for existing callers.

- [ ] **Step 4: Verify parser tests GREEN**

Run: `pnpm --filter @naabsa/web test -- lib/localized-number.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing effective-resolution and action tests**

Add cases for:

```ts
// operator wins
operator_overrides = { summer_dwt: 81 };
operator_number_formats = { summer_dwt: 1 };
extracted_number_formats = { summer_dwt: 2 };
expect(field.displayDecimals).toBe(1);

// clearing removes precision
await setOverride(reportId, 'summer_dwt', null, undefined);
expect(saved.operator_number_formats).not.toHaveProperty('summer_dwt');
```

Also assert the server rejects decimals for a string field, non-integers, negative values and values above 100.

- [ ] **Step 6: Run effective/action tests and verify RED**

Run: `pnpm --filter @naabsa/web test -- lib/effective-values.test.ts lib/actions/review.test.ts`

Expected: FAIL because maps are not loaded, resolved or persisted.

- [ ] **Step 7: Implement review data flow**

Select both maps in the page and action queries. Pass them into `groupBySectionOrdered`. Resolve `displayDecimals` with the Task 1 helper. In `LocalizedNumberInput.commit`, submit `parsed.value` and `parsed.decimals`; update local precision after a successful save so blur does not revert `81.00` to a spec default.

Update `operator_overrides` and `operator_number_formats` in one Supabase update guarded by status and `data_revision`. Delete a format key when the new numeric value is `null`. Include `beforeFormat` and `afterFormat` in audit payload.

Import runtime helpers used by `FieldRow.tsx`/`ReviewClient.tsx` only from `@naabsa/core/number-format`. Keep any root `@naabsa/core` references in client code as `import type` so the browser bundle cannot pull in AJV-generated validation code.

- [ ] **Step 8: Verify review tests, typecheck and client boundary**

Run: `pnpm --filter @naabsa/web test`

Run: `pnpm --filter @naabsa/web typecheck`

Run: `pnpm --filter @naabsa/web build`

Inspect `apps/web/.next/static/**/*.js` and confirm there is no `Error compiling schema`, `validateSpec`, or AJV-generated validator code.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "feat(review): preservar casas digitadas pelo operador"
```

---

### Task 5: Effective precision in AI review

**Files:**
- Modify: `apps/worker/src/jobs/aiReview.ts`
- Modify: `apps/worker/src/jobs/aiReview.test.ts`
- Modify: `apps/worker/src/jobs/aiReview.integration.test.ts`

**Interfaces:**
- Consumes: both precision maps and `resolveDisplayDecimals` from Task 1.
- Changes: `buildReviewPrompt(spec, variant, data, displayDecimals)` accepts `NumberFormatMap` containing already resolved precision.
- Changes: the `ai_review` JSON snapshot gains `numberFormats: NumberFormatMap` beside `data` and `dependencies`.
- Produces: numeric prompt items retain JSON `value` and use matching `decimals`/`display_value`.

- [ ] **Step 1: Write failing prompt tests**

Call the prompt builder with `{ summer_dwt: 2, net_tonnage: 1 }` and assert it contains `"display_value":"81.00"`, `"decimals":2`, and `"display_value":"12.0"`. Keep the existing assertions that calculated difference fields are absent.

- [ ] **Step 2: Run AI tests and verify RED**

Run: `pnpm --filter @naabsa/worker test -- src/jobs/aiReview.test.ts`

Expected: FAIL because the builder still hardcodes Draft Survey tonnage precision.

- [ ] **Step 3: Implement prompt precision resolution**

Select `extracted_number_formats` and `operator_number_formats` with report data. Resolve one `NumberFormatMap` for the effective fields, pass it to `buildReviewPrompt`, and use `formatNumberWithDecimals` rather than the current hardcoded `displayDecimalsForField` behavior. Persist that resolved map as `ai_review.numberFormats` in running, done and error snapshots, preserving it across delivery retries exactly like `ai_review.data` and `ai_review.dependencies`.

- [ ] **Step 4: Verify AI tests GREEN**

Run: `pnpm --filter @naabsa/worker test -- src/jobs/aiReview.test.ts src/jobs/aiReview.integration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/jobs/aiReview.ts apps/worker/src/jobs/aiReview.test.ts apps/worker/src/jobs/aiReview.integration.test.ts
git commit -m "feat(worker): respeitar precisao decimal na revisao IA"
```

---

### Task 6: Effective precision in DOCX and PDF inputs

**Files:**
- Modify: `apps/worker/src/jobs/generatePdf.ts`
- Modify: `apps/worker/src/jobs/generatePdf.test.ts`
- Modify: `apps/worker/src/jobs/buildWorkingDocx.test.ts`
- Modify: `apps/worker/src/lib/buildDocx.ts`
- Modify: `apps/worker/src/lib/buildDocxFromTemplate.ts`
- Modify: `apps/worker/src/lib/buildDocxFromTemplate.test.ts`
- Modify: `apps/worker/src/lib/buildDocxMsc.ts`
- Modify: `apps/worker/src/lib/buildDocxMsc.test.ts`
- Modify: `packages/core/src/document-builder/types.ts`
- Modify: `packages/core/src/document-builder/content/draft_survey.content.ts`
- Modify: `packages/core/src/document-builder/draft_survey.test.ts`
- Modify: `apps/web/lib/document-assembly.ts`
- Modify: `apps/web/components/editor/roundtrip.test.ts`

**Interfaces:**
- Changes: worker `ReportRow` includes both format maps.
- Changes: `DocxInput`, `DocxInputMsc` and core `BuilderInput` gain `numberFormats?: NumberFormatMap`.
- Produces: every spec-backed numeric placeholder uses the effective precision map with the existing hardcoded precision only as fallback.

- [ ] **Step 1: Write failing DOCX behavior tests**

Build Draft Survey documents with numeric value `81` and maps `{ summer_dwt: 0 }`, `{ summer_dwt: 1 }`, `{ summer_dwt: 2 }`, and `{ summer_dwt: 3 }`. Inspect the rendered `word/document.xml` and assert the mutually exclusive literals `81`, `81.0`, `81.00`, and `81.000`. Add one MSC numeric-field case and one legacy core-builder JSON case.

- [ ] **Step 2: Run document tests and verify RED**

Run: `pnpm --filter @naabsa/worker test -- src/lib/buildDocxFromTemplate.test.ts src/lib/buildDocxMsc.test.ts`

Run: `pnpm --filter @naabsa/core test -- src/document-builder/draft_survey.test.ts`

Expected: FAIL because builders still format with fixed decimal arguments.

- [ ] **Step 3: Propagate effective maps from report loading**

Select both maps in `loadReport`, cast them as `NumberFormatMap`, and compute the effective map using the frozen spec, extracted values and overrides. Pass it to every builder input. Update web `AssembleInput` and `assembleDocument` for the legacy TipTap path.

- [ ] **Step 4: Replace fixed formatting for spec-backed fields**

Use a null-safe helper with field names:

```ts
const numericField = (name: string, fallback?: number) => {
  const value = data[name];
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return formatNumberWithDecimals(
    value,
    input.numberFormats?.[name] ?? fallback,
  );
};
```

Apply it to all editable numeric fields. Keep semantic table calculations and non-field constants at their approved fixed precision. Remove the Draft Survey tonnage override that always forces three decimals.

- [ ] **Step 5: Verify document and job tests GREEN**

Run: `pnpm --filter @naabsa/worker test`

Run: `pnpm --filter @naabsa/core test`

Run: `pnpm --filter @naabsa/web test -- components/editor/roundtrip.test.ts`

Expected: all specified tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/worker packages/core/src/document-builder apps/web/lib/document-assembly.ts apps/web/components/editor/roundtrip.test.ts
git commit -m "feat(docx): aplicar precisao decimal efetiva"
```

---

### Task 7: Integrated regression, deployment contract and final verification

**Files:**
- Create: `tests/golden/decimal-precision-flow.test.ts`
- Modify: `docs/OPERACAO.md`

**Interfaces:**
- Consumes every interface from Tasks 1–6.
- Produces one regression proving Excel → stored maps → operator override → effective display → document output.

- [ ] **Step 1: Write the integrated failing regression**

Create an in-memory Draft Survey workbook from the frozen golden spec with three numeric cells formatted `0.0`, `0.00`, and `0.000`. Run extraction, construct the same report maps returned by PostgreSQL, apply an operator override parsed from `81.0000`, resolve effective data/precision, and build the DOCX. Assert numeric values remain numbers throughout and the final XML contains `81.0000`. Database trigger behavior remains covered by Task 2's real migration harness; this golden test covers serialization boundaries without duplicating that setup.

- [ ] **Step 2: Run the integrated regression and verify RED if any boundary is missing**

Run: `pnpm test:golden -- tests/golden/decimal-precision-flow.test.ts`

Expected: PASS only when every boundary carries the precision metadata; otherwise the failure identifies the missing layer.

- [ ] **Step 3: Add deployment and rollback instructions**

Document in `docs/OPERACAO.md`:

1. Apply migration `0019_report_number_formats.sql` before starting web/worker.
2. Deploy web and worker from the same commit.
3. Create a smoke report with `81.0`, `12.00`, `24.000`.
4. Change one value to four decimal places in review, reload, and confirm persistence.
5. Generate DOCX/PDF and compare the same representations.
6. For rollback, revert the application but retain both JSONB columns.

- [ ] **Step 4: Run complete verification**

Run: `pnpm lint`

Run: `pnpm typecheck`

Run: `pnpm test`

Run: `pnpm build`

Run: `git diff --check`

Expected: all commands PASS. If global lint reports only unrelated untracked `tmp/` scripts, run ESLint against every tracked changed TypeScript file and record the unrelated condition in the handoff; never stage those scripts.

- [ ] **Step 5: Review staged scope and commit**

Run: `git status --short` and confirm `scripts/diagnose-ai-report.ts`, `supabase/`, and `tmp/` are not staged.

```bash
git add tests/golden/decimal-precision-flow.test.ts docs/OPERACAO.md
git commit -m "test: validar precisao decimal ponta a ponta"
```

- [ ] **Step 6: Production smoke test after deploy**

Open a newly created report, confirm the three Excel precisions, edit one field to a different number of trailing zeros, reload the page, generate preview and PDF, and verify the representation stays identical at every stage.
