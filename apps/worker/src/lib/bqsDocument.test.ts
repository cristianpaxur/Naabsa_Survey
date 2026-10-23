import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
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
        .replace('bqs_photos_cover', 'unmarked'),
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
