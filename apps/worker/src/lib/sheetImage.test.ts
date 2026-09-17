import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { applyLineFreePrintStyle } from './sheetImage';

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
