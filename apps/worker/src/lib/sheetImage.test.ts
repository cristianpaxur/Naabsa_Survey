import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import {
  applyDraftSurveyHeaderPrintStyle,
  applyLineFreePrintStyle,
} from './sheetImage';

describe('sheet image print styling', () => {
  it.each(['Inicial', 'Intermediario', 'final'])(
    'keeps printed gridlines out of the %s phase',
    (sheetName) => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(sheetName, {
        views: [{ showGridLines: true }],
        pageSetup: { showGridLines: true },
      });
      sheet.getCell('A1').value = 'content';
      sheet.getCell('A1').border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };

      applyLineFreePrintStyle(sheet);

      expect(sheet.views.every((view) => view.showGridLines === false)).toBe(
        true,
      );
      expect(sheet.pageSetup.showGridLines).toBe(false);
      expect(sheet.getCell('A1').border).toBeUndefined();
    },
  );
});

describe('Draft Survey header image', () => {
  it.each([false, true])(
    'writes precise numeric times in the workbook (1904: %s)',
    async (date1904) => {
      const workbook = new ExcelJS.Workbook();
      workbook.properties.date1904 = date1904;
      const initial = workbook.addWorksheet('Inicial');
      const final = workbook.addWorksheet('final');
      const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
      const time = (minutes: number) => new Date(epoch + minutes * 60_000);

      initial.getCell('B7').value = 'DATE';
      initial.getCell('C7').value = new Date('2026-10-26T00:00:00Z');
      initial.mergeCells('C7:D7');
      initial.getCell('E7').value = {
        formula: 'C7+1',
        result: new Date('2026-10-27T00:00:00Z'),
      };
      initial.getCell('G7').value = time(23 * 60 + 20);
      initial.getCell('H7').value = time(120);
      initial.getCell('H7').numFmt = 'h:mm';
      initial.getCell('G8').style = initial.getCell('H7').style;

      final.getCell('B5').value = 'DATE';
      final.getCell('C5').value = new Date('2026-10-31T00:00:00Z');
      final.getCell('D5').value = new Date('2026-10-31T00:00:00Z');
      final.getCell('G5').value = time(541);
      final.getCell('H5').value = {
        formula: 'TIME(10,55,0)',
        result: time(655),
      };

      applyDraftSurveyHeaderPrintStyle(initial);
      applyDraftSurveyHeaderPrintStyle(final);

      for (const cell of ['C7', 'E7']) {
        expect(initial.getCell(cell).numFmt).toBe('dd"/"mm"/"yyyy');
      }
      for (const cell of ['C5', 'D5']) {
        expect(final.getCell(cell).numFmt).toBe('dd"/"mm"/"yyyy');
      }
      expect(initial.getCell('D7').master.address).toBe('C7');
      expect(initial.getCell('G8').numFmt).toBe('h:mm');
      expect(initial.getCell('H7').numFmt).toBe('hh:mm');
      expect(final.getCell('G5').numFmt).toBe('hh:mm');
      expect(final.getCell('H5').value).toEqual({
        formula: 'TIME(10,55,0)',
        result: 655 / 1440,
      });
      const zip = new PizZip(await workbook.xlsx.writeBuffer());
      const initialXml = zip.file('xl/worksheets/sheet1.xml')!.asText();
      const finalXml = zip.file('xl/worksheets/sheet2.xml')!.asText();
      expect(initialXml.match(/<c r="G7"[^>]*><v>([^<]+)<\/v><\/c>/)?.[1]).toBe(
        String(1400 / 1440),
      );
      expect(initialXml.match(/<c r="H7"[^>]*><v>([^<]+)<\/v><\/c>/)?.[1]).toBe(
        String(120 / 1440),
      );
      expect(finalXml.match(/<c r="G5"[^>]*><v>([^<]+)<\/v><\/c>/)?.[1]).toBe(
        String(541 / 1440),
      );
    },
  );
});
