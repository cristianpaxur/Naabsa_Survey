import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Document, Packer, Paragraph } from 'docx';
import PizZip from 'pizzip';
import {
  createNaabsaHeader,
  NAABSA_PAGE_MARGINS,
} from './naabsaDocumentLayout';

describe('layout institucional NAABSA', () => {
  it('gera o cabecalho original sem tabelas e com variante de primeira pagina', async () => {
    const logo = readFileSync(
      resolve(import.meta.dirname, '../../assets/naabsa-logo.jpg'),
    );
    const doc = new Document({
      evenAndOddHeaderAndFooters: true,
      sections: [
        {
          properties: {
            page: { margin: NAABSA_PAGE_MARGINS },
            titlePage: true,
          },
          headers: {
            default: createNaabsaHeader(logo, 'default'),
            first: createNaabsaHeader(logo, 'first'),
            even: createNaabsaHeader(logo, 'default'),
          },
          children: [new Paragraph('conteudo')],
        },
      ],
    });

    const zip = new PizZip(await Packer.toBuffer(doc));
    const documentXml = zip.file('word/document.xml')!.asText();
    const headers = Object.keys(zip.files)
      .filter((name) => /^word\/header\d+\.xml$/.test(name))
      .map((name) => zip.file(name)!.asText());

    expect(documentXml).toContain('<w:titlePg/>');
    expect(documentXml).toContain(
      '<w:pgMar w:top="1440" w:right="851" w:bottom="1080" w:left="794" w:header="709" w:footer="709"',
    );
    expect(headers).toHaveLength(3);
    expect(headers.every((xml) => !xml.includes('<w:tbl>'))).toBe(true);
    expect(headers.every((xml) => xml.includes('<wp:anchor'))).toBe(true);
    expect(headers.every((xml) => xml.includes('GeoSlab703 Md BT'))).toBe(true);
    expect(
      headers.every((xml) =>
        xml.includes('<w:bottom w:val="single" w:color="002060" w:sz="2"'),
      ),
    ).toBe(true);
    expect(headers.every((xml) => xml.match(/<w:p>/g)?.length === 2)).toBe(true);
  });
});
