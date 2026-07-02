import { describe, it, expect, vi, beforeEach } from 'vitest';
import { previewPdf } from './previewPdf';

// O preview converte o working.docx EDITADO (mesmo caminho do generate_pdf) e sobe
// em {id}/preview.pdf — assim o preview é idêntico ao download (012/T-005, T-009).
const uploadMock = vi.fn();
const svcMock = {
  storage: { from: vi.fn(() => ({ upload: uploadMock })) },
};

vi.mock('../lib/supabase', () => ({
  getServiceClient: () => svcMock,
}));

const loadReportMock = vi.fn();
const convertMock = vi.fn();
vi.mock('./generatePdf', () => ({
  loadReport: (...args: unknown[]) => loadReportMock(...args),
  convertWorkingDocxToPdf: (...args: unknown[]) => convertMock(...args),
}));

describe('job preview_pdf (012/T-005, T-009)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadMock.mockResolvedValue({ error: null });
    loadReportMock.mockResolvedValue({ status: 'editing', pdf_paths: [] });
    convertMock.mockResolvedValue({ pdf: Buffer.from('PDF'), docx: Buffer.from('DOCX'), docHash: 'abc' });
  });

  it('converte o working.docx e sobe {id}/preview.pdf (upsert)', async () => {
    await previewPdf({ reportId: 'r1' });
    expect(convertMock).toHaveBeenCalledOnce();
    expect(uploadMock).toHaveBeenCalledWith(
      'r1/preview.pdf',
      Buffer.from('PDF'),
      { contentType: 'application/pdf', upsert: true },
    );
  });

  it('lança erro pt-BR quando o relatório não existe', async () => {
    loadReportMock.mockResolvedValue(null);
    await expect(previewPdf({ reportId: 'nao-existe' })).rejects.toThrow(/não encontrado/);
    expect(convertMock).not.toHaveBeenCalled();
  });

  it('propaga falha de upload do preview', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'storage indisponível' } });
    await expect(previewPdf({ reportId: 'r1' })).rejects.toThrow(/falha no upload do preview/);
  });
});
