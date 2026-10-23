# DOCX templates

## BQS

`bqs.clean.docx` is reconstructed from the client PDF because no Word source
was available. The user explicitly authorized this route. It contains native
Word tables, manual content controls, photo areas and a measured table of
contents. See [bqs.artifact.md](bqs.artifact.md) for the complete contract,
synthetic fixture, reproduction commands and destination acceptance limits.

Rebuild with Python: `scripts/build_bqs_template.py`. Recreate the public test
workbook using `node scripts/build_bqs_synthetic_fixture.mjs`. Malformed times
require explicit overrides, never silent edits to the XLSX.

`msc.clean.docx` is derived from the approved MSC Word reference, with its
styles, native numbering, table geometry, headers, footer and photograph
prototypes retained. `msc.artifact.md` is the tracked execution contract,
slot map, source-example inventory and package-preservation evidence. Its
examples are QA data and must never become fallback values in real reports.

## Reproduce the MSC template

Keep the original reference unchanged. The default source path is
`C:/Users/CristianPaxur/Downloads/MSC Report - revisado.docx`. A copy at another
location can be supplied with `--source`, but must have the same SHA-256:

```text
837c43da11ec830b2d11d26c5a2c2b533c8a7d7a05fc2e5b264a9a933fe7fcd0
```

Use the Python runtime returned by Codex's `load_workspace_dependencies`
tool. The builder requires `lxml` in that runtime and uses the standard
library for ZIP packages, hashing and JSON. The following verified runtime
path is specific to the current Windows host; adjust it for another host.
Run these commands from the repository root in PowerShell:

```powershell
$mscPython = 'C:\Users\CristianPaxur\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $mscPython 'scripts\build_msc_template.py'
```

To use the same approved reference from another location:

```powershell
& $mscPython 'scripts\build_msc_template.py' --source 'C:\path\MSC Report - revisado.docx'
```

The script verifies the source hash and structural checkpoints, edits copied
OOXML text in place, writes `templates/msc.clean.docx`, and refreshes the
generated evidence in `templates/msc.artifact.md`. It requires the tracked
artifact contract to exist. It does not read an ignored temporary manifest.
Only `word/document.xml` and three documented nonvisual template-metadata
parts may change; the other 62 package members are verified byte-identical.
The retained source is checked again after the build.

The current reproducible template SHA-256 is:

```text
953bb17bd63576a9c1127dfa7bd2b166b83da148b29d202c798152bb57836056
```

The builder is idempotent for this reference. If the source changes, review
and update the source contract and slot map before changing the hash guard.

## Optional visual QA

Create separate temporary copies to compare the sanitized reference with a
template filled using source examples:

```powershell
& $mscPython 'scripts\build_msc_template.py' `
  --sanitized-output 'tmp\msc-template-qa\source-sanitized.docx' `
  --example-output 'tmp\msc-template-qa\source-filled-template.docx'
```

These copies are for validation only. The latest recorded Word comparison
passed all nine pages with exact pixels at 144 DPI. The report builder must
fill the documented slots with effective report data and replace or remove
the photograph prototypes before producing a real report.
