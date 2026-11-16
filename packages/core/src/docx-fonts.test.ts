import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { preserveBqsFonts } from './docx-fonts';

const template = readFileSync(
  fileURLToPath(
    new URL('../../../templates/bqs.v2.clean.docx', import.meta.url),
  ),
);
const fontParts = (name: string) =>
  name.startsWith('word/fonts/') ||
  name === 'word/fontTable.xml' ||
  name === 'word/_rels/fontTable.xml.rels' ||
  name === 'word/settings.xml' ||
  name === '[Content_Types].xml';

function nativeSave() {
  const zip = new PizZip(template);
  for (const name of Object.keys(zip.files))
    if (name.startsWith('word/fonts/')) zip.remove(name);
  zip.remove('word/_rels/fontTable.xml.rels');
  zip.file(
    'word/fontTable.xml',
    zip
      .file('word/fontTable.xml')!
      .asText()
      .replace(/<w:embed\w+\b[^>]*\/>/g, ''),
  );
  zip.file(
    'word/document.xml',
    zip
      .file('word/document.xml')!
      .asText()
      .replace('Surveyor’s final remarks:', 'MANUAL EDIT PRESERVED:'),
  );
  return zip.generate({ type: 'nodebuffer' });
}

describe('BQS preserves embedded fonts after native save', () => {
  it('restores font payloads without changing any saved content or layout part', () => {
    const saved = nativeSave();
    const before = new PizZip(saved);
    const original = new PizZip(template);
    const result = preserveBqsFonts(saved, template);
    const after = new PizZip(result);
    expect(after.file('word/fontTable.xml')!.asText()).toContain(
      'w:embedRegular',
    );
    expect(after.file('word/document.xml')!.asText()).toContain(
      'MANUAL EDIT PRESERVED',
    );
    for (const name of Object.keys(before.files))
      if (!fontParts(name))
        expect(after.file(name)?.asNodeBuffer()).toEqual(
          before.file(name)?.asNodeBuffer(),
        );
    for (const name of Object.keys(original.files))
      if (name.startsWith('word/fonts/'))
        expect(
          after
            .file(name)
            ?.asNodeBuffer()
            .equals(original.file(name)!.asNodeBuffer()),
        ).toBe(true);
    expect(preserveBqsFonts(result, result)).toBe(result);
  });
  it('leaves earlier BQS documents without embedded fonts unchanged', () => {
    const saved = nativeSave();
    expect(preserveBqsFonts(saved, saved)).toBe(saved);
  });
  it('does not alter other report types', () => {
    const previous = new PizZip(template);
    previous.file(
      'word/document.xml',
      previous
        .file('word/document.xml')!
        .asText()
        .replaceAll('bqs_photos_', 'another_report_'),
    );
    const saved = nativeSave();
    expect(
      preserveBqsFonts(saved, previous.generate({ type: 'nodebuffer' })),
    ).toBe(saved);
  });
});
