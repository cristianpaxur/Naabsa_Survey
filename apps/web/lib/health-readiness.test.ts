import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../app/api/health/ready/route';

const memory = vi.hoisted(() => ({ user: true, profile: { role: 'admin', status: 'active' }, permitted: true, worker: true, queue: true, storage: true }));
const service = vi.hoisted(() => vi.fn(() => ({ storage: { getBucket: async () => ({ error: memory.storage ? null : { message: 'sensitive secret endpoint' }, data: { public: false } }) } })));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: service }));
vi.mock('@/lib/env', () => ({ environmentProblems: () => [] }));
vi.mock('@/lib/wopi/discovery', () => ({ parseDiscovery: () => ({ docx: 'https://office.test' }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: memory.user ? { id: 'u1' } : null } }) },
  rpc: async () => ({ data: memory.permitted, error: null }),
  from: (table: string) => {
    const query = { select: () => query, eq: () => query, gte: () => query,
      maybeSingle: async () => ({ data: memory.profile }),
      abortSignal: async () => ({ data: table === 'worker_heartbeats' && memory.worker ? [{ queue_ready: memory.queue, ai_enabled: true, ai_provider: 'openai', ai_model: 'gpt-5.5' }] : [], error: null }),
    };
    return query;
  },
}) }));
beforeEach(() => {
  Object.assign(memory, { user: true, profile: { role: 'admin', status: 'active' }, permitted: true, worker: true, queue: true, storage: true });
  service.mockClear();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '<discovery />' })));
});
afterEach(() => vi.unstubAllGlobals());
describe('readiness protegida', () => {
  it('sem sessão / admin inativo / sessão revogada não consulta infraestrutura', async () => {
    memory.user = false; expect((await GET()).status).toBe(401);
    memory.user = true; memory.profile.status = 'inactive'; expect((await GET()).status).toBe(403);
    memory.profile.status = 'active'; memory.permitted = false; expect((await GET()).status).toBe(403);
    expect(service).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('reporta configuração real do worker ao admin ativo', async () => {
    const response = await GET(); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ready', checks: { worker: true, queue: true }, ai: [{ enabled: true, provider: 'openai' }] });
  });
  it('worker parado ou storage falho deixam not_ready sem mensagens sensíveis', async () => {
    memory.worker = false; memory.storage = false;
    const response = await GET(); expect(response.status).toBe(503);
    const body = await response.text(); expect(body).toContain('not_ready'); expect(body).not.toContain('sensitive');
  });
});
