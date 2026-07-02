import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditJobFailure, FAILURE_ACTIONS } from './deadLetter';

const insertMock = vi.fn();
vi.mock('./supabase', () => ({
  getServiceClient: () => ({ from: vi.fn(() => ({ insert: insertMock })) }),
}));

describe('deadLetter.auditJobFailure (014/T-001, RF-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ error: null });
  });

  it('audita a ação correta por fila, com mensagem e jobId', async () => {
    await auditJobFailure('generate_pdf', 'r1', new Error('LibreOffice timeout'), 'job-9');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        report_id: 'r1',
        actor: null,
        action: 'pdf_generation_failed',
        payload: { message: 'LibreOffice timeout', queue: 'generate_pdf', jobId: 'job-9' },
      }),
    );
  });

  it('mapeia todas as filas de documento', () => {
    expect(FAILURE_ACTIONS.generate_pdf).toBe('pdf_generation_failed');
    expect(FAILURE_ACTIONS.preview_pdf).toBe('preview_failed');
    expect(FAILURE_ACTIONS.build_working_docx).toBe('working_docx_failed');
  });

  it('erro não-Error vira string na mensagem', async () => {
    await auditJobFailure('preview_pdf', 'r2', 'storage indisponível');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'preview_failed',
        payload: { message: 'storage indisponível', queue: 'preview_pdf' },
      }),
    );
  });

  it('NUNCA lança — falha ao auditar não mascara o erro original do job', async () => {
    insertMock.mockRejectedValue(new Error('db fora'));
    await expect(
      auditJobFailure('build_working_docx', 'r3', new Error('original')),
    ).resolves.toBeUndefined();
  });
});
