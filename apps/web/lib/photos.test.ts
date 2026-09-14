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
    await expect(loadUIPhotos(client({ data: null, error: { message: 'offline' } }), {} as never, 'report')).rejects.toThrow('carregar as fotos');
  });
  it('não substitui URLs válidas por imagens vazias quando assinatura falha', async () => {
    const service = { storage: { from: () => ({ createSignedUrls: async () => ({ data: null, error: { message: 'offline' } }) }) } };
    await expect(loadUIPhotos(client({ data: [photo], error: null }), service as never, 'report')).rejects.toThrow('carregar as imagens');
  });
  it('nova leitura renova URLs por dez minutos e preserva estado real da IA', async () => {
    const sign = vi.fn(async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })), error: null }));
    const service = { storage: { from: () => ({ createSignedUrls: sign }) } };
    const result = await loadUIPhotos(client({ data: [photo], error: null }), service as never, 'report');
    expect(sign).toHaveBeenCalledWith(['thumb.jpg', 'photo.jpg'], 600);
    expect(result[0]).toMatchObject({ thumbUrl: 'signed:thumb.jpg', processedUrl: 'signed:photo.jpg', aiStatus: 'running' });
  });
});
