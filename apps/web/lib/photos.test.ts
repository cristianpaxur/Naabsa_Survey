import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { loadUIPhotos } from './photos';

function client(result: unknown) {
  const query = { select: () => query, eq: () => query, is: () => query, order: async () => result };
  return { from: () => query } as unknown as Parameters<typeof loadUIPhotos>[0];
}
const photo = {
  id: 'photo', status: 'done', thumb_path: 'thumb.jpg', processed_path: 'photo.jpg',
  original_path: 'original.jpg', slot_id: null, position: 0, crop: null,
  ai_status: 'running', ai_suggested: false, quality_flags: [],
};

describe('loadUIPhotos', () => {
  it('erro de banco lança erro recuperável em vez de retornar galeria vazia', async () => {
    await expect(loadUIPhotos(client({ data: null, error: { message: 'offline' } }), 'report')).rejects.toThrow('carregar as fotos');
  });
  it('foto pendente não expõe caminhos ainda não processados', async () => {
    const result = await loadUIPhotos(client({ data: [{ ...photo, status: 'pending' }], error: null }), 'report');
    expect(result[0]).toMatchObject({ thumbUrl: null, processedUrl: null });
  });
  it('usa origem do app mesmo com Storage HTTP e preserva estado real da IA', async () => {
    const result = await loadUIPhotos(client({ data: [photo], error: null }), 'report');
    expect(result[0]).toMatchObject({ thumbUrl: '/api/reports/report/photos/photo/image?size=thumb', processedUrl: '/api/reports/report/photos/photo/image?size=full', aiStatus: 'running' });
  });
});
