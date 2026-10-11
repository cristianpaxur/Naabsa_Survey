/** Embed permitted original faces in a DOCX; never install/redistribute loose fonts. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const require = createRequire(
  new URL('../apps/worker/package.json', import.meta.url),
);
const PizZip = require('pizzip');
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (
  !args.includes('--input') ||
  !args.includes('--output') ||
  !args.includes('--fonts')
)
  throw new Error(
    'Required: --input source.docx --output result.docx --fonts font-directory',
  );
const input = resolve(option('--input'));
const output = resolve(option('--output'));
const directory = resolve(option('--fonts'));
if (input === output)
  throw new Error('Preserve the input; choose a separate output.');
const manifest = [
  // Word's measured fallback for the missing source header font. Its alternative
  // is explicit in the font table; the source header XML remains unchanged.
  [
    'GeoSlab703 Md BT',
    ['calibri.ttf', 'calibrib.ttf', 'calibrii.ttf', 'calibriz.ttf'],
  ],
  ['Calibri', ['calibri.ttf', 'calibrib.ttf', 'calibrii.ttf', 'calibriz.ttf']],
  ['Calibri Light', ['calibril.ttf', null, 'calibrili.ttf']],
  ['Tahoma', ['tahoma.ttf', 'tahomabd.ttf']],
  ['Arial', ['arial.ttf', 'arialbd.ttf', 'ariali.ttf', 'arialbi.ttf']],
  [
    'Times New Roman',
    ['times.ttf', 'timesbd.ttf', 'timesi.ttf', 'timesbi.ttf'],
  ],
  ['Cambria', ['cambria.ttc', 'cambriab.ttf', 'cambriai.ttf', 'cambriaz.ttf']],
  ['Symbol', ['symbol.ttf']],
];
const roles = ['Regular', 'Bold', 'Italic', 'BoldItalic'];
const z = new PizZip(readFileSync(input));
let table = z.file('word/fontTable.xml')?.asText();
if (!table || /<w:embed(?:Regular|Bold|Italic|BoldItalic)\b/.test(table))
  throw new Error('Expected a font table without existing embedded faces.');
if (z.file('word/_rels/fontTable.xml.rels'))
  throw new Error(
    'Existing font relationships require explicit reconciliation.',
  );
const rel =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font';
const relationships = [];
const receipt = [];
for (const [family, files] of manifest) {
  const entryPattern = new RegExp(
    `<w:font w:name="${family}">[\\s\\S]*?<\\/w:font>`,
  );
  let entry = table.match(entryPattern)?.[0];
  if (!entry) throw new Error(`Missing original font entry: ${family}`);
  if (family === 'GeoSlab703 Md BT') {
    if (!entry.includes('<w:altName w:val="Sitka Small"/>'))
      throw new Error('Unexpected source header alternative.');
    entry = entry.replace(
      '<w:altName w:val="Sitka Small"/>',
      '<w:altName w:val="Calibri"/>',
    );
  }
  let embeds = '';
  for (let face = 0; face < files.length; face++) {
    const file = files[face];
    if (!file) continue;
    const original = readFileSync(join(directory, file));
    const sfnt =
      original.toString('ascii', 0, 4) === 'ttcf'
        ? original.readUInt32BE(12)
        : 0;
    let os2;
    for (let i = 0; i < original.readUInt16BE(sfnt + 4); i++) {
      const at = sfnt + 12 + 16 * i;
      if (original.toString('ascii', at, at + 4) === 'OS/2')
        os2 = original.readUInt32BE(at + 8);
    }
    if (os2 == null || original.readUInt16BE(os2 + 8) !== 8)
      throw new Error(`Editable document embedding is not permitted: ${file}`);
    const sha = createHash('sha256').update(original).digest('hex');
    const hex = sha.slice(0, 32).toUpperCase();
    const fontKey = `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
    const key = Buffer.from(hex, 'hex').reverse();
    const embedded = Buffer.from(original);
    for (let i = 0; i < 32; i++) embedded[i] ^= key[i % 16];
    const id = `mscFont${receipt.length + 1}`;
    const target = `fonts/msc-${sha.slice(0, 20)}.odttf`;
    z.file(`word/${target}`, embedded);
    relationships.push(
      `<Relationship Id="${id}" Type="${rel}" Target="${target}"/>`,
    );
    embeds += `<w:embed${roles[face]} r:id="${id}" w:fontKey="${fontKey}" w:subsetted="0"/>`;
    receipt.push({
      family,
      role: roles[face],
      sha256: sha,
      fsType: 8,
      bytes: original.length,
    });
  }
  table = table.replace(
    entryPattern,
    entry.replace('</w:font>', `${embeds}</w:font>`),
  );
}
z.file('word/fontTable.xml', table);
z.file(
  'word/_rels/fontTable.xml.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`,
);
const types = z.file('[Content_Types].xml').asText();
if (/Extension="odttf"/.test(types))
  throw new Error('Unexpected existing font content type.');
z.file(
  '[Content_Types].xml',
  types.replace(
    '</Types>',
    '<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/></Types>',
  ),
);
let settings = z.file('word/settings.xml').asText();
for (const [name, value] of [
  ['embedTrueTypeFonts', '1'],
  ['doNotEmbedSystemFonts', '0'],
  ['saveSubsetFonts', '0'],
]) {
  const pattern = new RegExp(`<w:${name}\\b[^>]*\\/>`, 'g');
  settings = settings.replace(pattern, '');
  settings = settings.replace(
    '</w:settings>',
    `<w:${name} w:val="${value}"/></w:settings>`,
  );
}
z.file('word/settings.xml', settings);
const result = z.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
writeFileSync(output, result);
console.log(
  JSON.stringify(
    {
      output,
      bytes: result.length,
      sha256: createHash('sha256').update(result).digest('hex'),
      faces: receipt,
    },
    null,
    2,
  ),
);
