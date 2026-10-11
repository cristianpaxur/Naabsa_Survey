import PizZip from 'pizzip';

const relationshipNamespace =
  'http://schemas.openxmlformats.org/package/2006/relationships';
const officeNamespace =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const fontRelationship = `${officeNamespace}/font`;
const fontType = 'application/vnd.openxmlformats-officedocument.obfuscatedFont';
const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const attribute = (xml: string, name: string) =>
  xml.match(new RegExp(`\\b${escapeRegex(name)}="([^"]+)"`))?.[1];

/** Adds document fonts to an existing package without rebuilding its contents. */
export function embedMscFonts(
  docx: Buffer,
  fontSource: Buffer,
): { docx: Buffer; changed: boolean } {
  const source = new PizZip(fontSource);
  const target = new PizZip(docx);
  const sourceTable = source.file('word/fontTable.xml')?.asText() ?? '';
  const sourceRels =
    source.file('word/_rels/fontTable.xml.rels')?.asText() ?? '';
  const entries = [
    ...sourceTable.matchAll(/<w:font\b[^>]*>[\s\S]*?<\/w:font>/g),
  ]
    .map(([entry]) => entry)
    .filter((entry) =>
      /<w:embed(?:Regular|Bold|Italic|BoldItalic)\b/.test(entry),
    );
  if (!entries.length) throw new Error('MSC source has no embedded fonts.');
  const links = [...sourceRels.matchAll(/<Relationship\b[^>]*\/>/g)]
    .map(([xml]) => ({
      id: attribute(xml, 'Id')!,
      target: attribute(xml, 'Target')!,
      type: attribute(xml, 'Type'),
    }))
    .filter((link) => link.type === fontRelationship);
  for (const link of links) {
    if (
      !link.target?.startsWith('fonts/msc-') ||
      link.target.includes('..') ||
      !link.target.endsWith('.odttf')
    )
      throw new Error('Unexpected MSC font payload path.');
    if ((source.file(`word/${link.target}`)?.asNodeBuffer().length ?? 0) < 32)
      throw new Error(`Missing MSC font payload: ${link.target}`);
  }
  for (const entry of entries)
    for (const [, id] of entry.matchAll(/<w:embed\w+\b[^>]*r:id="([^"]+)"/g))
      if (!links.some((link) => link.id === id))
        throw new Error('Missing MSC font payload relationship.');

  let table = target.file('word/fontTable.xml')?.asText();
  if (!table) throw new Error('Existing document has no font table.');
  let relationships =
    target.file('word/_rels/fontTable.xml.rels')?.asText() ??
    `<Relationships xmlns="${relationshipNamespace}"></Relationships>`;
  const currentLinks = new Map(
    [...relationships.matchAll(/<Relationship\b[^>]*\/>/g)].map(([xml]) => [
      attribute(xml, 'Id'),
      attribute(xml, 'Target'),
    ]),
  );
  const sourceLinks = new Map(links.map((link) => [link.id, link.target]));
  const normalizeEntry = (
    entry: string,
    targets: Map<string | undefined, string | undefined>,
  ) =>
    entry.replace(
      /r:id="([^"]+)"/g,
      (_, id: string) => `r:id="${targets.get(id)}"`,
    );
  const sameEntries = entries.every((entry) => {
    const name = attribute(entry, 'w:name')!;
    const existing = table!.match(
      new RegExp(
        `<w:font\\b[^>]*w:name="${escapeRegex(name)}"[^>]*>[\\s\\S]*?<\\/w:font>`,
      ),
    )?.[0];
    return (
      existing &&
      normalizeEntry(existing, currentLinks) ===
        normalizeEntry(entry, sourceLinks)
    );
  });
  const samePayloads = links.every(
    (link) =>
      !!target
        .file(`word/${link.target}`)
        ?.asNodeBuffer()
        .equals(source.file(`word/${link.target}`)!.asNodeBuffer()),
  );
  if (samePayloads && sameEntries) return { docx, changed: false };

  const occupied = new Set(
    [...relationships.matchAll(/\bId="([^"]+)"/g)].map((match) => match[1]),
  );
  const ids = new Map<string, string>();
  for (const link of links) {
    const payload = source.file(`word/${link.target}`)!.asNodeBuffer();
    const existing = target.file(`word/${link.target}`)?.asNodeBuffer();
    if (existing && !existing.equals(payload))
      throw new Error('MSC font payload conflicts with an existing part.');
    let number = ids.size + 1;
    while (occupied.has(`mscEmbedded${number}`)) number++;
    const id = `mscEmbedded${number}`;
    occupied.add(id);
    ids.set(link.id, id);
    relationships = relationships.replace(
      '</Relationships>',
      `<Relationship Id="${id}" Type="${fontRelationship}" Target="${link.target}"/></Relationships>`,
    );
    target.file(`word/${link.target}`, payload);
  }
  for (let entry of entries) {
    const name = attribute(entry, 'w:name');
    if (!name) throw new Error('MSC source has an unnamed embedded family.');
    entry = entry.replace(
      /r:id="([^"]+)"/g,
      (_, id: string) => `r:id="${ids.get(id)}"`,
    );
    const pattern = new RegExp(
      `<w:font\\b[^>]*w:name="${escapeRegex(name)}"[^>]*>[\\s\\S]*?<\\/w:font>`,
    );
    table = pattern.test(table)
      ? table.replace(pattern, entry)
      : table.replace('</w:fonts>', `${entry}</w:fonts>`);
  }
  if (!table.includes('xmlns:r='))
    table = table.replace('<w:fonts', `<w:fonts xmlns:r="${officeNamespace}"`);
  target.file('word/fontTable.xml', table);
  target.file('word/_rels/fontTable.xml.rels', relationships);
  let types = target.file('[Content_Types].xml')!.asText();
  const existingType = [...types.matchAll(/<Default\b[^>]*\/>/g)].find(
    ([xml]) => attribute(xml, 'Extension') === 'odttf',
  )?.[0];
  if (existingType && attribute(existingType, 'ContentType') !== fontType)
    throw new Error('Conflicting embedded font content type.');
  if (!existingType)
    types = types.replace(
      '</Types>',
      `<Default Extension="odttf" ContentType="${fontType}"/></Types>`,
    );
  target.file('[Content_Types].xml', types);
  let settings = target.file('word/settings.xml')!.asText();
  for (const [name, value] of [
    ['embedTrueTypeFonts', '1'],
    ['doNotEmbedSystemFonts', '0'],
    ['saveSubsetFonts', '0'],
  ]) {
    settings = settings.replace(new RegExp(`<w:${name}\\b[^>]*\\/>`, 'g'), '');
    settings = settings.replace(
      '</w:settings>',
      `<w:${name} w:val="${value}"/>`,
    );
  }
  target.file('word/settings.xml', settings);
  return {
    docx: target.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
    changed: true,
  };
}
