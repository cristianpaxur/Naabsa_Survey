import { describe, expect, it, vi } from 'vitest';
import PizZip from 'pizzip';
import {
  buildPaginatedDocxMsc,
  mscPagesFromPdfText,
  measureMscPages,
} from './mscPagination';
import type { DocxInputMsc } from './buildDocxMsc';

const base: DocxInputMsc = {
  data: {},
  logo: null,
  photos: {},
  timeLogRows: [],
};
const tocPages = { msc_cover_contacts_end: 1, s1: 3, s6: 5 };
const nativeMeasure = vi.hoisted(() => vi.fn());
const nativeConvert = vi.hoisted(() => vi.fn());
const extractText = vi.hoisted(() => vi.fn());
const endpoint = vi.hoisted(() => vi.fn());
vi.mock('./soffice', () => ({
  measureBookmarkPages: nativeMeasure,
  convertDocxToPdf: nativeConvert,
}));
vi.mock('./pdfText', () => ({ extractPdfText: extractText }));
vi.mock('./collaboraConversion', () => ({ collaboraConversionUrl: endpoint }));

describe('MSC pagination', () => {
  it('retains original cover geometry when it fits and verifies the numbered final pass', async () => {
    const build = vi.fn(async (input: DocxInputMsc) =>
      Buffer.from(JSON.stringify(input)),
    );
    const measure = vi.fn(async () => tocPages);
    await buildPaginatedDocxMsc(base, { build, measure });
    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls[0]![0].coverMaxHeightMm).toBeUndefined();
    expect(build.mock.calls[1]![0].tocPages).toEqual(tocPages);
    expect(measure).toHaveBeenCalledTimes(2);
  });
  it('fits long cover contacts before numbering the final document', async () => {
    const build = vi.fn(async (input: DocxInputMsc) =>
      Buffer.from(JSON.stringify(input)),
    );
    const measure = vi
      .fn()
      .mockResolvedValueOnce({ ...tocPages, msc_cover_contacts_end: 2, s1: 4 })
      .mockResolvedValue(tocPages);
    await buildPaginatedDocxMsc(base, { build, measure });
    expect(build.mock.calls[1]![0].coverMaxHeightMm).toBeLessThan(120);
    expect(build.mock.calls.at(-1)![0].tocPages).toEqual(tocPages);
  });
  it('rejects persistent cover overflow and unstable TOC instead of publishing stale pages', async () => {
    const build = async () => Buffer.from('docx');
    await expect(
      buildPaginatedDocxMsc(base, {
        build,
        measure: async () => ({ ...tocPages, msc_cover_contacts_end: 2 }),
      }),
    ).rejects.toThrow(/capa/i);
    let attempt = 0;
    await expect(
      buildPaginatedDocxMsc(base, {
        build,
        measure: async () => ({ ...tocPages, s1: ++attempt + 2 }),
      }),
    ).rejects.toThrow(/pagina/i);
  });
  it('rejects a failed final measurement instead of returning a document with blank TOC numbers', async () => {
    const measure = vi
      .fn()
      .mockResolvedValueOnce(tocPages)
      .mockResolvedValueOnce({})
      .mockResolvedValue(tocPages);
    await expect(
      buildPaginatedDocxMsc(base, {
        build: async (input) => Buffer.from(JSON.stringify(input)),
        measure,
      }),
    ).rejects.toThrow(/medir/i);
  });
  it('maps destination headings, excludes TOC entries and detects cover overflow in PDF text', async () => {
    const template = new PizZip();
    // Keep only a representative subset of bookmarks so this is independent of fixture heading count.
    const xml =
      '<w:document><w:body><w:p><w:bookmarkStart w:name="s1"/><w:r><w:t>Vessel´s details (Ship´s Particulars)</w:t></w:r></w:p><w:p><w:bookmarkStart w:name="s5_4"/><w:r><w:t>ECR</w:t></w:r></w:p><w:p><w:bookmarkStart w:name="s6"/><w:r><w:t>Attachment</w:t></w:r></w:p></w:body></w:document>';
    template.file(
      'word/document.xml',
      xml.replace(
        '<w:document>',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      ),
    );
    const docx = template.generate({ type: 'nodebuffer' });
    const pages = [
      'cover',
      'ANTHONY',
      'Contents\n1. Vessel´s details (Ship´s Particulars)........3\n5.4. ECR........5\n6. Attachment......5',
      '1. Vessel´s details (Ship´s Particulars)\nbody',
      '5.4. ECR\n6. Attachment',
    ];
    expect(mscPagesFromPdfText(docx, pages.join('\f') + '\f')).toEqual({
      msc_cover_contacts_end: 2,
      s1: 4,
      s5_4: 5,
      s6: 5,
    });
    expect(() =>
      mscPagesFromPdfText(
        docx,
        'cover\fContents\f1. Vessel´s details (Ship´s Particulars)',
      ),
    ).toThrow(/seção/i);
    endpoint.mockReturnValue('http://collabora');
    nativeConvert.mockResolvedValue(Buffer.from('%PDF-'));
    extractText.mockResolvedValue(pages.join('\f'));
    nativeMeasure.mockClear();
    await expect(measureMscPages(docx)).resolves.toEqual({
      msc_cover_contacts_end: 2,
      s1: 4,
      s5_4: 5,
      s6: 5,
    });
    expect(nativeMeasure).not.toHaveBeenCalled();
    expect(nativeConvert).toHaveBeenCalledWith(docx);
  });
  describe('Collabora headings with detached superscript units', () => {
    const volumeDocx = () => {
      const zip = new PizZip();
      zip.file(
        'word/document.xml',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
          '<w:p><w:bookmarkStart w:name="s3_4"/><w:r><w:t>Gross volume - m</w:t></w:r>' +
          '<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>3</w:t></w:r>' +
          '<w:r><w:t>\u00a0</w:t></w:r></w:p>' +
          '<w:p><w:bookmarkStart w:name="s6"/><w:r><w:t>Attachment</w:t></w:r></w:p>' +
          '</w:body></w:document>',
      );
      return zip.generate({ type: 'nodebuffer' });
    };
    it.each([
      'Main Brazilian Ports\n                    3\n3.4.Gross volume - m\nCalculated according to the ship´s tanks sounding table.',
      '3.4.Gross volume - m\n                    3\nCalculated according to the ship´s tanks sounding table.',
      '3.4.Gross volume - m³\nCalculated according to the ship´s tanks sounding table.',
    ])(
      'locates the full volume heading even when its exponent has a separate PDF baseline: %s',
      (heading) => {
        const pdfText = [
          'cover',
          'Contents\n3.4. Gross volume........4\n6. Attachment........5',
          '3. Found at Survey',
          heading,
          '6. Attachment',
        ].join('\f');
        expect(mscPagesFromPdfText(volumeDocx(), pdfText)).toEqual({
          msc_cover_contacts_end: 1,
          s3_4: 4,
          s6: 5,
        });
      },
    );
    it.each([
      '3.4.Gross volume - m\nCalculated according to the ship´s tanks sounding table.',
      '2\n3.4.Gross volume - m',
      '3\n3.4.Gross volume - litres',
    ])(
      'rejects a missing or different unit rather than accepting a partial heading: %s',
      (heading) => {
        expect(() =>
          mscPagesFromPdfText(
            volumeDocx(),
            `cover\fContents\f${heading}\n6. Attachment`,
          ),
        ).toThrow(/seção s3_4/i);
      },
    );
    it('rejects a superscript on a different page and an ambiguous heading on two pages', () => {
      expect(() =>
        mscPagesFromPdfText(
          volumeDocx(),
          'cover\fContents\f3\f3.4.Gross volume - m\n6. Attachment',
        ),
      ).toThrow(/seção s3_4/i);
      expect(() =>
        mscPagesFromPdfText(
          volumeDocx(),
          'cover\fContents\f3\n3.4.Gross volume - m\f3.4.Gross volume - m³\n6. Attachment',
        ),
      ).toThrow(/seção s3_4/i);
    });
  });
});
