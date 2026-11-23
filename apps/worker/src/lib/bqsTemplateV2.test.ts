import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import PizZip from 'pizzip';
import { describe, it, expect } from 'vitest';

describe('BQS v2 source-derived template package', () => {
  it('provides native tank rows, stable navigation, and five replaceable galleries', () => {
    const zip = new PizZip(
      readFileSync(
        new URL('../../../../templates/bqs.v2.clean.docx', import.meta.url),
      ),
    );
    const xml = zip.file('word/document.xml')!.asText();
    for (const [part, hash] of Object.entries({
      'word/numbering.xml':
        'e3b03336df4a936da814466b3dc3bb4039298edbea67714ad410848f73cc0453',
      'word/theme/theme1.xml':
        '5d3012bb168650fe74e87dbe1d8939f5d05b8053bbaea41006959a1113e14adf',
      'word/header2.xml':
        '29b01bf2f852c57c3d9bfbd6ceb94bb56cf839de57133afae7392e206dbe71ae',
      'word/header4.xml':
        'f4cc1d7777823f94b201e245db86d75c3e605e2f327768a95b994ee7fb4297c6',
    })) {
      expect(
        createHash('sha256')
          .update(zip.file(part)!.asNodeBuffer())
          .digest('hex'),
      ).toBe(hash);
    }
    for (const slot of [
      'cover',
      'sounding_tables',
      'vessel_tanks',
      'barge_tanks',
      'sampling',
    ]) {
      expect(
        xml.match(new RegExp(`w:val="bqs_photos_${slot}"`, 'g')),
      ).toHaveLength(1);
    }
    for (const prefix of [
      'vessel_open',
      'vessel_close',
      'barge_open',
      'barge_close',
    ]) {
      expect(xml).toContain(`{#${prefix}_rows}{c0}`);
      expect(xml).toContain(`{c12}{/${prefix}_rows}`);
    }
    expect(xml.match(/w:name="bqs_s/g)).toHaveLength(21);
    expect(xml.match(/PAGEREF bqs_s/g)).toHaveLength(21);
    expect(xml).toContain('{cover_logbook_difference}');
    expect(xml).toContain('{barge_declared_delivered}');
    expect(xml).toContain('bqs_manual_final_remarks');
    // Contact values use distinct native paragraphs, like the MSC and Draft
    // covers. Raw newlines inside w:t collapsed after a native editor save.
    expect(xml).toContain('{client}');
    expect(xml).toContain('{operator}');
    expect(xml).not.toContain('{client}\n{company_contact}');
    const msc = new PizZip(
      readFileSync(
        new URL('../../../../templates/msc.clean.docx', import.meta.url),
      ),
    );
    for (const part of ['header1.xml', 'header2.xml', 'footer1.xml']) {
      expect(zip.file(`word/naabsa-${part}`)!.asNodeBuffer()).toEqual(
        msc.file(`word/${part}`)!.asNodeBuffer(),
      );
    }
    expect(zip.file('word/_rels/document.xml.rels')!.asText()).toContain(
      'naabsa-header1.xml',
    );
    expect(xml).toContain('w:fill="DEEAF6"');
    expect(xml).toContain('w:gridCol w:w="2694"');
    expect(xml).toContain('w:gridCol w:w="6281"');
    const paragraphs = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)!;
    for (const label of [
      'Total quantity supplied as per the vessel’s tanks',
      'Initial quantity (IN AIR): {vessel_open_air}',
      'Final quantity (IN AIR): {vessel_close_air}',
    ]) {
      expect(paragraphs.find((p) => p.includes(label))).toContain(
        '<w:keepNext',
      );
    }
    expect(
      paragraphs.find((p) =>
        p.includes('Quantity received: {vessel_received}'),
      ),
    ).not.toContain('<w:keepNext');
    expect(xml).not.toMatch(
      /Capa|Time [Ll]og\s*[–-]|\(Barge\s*[–-]|\(Vessel\s*[–-]/,
    );
    expect(
      Object.keys(zip.files).filter((n) =>
        /customXml|embeddings|comments|thumbnail/.test(n),
      ),
    ).toEqual([]);
    expect(
      Object.keys(zip.files).filter(
        (n) => n.startsWith('word/media/') && !zip.files[n]!.dir,
      ),
    ).toEqual(['word/media/image3.jpg', 'word/media/naabsa-logo.jpg']);
  });
});
