import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import sharp from 'sharp';
import { runExtraction, type ReportSpec } from '@naabsa/core';
import {
  buildReportDocxBqs,
  readBqsTimeLog,
  type DocxInputBqs,
} from './buildDocxBqs';
import {
  replaceBqsPhotoSections,
  bqsPagesFromPdfText,
  updateBqsTocPages,
  assertBqsPdfPagination,
} from './bqsDocument';
let input: DocxInputBqs;
interface TestNode {
  nodeName: string;
  parentNode: TestNode | null;
  childNodes: ArrayLike<TestNode>;
  getAttribute(name: string): string | null;
  getElementsByTagName(name: string): ArrayLike<TestNode>;
  appendChild(node: TestNode): TestNode;
  insertBefore(node: TestNode, before: TestNode | null): TestNode;
  removeChild(node: TestNode): TestNode;
  cloneNode(deep: boolean): TestNode;
  setAttribute(name: string, value: string): void;
}
const xmlTools = (
  Docxtemplater as unknown as {
    DocUtils: {
      str2xml(xml: string): TestNode;
      xml2str(node: TestNode): string;
    };
  }
).DocUtils;
const nodes = (node: TestNode, tag: string) =>
  Array.from(node.getElementsByTagName(tag));
const photoSlots = [
  'cover',
  'sounding_tables',
  'vessel_tanks',
  'barge_tanks',
  'sampling',
];
function flattenPhotoControls(zip: PizZip): void {
  const doc = xmlTools.str2xml(zip.file('word/document.xml')!.asText());
  for (const sdt of nodes(doc, 'w:sdt')) {
    if (
      !nodes(sdt, 'w:tag').some((tag) =>
        tag.getAttribute('w:val')?.startsWith('bqs_photos_'),
      )
    )
      continue;
    const content = nodes(sdt, 'w:sdtContent')[0]!;
    for (const block of Array.from(content.childNodes))
      sdt.parentNode!.insertBefore(block, sdt);
    sdt.parentNode!.removeChild(sdt);
  }
  zip.file('word/document.xml', xmlTools.xml2str(doc));
}
beforeAll(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    readFileSync(
      new URL(
        '../../../../tests/fixtures/planilhas/bqs/synthetic.xlsx',
        import.meta.url,
      ),
    ) as never,
  );
  const spec = JSON.parse(
    readFileSync(
      new URL('../../../../tests/fixtures/specs/bqs.v1.json', import.meta.url),
      'utf8',
    ),
  ) as ReportSpec;
  const ex = runExtraction(wb, spec),
    data = { ...ex.data, vessel_close_start: '19:10' };
  input = {
    data,
    tables: ex.tables,
    photos: {},
    timeLogRows: readBqsTimeLog(wb, data),
  };
});
describe('BQS — atualização preserva edição e exige paginação verificável', () => {
  it('gera cinco ranges nativos com IDs únicos em áreas vazias e preenchidas', async () => {
    const photo = await sharp({
      create: { width: 30, height: 50, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    for (const photos of [
      {},
      {
        cover: [photo],
        sounding_tables: [photo, photo, photo],
        sampling: [photo],
      },
    ]) {
      const zip = new PizZip(await buildReportDocxBqs({ ...input, photos }));
      const doc = xmlTools.str2xml(zip.file('word/document.xml')!.asText());
      const starts = nodes(doc, 'w:bookmarkStart');
      for (const slot of photoSlots) {
        const markers = starts.filter(
          (mark) => mark.getAttribute('w:name') === `bqs_photos_${slot}`,
        );
        expect(markers, slot).toHaveLength(1);
        expect(markers[0]!.parentNode!.nodeName).toBe('w:p');
        expect(
          nodes(doc, 'w:bookmarkEnd').filter(
            (mark) =>
              mark.getAttribute('w:id') === markers[0]!.getAttribute('w:id'),
          ),
        ).toHaveLength(1);
      }
      expect(
        new Set(starts.map((mark) => mark.getAttribute('w:id'))).size,
      ).toBe(starts.length);
    }
  });
  it('substitui ranges após Collabora remover controles e preserva edição nativa, sumário e cabeçalho', async () => {
    const photo = await sharp({
      create: { width: 30, height: 50, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    const old = new PizZip(
      await buildReportDocxBqs({
        ...input,
        photos: { cover: [photo], sounding_tables: [photo, photo, photo] },
      }),
    );
    old.file(
      'word/document.xml',
      old
        .file('word/document.xml')!
        .asText()
        .replace(
          'Appointing party / operational background:',
          'NATIVE_EDIT_4931:',
        ),
    );
    flattenPhotoControls(old);
    const before = xmlTools.str2xml(old.file('word/document.xml')!.asText());
    const sections = nodes(before, 'w:bookmarkStart')
      .filter((mark) => /^bqs_s\d/.test(mark.getAttribute('w:name') ?? ''))
      .map((mark) => xmlTools.xml2str(mark));
    const toc = nodes(before, 'w:hyperlink').map((link) =>
      xmlTools.xml2str(link),
    );
    const refreshed = new PizZip(
      replaceBqsPhotoSections(
        old.generate({ type: 'nodebuffer' }),
        await buildReportDocxBqs({ ...input, photos: { sampling: [photo] } }),
      ),
    );
    const result = refreshed.file('word/document.xml')!.asText();
    expect(result).toContain('NATIVE_EDIT_4931');
    expect(result).toContain('bqs_manual_imo');
    expect(result.match(/<w:drawing>/g)).toHaveLength(1);
    for (const marker of [...sections, ...toc])
      expect(result).toContain(marker.replace(/ xmlns:w="[^"]+"/g, ''));
    for (const part of Object.keys(old.files).filter((part) =>
      /^word\/(header|styles)/.test(part),
    ))
      expect(refreshed.file(part)!.asUint8Array()).toEqual(
        old.file(part)!.asUint8Array(),
      );
    for (const part of Object.keys(old.files).filter((part) =>
      part.includes('image_generated_'),
    ))
      expect(refreshed.file(part)).toBeNull();
  });
  it('preserva texto fora dos bookmarks no mesmo parágrafo e controles vazios inline do editor', async () => {
    const photo = await sharp({
      create: { width: 30, height: 50, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    const old = new PizZip(
      await buildReportDocxBqs({ ...input, photos: { cover: [photo] } }),
    );
    flattenPhotoControls(old);
    const doc = xmlTools.str2xml(old.file('word/document.xml')!.asText());
    const cover = nodes(doc, 'w:bookmarkStart').find(
      (mark) => mark.getAttribute('w:name') === 'bqs_photos_cover',
    )!;
    const end = nodes(doc, 'w:bookmarkEnd').find(
      (mark) => mark.getAttribute('w:id') === cover.getAttribute('w:id'),
    )!;
    const paragraph = cover.parentNode!;
    const fragment = xmlTools.str2xml(
      '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:pPr><w:jc w:val="right"/><w:spacing w:before="137"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>BEFORE_NATIVE_PHOTO</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>AFTER_NATIVE_PHOTO</w:t></w:r></w:p>',
    );
    for (const prop of nodes(paragraph, 'w:pPr')) paragraph.removeChild(prop);
    paragraph.insertBefore(
      nodes(fragment, 'w:pPr')[0]!,
      Array.from(paragraph.childNodes)[0]!,
    );
    paragraph.insertBefore(nodes(fragment, 'w:r')[0]!, cover);
    paragraph.appendChild(nodes(fragment, 'w:r')[0]!);
    // Native editors keep an empty gallery as an inline SDT within a paragraph.
    for (const start of nodes(doc, 'w:bookmarkStart').filter((mark) =>
      /bqs_photos_(?:vessel_tanks|barge_tanks)/.test(
        mark.getAttribute('w:name') ?? '',
      ),
    )) {
      const galleryEnd = nodes(doc, 'w:bookmarkEnd').find(
        (mark) => mark.getAttribute('w:id') === start.getAttribute('w:id'),
      )!;
      const wrapper = xmlTools.str2xml(
        `<w:sdt xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:sdtPr><w:tag w:val="${start.getAttribute('w:name')}"/></w:sdtPr><w:sdtContent/></w:sdt>`,
      );
      const sdt = nodes(wrapper, 'w:sdt')[0]!;
      const content = nodes(wrapper, 'w:sdtContent')[0]!;
      const siblings = Array.from(start.parentNode!.childNodes);
      for (const child of siblings.slice(
        siblings.indexOf(start) + 1,
        siblings.indexOf(galleryEnd),
      ))
        content.appendChild(child);
      start.parentNode!.insertBefore(sdt, galleryEnd);
    }
    // A pre-existing native bookmark must retain its ID while imported IDs change.
    const section = nodes(doc, 'w:bookmarkStart').find(
      (mark) => mark.getAttribute('w:name') === 'bqs_s1',
    )!;
    const sectionId = section.getAttribute('w:id');
    section.setAttribute('w:id', '9000');
    for (const mark of nodes(doc, 'w:bookmarkEnd').filter(
      (mark) => mark.getAttribute('w:id') === sectionId,
    ))
      mark.setAttribute('w:id', '9000');
    old.file('word/document.xml', xmlTools.xml2str(doc));
    const refreshed = new PizZip(
      replaceBqsPhotoSections(
        old.generate({ type: 'nodebuffer' }),
        await buildReportDocxBqs({
          ...input,
          photos: { cover: [photo], vessel_tanks: [photo] },
        }),
      ),
    );
    const result = refreshed.file('word/document.xml')!.asText();
    expect(result).toContain('BEFORE_NATIVE_PHOTO');
    expect(result).toContain('AFTER_NATIVE_PHOTO');
    expect(result).toContain(
      '<w:jc w:val="right"/><w:spacing w:before="137"/>',
    );
    const parsed = xmlTools.str2xml(result);
    const ids = nodes(parsed, 'w:bookmarkStart').map((mark) =>
      mark.getAttribute('w:id'),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      nodes(parsed, 'w:bookmarkStart')
        .find((mark) => mark.getAttribute('w:name') === 'bqs_s1')!
        .getAttribute('w:id'),
    ).toBe('9000');
    expect(
      nodes(parsed, 'w:bookmarkEnd').filter(
        (mark) => mark.getAttribute('w:id') === end.getAttribute('w:id'),
      ),
    ).toHaveLength(0);
  });
  it('recusa marcadores ausentes, duplicados, invertidos ou cruzando seções e campos manuais', async () => {
    const original = await buildReportDocxBqs(input);
    const corruptions = [
      'missingStart',
      'missingEnd',
      'duplicateStart',
      'duplicateEnd',
      'reversed',
      'section',
      'manual',
      'overlap',
    ];
    for (const corruption of corruptions) {
      const zip = new PizZip(original);
      flattenPhotoControls(zip);
      const doc = xmlTools.str2xml(zip.file('word/document.xml')!.asText());
      const start = nodes(doc, 'w:bookmarkStart').find(
        (mark) => mark.getAttribute('w:name') === 'bqs_photos_cover',
      )!;
      const end = nodes(doc, 'w:bookmarkEnd').find(
        (mark) => mark.getAttribute('w:id') === start.getAttribute('w:id'),
      )!;
      if (corruption === 'missingStart') start.parentNode!.removeChild(start);
      if (corruption === 'missingEnd') end.parentNode!.removeChild(end);
      if (corruption === 'duplicateStart')
        start.parentNode!.appendChild(start.cloneNode(true));
      if (corruption === 'duplicateEnd')
        end.parentNode!.appendChild(end.cloneNode(true));
      if (corruption === 'reversed') start.parentNode!.insertBefore(end, start);
      if (corruption === 'section')
        nodes(doc, 'w:bookmarkStart')
          .find((mark) => mark.getAttribute('w:name') === 'bqs_s1')!
          .parentNode!.appendChild(end);
      if (corruption === 'manual') {
        const manual = nodes(doc, 'w:sdt').find((sdt) =>
          nodes(sdt, 'w:tag').some(
            (tag) => tag.getAttribute('w:val') === 'bqs_manual_imo',
          ),
        )!;
        start.parentNode!.insertBefore(manual, end);
      }
      if (corruption === 'overlap')
        nodes(doc, 'w:bookmarkStart')
          .find(
            (mark) =>
              mark.getAttribute('w:name') === 'bqs_photos_sounding_tables',
          )!
          .parentNode!.appendChild(end);
      zip.file('word/document.xml', xmlTools.xml2str(doc));
      const corrupted = zip.generate({ type: 'nodebuffer' });
      expect(
        () => replaceBqsPhotoSections(corrupted, original),
        corruption,
      ).toThrow(/cover/);
      expect(new PizZip(corrupted).file('word/document.xml')!.asText()).toBe(
        xmlTools.xml2str(doc),
      );
    }
  });
  it('barra PDF final com sumário desatualizado após edição sem alterar o Word aprovado', () => {
    const zip = new PizZip();
    zip.file(
      'word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:hyperlink w:anchor="bqs_s1"><w:r><w:t>1. Background</w:t></w:r><w:r><w:t>3</w:t></w:r></w:hyperlink></w:p><w:p><w:bookmarkStart w:id="1" w:name="bqs_s1"/><w:r><w:t>1. Background</w:t></w:r></w:p></w:body></w:document>',
    );
    const docx = zip.generate({ type: 'nodebuffer' });
    const before = Buffer.from(docx);
    expect(() =>
      assertBqsPdfPagination(
        docx,
        'Cover\fContents\n1. Background ........ 3\f1. Background\nText',
      ),
    ).not.toThrow();
    expect(() =>
      assertBqsPdfPagination(
        docx,
        'Cover\fContents\n1. Background ........ 3\fExtra page\f1. Background\nText',
      ),
    ).toThrow(/sumário/);
    zip.file(
      'word/document.xml',
      zip
        .file('word/document.xml')!
        .asText()
        .replace('<w:hyperlink w:anchor="bqs_s1">', '')
        .replace('</w:hyperlink>', ''),
    );
    expect(() =>
      assertBqsPdfPagination(
        zip.generate({ type: 'nodebuffer' }),
        'Cover\fContents\n1. Background ........ 3\fExtra page\f1. Background\nText',
      ),
    ).toThrow(/sumário/);
    expect(docx).toEqual(before);
  });
  it('substitui só áreas de foto, preservando texto editado e controles manuais', async () => {
    const old = await buildReportDocxBqs(input),
      edited = new PizZip(old);
    edited.file(
      'word/document.xml',
      edited
        .file('word/document.xml')!
        .asText()
        .replace(
          'Appointing party / operational background:',
          'OPERATOR_EDIT_4931:',
        ),
    );
    const photo = await sharp({
      create: { width: 70, height: 40, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    const fresh = await buildReportDocxBqs({
      ...input,
      photos: { cover: [photo], sampling: [photo, photo, photo] },
    });
    const combined = new PizZip(
      replaceBqsPhotoSections(edited.generate({ type: 'nodebuffer' }), fresh),
    );
    const xml = combined.file('word/document.xml')!.asText();
    expect(xml).toContain('OPERATOR_EDIT_4931');
    expect(xml).toContain('bqs_manual_imo');
    expect(xml.match(/<w:drawing>/g) ?? []).toHaveLength(4);
    const rels = combined.file('word/_rels/document.xml.rels')!.asText();
    for (const match of xml.matchAll(/r:embed="([^"]+)"/g))
      expect(rels).toContain(`Id="${match[1]}"`);
    expect(
      new Set(
        [...xml.matchAll(/<wp:docPr[^>]* id="([^"]+)"/g)].map((m) => m[1]),
      ).size,
    ).toBe(4);
  });
  it('recusa reconstrução se o editor removeu uma área identificada', async () => {
    const original = await buildReportDocxBqs(input),
      zip = new PizZip(original);
    zip.file(
      'word/document.xml',
      zip
        .file('word/document.xml')!
        .asText()
        .replaceAll('bqs_photos_cover', 'unmarked'),
    );
    expect(() =>
      replaceBqsPhotoSections(zip.generate({ type: 'nodebuffer' }), original),
    ).toThrow(/cover/);
  });
  it('elimina os bytes das fotos removidas, preservando mídia usada no cabeçalho', async () => {
    const photo = await sharp({
      create: { width: 30, height: 50, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    const old = await buildReportDocxBqs({
      ...input,
      photos: { cover: [photo] },
    });
    const fresh = await buildReportDocxBqs(input);
    const original = new PizZip(old);
    const media = Object.keys(original.files).find((name) =>
      name.includes('image_generated_'),
    )!;
    expect(media).toBeTruthy();
    const refreshed = new PizZip(replaceBqsPhotoSections(old, fresh));
    expect(refreshed.file(media)).toBeNull();
    expect(refreshed.file('word/document.xml')!.asText()).not.toContain(
      '<w:drawing>',
    );
    const headerMedia = Object.keys(original.files).filter(
      (name) =>
        name.startsWith('word/media/') &&
        name !== media &&
        !original.files[name]!.dir,
    );
    for (const name of headerMedia)
      expect(refreshed.file(name)!.asUint8Array()).toEqual(
        original.file(name)!.asUint8Array(),
      );
    const relPath = 'word/_rels/header1.xml.rels';
    original.file(
      relPath,
      original
        .file(relPath)!
        .asText()
        .replace(
          '</Relationships>',
          `<Relationship Id="sharedPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${media.slice(5)}"/></Relationships>`,
        ),
    );
    const shared = new PizZip(
      replaceBqsPhotoSections(original.generate({ type: 'nodebuffer' }), fresh),
    );
    expect(shared.file(media)!.asUint8Array()).toEqual(
      original.file(media)!.asUint8Array(),
    );
  });
  it('não aceita PDF sem seções; atualiza somente o número no sumário', async () => {
    const original = await buildReportDocxBqs(input);
    expect(() =>
      bqsPagesFromPdfText(original, 'cover\fContents\fnot a report'),
    ).toThrow(/seção/);
    const updated = updateBqsTocPages(
      original,
      Object.fromEntries(
        [
          's1',
          's2',
          's3',
          's4',
          's4_1',
          's4_2',
          's4_3',
          's4_4',
          's4_5',
          's4_6',
          's4_7',
          's4_8',
          's5',
          's5_1',
          's5_2',
          's6',
          's7',
          's7_1',
          's7_2',
          's7_3',
          's8',
          's8_1',
          's8_2',
        ].map((id) => ['bqs_' + id, 8]),
      ),
    );
    expect(new PizZip(updated).file('word/document.xml')!.asText()).toContain(
      'bqs_s8_2',
    );
  });
});

it('mede títulos com numeração nativa sem confundir subtítulos repetidos', () => {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:bookmarkStart w:name="bqs_s1"/><w:pPr><w:numPr/></w:pPr><w:r><w:t>Background</w:t></w:r></w:p><w:p><w:bookmarkStart w:name="bqs_s5_1"/><w:pPr><w:numPr/></w:pPr><w:r><w:t>Vessel’s tanks</w:t></w:r></w:p><w:p><w:bookmarkStart w:name="bqs_s7_1"/><w:pPr><w:numPr/></w:pPr><w:r><w:t>Vessel’s tanks</w:t></w:r></w:p></w:body></w:document>',
  );
  expect(
    bqsPagesFromPdfText(
      zip.generate({ type: 'nodebuffer' }),
      'Cover\fContents\f1. Background\n5.1. Vessel’s tanks\f7.1. Vessel’s tanks',
    ),
  ).toEqual({ bqs_cover_end: 1, bqs_s1: 3, bqs_s5_1: 3, bqs_s7_1: 4 });
});
