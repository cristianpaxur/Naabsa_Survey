import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { buildReportDocxMsc } from './buildDocxMsc';

function paragraphs(docx: Buffer): string[] {
  const xml = new PizZip(docx).file('word/document.xml')!.asText();
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((paragraph) => [...paragraph[0].matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((match) => match[1])
      .join(''))
    .filter(Boolean);
}

describe('buildReportDocxMsc', () => {
  it('mantém índice único, anexos exatos e regras condicionais de ROB', async () => {
    const text = paragraphs(await buildReportDocxMsc({
      data: {
        appointed_service: 'ROB Survey',
        vessel_name: 'MSC TEST',
        last_attendance: 'Yes',
        logbook_updated: 'Attached',
        vrs_updated: 'No',
      },
      logo: null,
      photos: {},
      timeLogRows: [],
    }));

    expect(text).toEqual(expect.arrayContaining([
      '2.9 Last attendance',
      '3.1 Vessel',
      '3.4 ECR (Engine Control Room)',
      '3.5 Hull',
      'Survey Report',
      'Berthing message',
      'VRS updated',
      'Last manual sounding',
      'Logbook update',
      'Sludge removal certificates',
    ]));
    expect(text.join('\n')).not.toContain('verify the total amount of sludge disposed');
    expect(text.join('\n')).toContain('the logbook was updated');
    expect(text.join('\n')).not.toContain('the logbook and VRS were updated');
    expect(text).not.toContain('4. Vessel');
  });
});
