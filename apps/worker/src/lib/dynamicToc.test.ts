import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { buildReportDocx } from './buildDocx';
import { buildReportDocxMsc } from './buildDocxMsc';

const draft = (intermediate: boolean) =>
  buildReportDocx({
    data: intermediate ? { intermediate_date: '2026-11-23' } : {},
    variant: 'loading',
    logo: null,
    sheetImages: {},
    phasePhotos: {},
    acting: {},
    tocPages: { s1: 3, s3_6: 7, s5_6: 12, s6: 13 },
  });

describe('páginas dinâmicas do sumário', () => {
  it.each([false, true])(
    'Draft liga cada página à seção, inclusive fotos (intermediária: %s)',
    async (intermediate) => {
      const zip = new PizZip(await draft(intermediate));
      const xml = zip.file('word/document.xml')!.asText();
      const links =
        xml.match(
          /<w:hyperlink\b[^>]*w:anchor="s\d+(?:_\d+)?"[^>]*>.*?<\/w:hyperlink>/gs,
        ) ?? [];
      expect(links.length).toBeGreaterThan(10);
      for (const link of links) {
        const anchor = link.match(/w:anchor="([^"]+)"/)![1];
        expect(link, anchor).toContain(`PAGEREF ${anchor} `);
        expect(xml).toContain(`w:name="${anchor}"`);
      }
      expect(xml).toContain('PAGEREF s3_6 ');
      expect(xml).toContain('PAGEREF s5_6 ');
      expect(xml.includes('PAGEREF s4_6 ')).toBe(intermediate);
      expect(zip.file('word/settings.xml')!.asText()).toMatch(
        /<w:updateFields\b[^>]*w:val="(?:true|1)"/,
      );
      const finalPhotos = links.find((link) =>
        link.includes('w:anchor="s5_6"'),
      )!;
      expect(finalPhotos).toContain('>12</w:t>');
    },
  );

  it('MSC também mantém a página medida como resultado de uma referência atualizável', async () => {
    const zip = new PizZip(
      await buildReportDocxMsc({
        data: {},
        logo: null,
        photos: {},
        timeLogRows: [],
        tocPages: { s1: 4 },
      }),
    );
    const xml = zip.file('word/document.xml')!.asText();
    const link = xml.match(
      /<w:hyperlink\b[^>]*w:anchor="s1"[^>]*>.*?<\/w:hyperlink>/s,
    )![0];
    expect(link).toContain('PAGEREF s1 ');
    expect(link).toContain('>4</w:t>');
  });
});
