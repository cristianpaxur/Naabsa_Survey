import { afterAll, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ handlers: new Map<string, (jobs: any[]) => Promise<void>>(), updates: [] as { name: string; options: unknown }[] }));
const review = vi.hoisted(() => vi.fn());
vi.mock('./lib/env', () => ({ validateEnv: () => {} }));
vi.mock('./lib/heartbeat', () => ({ startWorkerHeartbeat: async () => () => {} }));
vi.mock('./jobs/aiReview', () => ({ AI_REVIEW_QUEUE: 'ai_review', aiReview: review }));
// O alvo é o registro/callback real de ai_review. Importar builders, Sharp,
// ExcelJS e Playwright dos outros jobs tornava este teste dependente do custo
// de carregar toda a aplicação, especialmente durante a suíte paralela.
vi.mock('./jobs/processPhoto', () => ({ processPhoto: vi.fn(), markPhotoError: vi.fn() }));
vi.mock('./jobs/generatePdf', () => ({
  generatePdf: vi.fn(), GENERATE_PDF_QUEUE: 'generate_pdf', GENERATE_PDF_CONCURRENCY: 1, GENERATE_PDF_RETRY_LIMIT: 1,
}));
vi.mock('./jobs/previewPdf', () => ({
  previewPdf: vi.fn(), PREVIEW_PDF_QUEUE: 'preview_pdf', PREVIEW_PDF_CONCURRENCY: 1, PREVIEW_PDF_RETRY_LIMIT: 1,
}));
vi.mock('./jobs/buildWorkingDocx', () => ({
  buildWorkingDocx: vi.fn(), BUILD_WORKING_DOCX_QUEUE: 'build_working_docx', BUILD_WORKING_DOCX_CONCURRENCY: 1, BUILD_WORKING_DOCX_RETRY_LIMIT: 1,
}));
vi.mock('./jobs/renderSheets', () => ({
  renderSheets: vi.fn(), RENDER_SHEETS_QUEUE: 'render_sheets', RENDER_SHEETS_CONCURRENCY: 1, RENDER_SHEETS_RETRY_LIMIT: 1,
}));
vi.mock('./jobs/retentionPurge', () => ({
  retentionPurge: vi.fn(), RETENTION_PURGE_QUEUE: 'retention_purge', RETENTION_PURGE_CRON: '0 3 * * *',
}));
vi.mock('./jobs/classifyPhotos', () => ({
  classifyPhotos: vi.fn(), schedulePhotoClassification: vi.fn(), CLASSIFY_PHOTOS_QUEUE: 'classify_photos',
}));
vi.mock('./lib/browser', () => ({ closeBrowser: vi.fn() }));
vi.mock('./lib/deadLetter', () => ({ auditJobFailure: vi.fn() }));
vi.mock('./lib/boss', () => ({
  PROCESS_PHOTO_QUEUE: 'process_photo', PROCESS_PHOTO_CONCURRENCY: 4, PROCESS_PHOTO_RETRY_LIMIT: 3,
  stopBoss: async () => {}, getBoss: async () => ({
    createQueue: async () => {}, schedule: async () => {},
    updateQueue: async (name: string, options: unknown) => { runtime.updates.push({ name, options }); },
    work: async (name: string, optionsOrHandler: unknown, handler?: (jobs: any[]) => Promise<void>) => {
      if (handler) runtime.handlers.set(name, handler);
      else if (typeof optionsOrHandler === 'function') runtime.handlers.set(name, optionsOrHandler as (jobs: any[]) => Promise<void>);
    },
  }),
}));

const previousTerm = new Set(process.listeners('SIGTERM'));
const previousInt = new Set(process.listeners('SIGINT'));
afterAll(() => {
  for (const listener of process.listeners('SIGTERM')) if (!previousTerm.has(listener)) process.removeListener('SIGTERM', listener);
  for (const listener of process.listeners('SIGINT')) if (!previousInt.has(listener)) process.removeListener('SIGINT', listener);
  vi.unstubAllEnvs();
});

it('handler real mantém retry na fila, repassa tentativa e não engole falha de infraestrutura', async () => {
  vi.stubEnv('WORKER_SMOKE', '0');
  await import('./index');
  await vi.waitFor(() => expect(runtime.handlers.has('ai_review')).toBe(true));
  const handler = runtime.handlers.get('ai_review')!;
  const payload = { reportId: 'r1', runId: 'run1', dataRevision: 2 };
  review.mockRejectedValueOnce(new Error('internal secret transport error'));
  await expect(handler([{ id: 'job1', retryCount: 1, data: payload }])).rejects.toThrow('Falha de infraestrutura durante a revisão por IA.');
  expect(review).toHaveBeenCalledWith(payload, {}, { jobId: 'job1', attempt: 1 });
  expect(runtime.updates).toContainEqual({ name: 'ai_review', options: { retryLimit: 1, retryDelay: 5, retryBackoff: true } });
});
