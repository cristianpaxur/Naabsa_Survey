import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildWorkingDocx } from './buildWorkingDocx';

// Job puro de orquestração: monta (generatePdf.buildWorkingDocx), sobe no Storage
// e grava working_docx_path. Mockamos as duas pontas (012/T-009).
const uploadMock = vi.fn();
const updateEqMock = vi.fn();
const svcMock = {
  storage: { from: vi.fn(() => ({ upload: uploadMock })) },
  from: vi.fn(() => ({ update: vi.fn(() => ({ eq: updateEqMock })) })),
};

vi.mock('../lib/supabase', () => ({
  getServiceClient: () => svcMock,
}));

const loadReportMock = vi.fn();
const assembleMock = vi.fn();
vi.mock('./generatePdf', () => ({
  loadReport: (...args: unknown[]) => loadReportMock(...args),
  buildWorkingDocx: (...args: unknown[]) => assembleMock(...args),
}));

describe('job build_working_docx (012/T-002, T-009)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadMock.mockResolvedValue({ error: null });
    updateEqMock.mockResolvedValue({ error: null });
    loadReportMock.mockResolvedValue({ status: 'editing', pdf_paths: [] });
    assembleMock.mockResolvedValue({ docx: Buffer.from('DOCX'), data: {}, variant: 'loading' });
  });

  it('monta o .docx, sobe em {id}/working.docx e grava working_docx_path', async () => {
    await buildWorkingDocx({ reportId: 'r1' });
    expect(assembleMock).toHaveBeenCalledOnce();
    expect(uploadMock).toHaveBeenCalledWith(
      'r1/working.docx',
      Buffer.from('DOCX'),
      expect.objectContaining({ upsert: true }),
    );
    expect(updateEqMock).toHaveBeenCalledWith('id', 'r1');
  });

  it('lança erro pt-BR quando o relatório não existe', async () => {
    loadReportMock.mockResolvedValue(null);
    await expect(buildWorkingDocx({ reportId: 'nao-existe' })).rejects.toThrow(/não encontrado/);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('propaga falha de upload (job relança via retry do pg-boss)', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'storage indisponível' } });
    await expect(buildWorkingDocx({ reportId: 'r1' })).rejects.toThrow(/falha no upload/);
    expect(updateEqMock).not.toHaveBeenCalled();
  });
});
