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
  it('aplica precisão ao campo numérico Delivered', async () => {
    const text = paragraphs(await buildReportDocxMsc({
      data: { delivered: 1981 }, numberFormats: { delivered: 1 },
      logo: null, photos: {}, timeLogRows: [],
    }));
    expect(text.filter((value) => /^1981(?:\.\d+)?$/.test(value))).toEqual(['1981.0']);
  });
  it.each([[0, '81 m'], [1, '81.0 m'], [2, '81.00 m'], [3, '81.000 m']] as const)(
    'respeita %i casas no campo MSC LOA', async (decimals, expected) => {
      const text = paragraphs(await buildReportDocxMsc({
        data: { loa: 81 }, numberFormats: { loa: decimals },
        logo: null, photos: {}, timeLogRows: [],
      }));
      expect(text.filter((value) => /^81(?:\.0+)? m$/.test(value))).toEqual([expected]);
    },
  );

  it('usa precisão dos campos de grades, sludge, flowmeter e temperaturas', async () => {
    const text = paragraphs(await buildReportDocxMsc({
      data: { grade_1_present: 'Yes', grade_1_surveyor: 1250, grade_1_percentage: 2,
        sludge_berthing: 12, sludge_rate_chief: 3, flowmeter_accuracy: 4,
        temp_engine_room: 30, purifier_temp: 40 },
      numberFormats: { grade_1_surveyor: 1, grade_1_percentage: 0,
        sludge_berthing: 2, sludge_rate_chief: 3, flowmeter_accuracy: 1,
        temp_engine_room: 1, purifier_temp: 2 },
      logo: null, photos: {}, timeLogRows: [],
    }));
    expect(text).toEqual(expect.arrayContaining([
      '1,250.0 mt', '2 %', '12.00 m³', '3.000 %', '4.0 %',
      'Engine room temperature: 30.0 °C', '40.00 °C',
    ]));
    expect(text).not.toContain('1,250.000 mt');
  });

  it('não imprime números não finitos', async () => {
    const text = paragraphs(await buildReportDocxMsc({
      data: { loa: Infinity, sludge_berthing: Number.NaN, flowmeter_accuracy: -Infinity },
      logo: null, photos: {}, timeLogRows: [],
    })).join('\n');
    expect(text).not.toMatch(/NaN|Infinity/);
  });

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
