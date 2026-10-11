import { readFile } from 'node:fs/promises';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { embedMscFonts } from './embedMscFonts';

const templatePath = new URL(
  '../../../../templates/msc.clean.docx',
  import.meta.url,
);

describe('font repair of an existing edited MSC document', () => {
  it('preserves every content part, operator edits and unrelated font metadata', async () => {
    const template = await readFile(templatePath);
    const input = new PizZip(template);
    for (const name of Object.keys(input.files))
      if (name.startsWith('word/fonts/')) input.remove(name);
    input.remove('word/_rels/fontTable.xml.rels');
    input.file(
      'word/fontTable.xml',
      input
        .file('word/fontTable.xml')!
        .asText()
        .replace(/<w:embed(?:Regular|Bold|Italic|BoldItalic)\b[^>]*\/>/g, '')
        .replace(
          '</w:fonts>',
          '<w:font w:name="OperatorFont"><w:family w:val="swiss"/></w:font></w:fonts>',
        ),
    );
    input.file(
      'word/document.xml',
      input
        .file('word/document.xml')!
        .asText()
        .replace(
          '</w:body>',
          '<w:p><w:r><w:t>Texto revisado pelo operador</w:t></w:r></w:p></w:body>',
        ),
    );
    input.file(
      'word/header1.xml',
      input
        .file('word/header1.xml')!
        .asText()
        .replace('CONSULTANTS', 'CUSTOM HEADER'),
    );
    const before = input.generate({ type: 'nodebuffer' });
    const repaired = embedMscFonts(before, template);
    expect(repaired.changed).toBe(true);
    const after = new PizZip(repaired.docx);
    const allowed = new Set([
      'word/fontTable.xml',
      'word/_rels/fontTable.xml.rels',
      '[Content_Types].xml',
      'word/settings.xml',
    ]);
    for (const [name, file] of Object.entries(input.files)) {
      if (!file.dir && !allowed.has(name))
        expect(
          after.file(name)!.asNodeBuffer().equals(file.asNodeBuffer()),
          name,
        ).toBe(true);
    }
    expect(after.file('word/fontTable.xml')!.asText()).toContain(
      '<w:font w:name="OperatorFont"><w:family w:val="swiss"/></w:font>',
    );
    expect(after.file('word/document.xml')!.asText()).toContain(
      'Texto revisado pelo operador',
    );
    const repeated = embedMscFonts(repaired.docx, template);
    expect(repeated.changed).toBe(false);
    expect(repeated.docx).toBe(repaired.docx);
  });

  it('returns the original bytes for an already embedded document', async () => {
    const template = await readFile(templatePath);
    const repaired = embedMscFonts(template, template);
    expect(repaired.changed).toBe(false);
    expect(repaired.docx).toBe(template);
  });

  it('fails before changing a document when a declared source face is missing', async () => {
    const template = await readFile(templatePath);
    const broken = new PizZip(template);
    const target = broken
      .file('word/_rels/fontTable.xml.rels')!
      .asText()
      .match(/Target="([^"]+)"/)![1]!;
    broken.remove(`word/${target}`);
    expect(() =>
      embedMscFonts(template, broken.generate({ type: 'nodebuffer' })),
    ).toThrow(/font payload/i);
  });
});
