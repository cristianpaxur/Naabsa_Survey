import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../app/api/reports/[id]/photos/[photoId]/image/route';

const state = vi.hoisted(() => ({ user: true, row: null as unknown, error: null as unknown, filters: [] as unknown[][] }));
const download = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => vi.fn(() => ({ storage: { from: () => ({ download }) } })));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: service }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user ? { id: 'u' } : null } }) },
  from: () => {
    const query = { select: () => query,
      eq: (...args: unknown[]) => { state.filters.push(args); return query; },
      is: (...args: unknown[]) => { state.filters.push(args); return query; },
      maybeSingle: async () => ({ data: state.row, error: state.error }) };
    return query;
  },
}) }));
const request = (size = 'thumb') => GET(new Request(`https://app.test/api/reports/r/photos/p/image?size=${size}`), { params: Promise.resolve({ id: 'r', photoId: 'p' }) });
beforeEach(() => {
  state.user = true; state.row = { thumb_path: 'r/photos/thumbs/p.jpg', processed_path: 'r/photos/processed/p.jpg' };
  state.error = null; state.filters = []; service.mockClear(); download.mockReset();
  download.mockResolvedValue({ data: new Blob(['jpeg-bytes']), error: null });
});
describe('imagens privadas pela origem do app', () => {
  it('nega sessão ausente e linha inacessível antes de acessar Storage', async () => {
    state.user = false; expect((await request()).status).toBe(401);
    state.user = true; state.row = null; expect((await request()).status).toBe(404);
    expect(service).not.toHaveBeenCalled();
  });
  it('serve bytes, sem redirecionar para Storage HTTP nem permitir cache público', async () => {
    const response = await request();
    expect(response.status).toBe(200); expect(await response.text()).toBe('jpeg-bytes');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(state.filters).toEqual(expect.arrayContaining([['id', 'p'], ['report_id', 'r'], ['status', 'done'], ['removed_at', null]]));
  });
  it('usa processada se thumbnail estiver ausente no Storage', async () => {
    download.mockResolvedValueOnce({ data: null, error: { message: 'missing' } });
    expect((await request()).status).toBe(200);
    expect(download.mock.calls.map(call => call[0])).toEqual(['r/photos/thumbs/p.jpg', 'r/photos/processed/p.jpg']);
  });
  it('nega caminhos de outro relatório e erro de RLS sem expor mensagens internas', async () => {
    state.row = { thumb_path: 'other/photos/p.jpg', processed_path: null };
    expect((await request()).status).toBe(404); expect(service).not.toHaveBeenCalled();
    state.error = { message: 'private error' };
    const response = await request(); expect(response.status).toBe(503); expect(await response.text()).toBe('');
  });
  it('recorte pede processada e falha de download permanece recuperável', async () => {
    await request('full'); expect(download).toHaveBeenCalledWith('r/photos/processed/p.jpg');
    download.mockResolvedValue({ data: null, error: {} }); expect((await request()).status).toBe(503);
    expect((await request('invalid')).status).toBe(400);
  });
});
