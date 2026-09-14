import { createHash } from 'crypto';
import { describe, it, expect, vi } from 'vitest';
import {
  convertWorkingDocxToPdf,
  missingRequiredSheetPhases,
  nextPdfVersion,
} from './generatePdf';

vi.mock('../lib/soffice', () => ({
  convertDocxToPdf: vi.fn(async () => Buffer.from('PDF')),
  measureBookmarkPages: vi.fn(async () => ({})),
}));

describe('nextPdfVersion (010/T-005, CA-003)', () => {
  it('primeira geração → v1', () => {
    expect(nextPdfVersion([])).toBe(1);
  });

  it('acumula a partir da maior versão existente', () => {
    expect(nextPdfVersion(['3ffa/final-v1.pdf'])).toBe(2);
    expect(nextPdfVersion(['3ffa/final-v1.pdf', '3ffa/final-v2.pdf'])).toBe(3);
  });

  it('ignora caminhos legados sem versão (final.pdf antigo)', () => {
    expect(nextPdfVersion(['3ffa/final.pdf'])).toBe(1);
    expect(nextPdfVersion(['3ffa/final.pdf', '3ffa/final-v3.pdf'])).toBe(4);
  });
});

describe('missingRequiredSheetPhases', () => {
  const png = Buffer.from('png');

  it('exige initial e final quando não há fase intermediária', () => {
    expect(missingRequiredSheetPhases(
      { initial: null, intermediate: null, final: png },
      false,
    )).toEqual(['initial']);
  });

  it('exige as três imagens quando há fase intermediária', () => {
    expect(missingRequiredSheetPhases(
      { initial: png, intermediate: null, final: png },
      true,
    )).toEqual(['intermediate']);
  });
});

describe('convertWorkingDocxToPdf (012/T-005..T-007, CA-004)', () => {
  it('converte o working.docx EDITADO (sem reconstruir dos dados) e hash = sha256 do binário', async () => {
    const edited = Buffer.from('DOCX-EDITADO-NO-COLLABORA');
    const svc = {
      storage: {
        from: () => ({
          download: async (path: string) => { expect(path).toBe('r1/working/approved.docx'); return { data: { arrayBuffer: async () => edited }, error: null }; },
        }),
      },
      // Se o job tentar reconstruir dos dados (spec/planilha), o teste falha:
      from: () => {
        throw new Error('não deveria reconstruir dos dados quando working.docx existe');
      },
    };
    const row = {
      status: 'approved',
      approved_docx_path: 'r1/working/approved.docx',
      working_docx_path: 'r1/working/newer-edit.docx',
      variant: null,
      spec_id: 's1',
      extracted_data: {},
      operator_overrides: {},
      spreadsheet_path: null,
      created_by: null,
      pdf_paths: [],
    };

    const out = await convertWorkingDocxToPdf(svc as never, 'r1', row as never);
    expect(out.docx.equals(edited)).toBe(true);
    expect(out.pdf.equals(Buffer.from('PDF'))).toBe(true);
    expect(out.docHash).toBe(createHash('sha256').update(edited).digest('hex'));
  });
});

  it('arquivo salvo indisponível falha sem reconstruir ou gravar documento', async () => {
    const svc = { storage: { from: () => ({ download: async () => ({ error: { message: 'offline' }, data: null }) }) } };
    await expect(convertWorkingDocxToPdf(svc as never, 'r1', { status: 'approved', approved_docx_path: 'r1/saved.docx' } as never)).rejects.toThrow('versão salva');
  });
  it('reconhece arquivos finais isolados por revisão', () => {
    expect(nextPdfVersion(['r/final-v1-r12.pdf', 'r/final-v2-r15.pdf'])).toBe(3);
  });
