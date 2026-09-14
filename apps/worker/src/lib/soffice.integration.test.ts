import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReportDocx } from './buildDocx';

// Opt-in: usa o LibreOffice instalado, sem banco, rede, fila ou credenciais.
describe.skipIf(process.env.RUN_LO_TESTS !== '1')('LibreOffice real', () => {
  it('converte o DOCX atual com texto em português para PDF', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'naabsa-lo-test-'));
    process.env.LO_PROFILE_DIR = join(dir, 'profile');
    const { convertDocxToPdf } = await import('./soffice');
    const docx = await buildReportDocx({
      data: { vessel_name: 'MV LOCAL VALIDATION', port: 'São Luís — ação' },
      variant: 'loading', logo: null, sheetImages: {},
      phasePhotos: { initial: [], final: [] }, acting: {},
    });
    const pdf = await convertDocxToPdf(docx);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    const output = join(dir, 'validation.pdf');
    await writeFile(output, pdf);
    expect((await readFile(output)).equals(pdf)).toBe(true);
    console.info(`PDF local para inspeção: ${output}`);
  }, 180_000);
});
