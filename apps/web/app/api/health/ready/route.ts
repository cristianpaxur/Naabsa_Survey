import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { environmentProblems } from '@/lib/env';
import { parseDiscovery } from '@/lib/wopi/discovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), 5000);
    })]);
  } finally { clearTimeout(timer!); }
}

/** Diagnóstico detalhado exige admin ativo. Liveness pública fica em /api/health. */
export async function GET(): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Sessão expirada.' }, { status: 401, headers });
  const { data: rawProfile } = await supabase.from('profiles').select('role,status').eq('user_id', user.id).maybeSingle();
  const profile = rawProfile as { role: string; status: string } | null;
  if (!profile || profile.role !== 'admin' || profile.status !== 'active') return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  // Além de active, a policy aplica revogação da sessão no banco.
  const { data: permitted, error: authError } = await supabase.rpc('current_is_admin');
  if (authError || !permitted) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  const configuration = environmentProblems();
  const svc = createServiceClient();
  const checks = await Promise.allSettled([
    supabase.from('worker_heartbeats').select('seen_at, queue_ready, ai_enabled, ai_provider, ai_model')
      .gte('seen_at', new Date(Date.now() - 90_000).toISOString()).abortSignal(AbortSignal.timeout(5000)),
    bounded(svc.storage.getBucket('reports')),
    fetch(`${process.env.COLLABORA_URL?.replace(/\/$/, '')}/hosting/discovery`, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
      .then(async (res) => res.ok && !!parseDiscovery(await res.text()).docx),
  ]);
  const heartbeat = checks[0];
  const workers = (heartbeat.status === 'fulfilled' && !heartbeat.value.error ? heartbeat.value.data ?? [] : []) as { queue_ready: boolean; ai_enabled: boolean; ai_provider: string; ai_model: string }[];
  const storage = checks[1];
  const collabora = checks[2];
  const dependencies = {
    database: heartbeat.status === 'fulfilled' && !heartbeat.value.error,
    worker: workers.length > 0,
    queue: workers.some((w) => w.queue_ready),
    storage: storage.status === 'fulfilled' && !storage.value.error && storage.value.data?.public === false,
    collabora: collabora.status === 'fulfilled' && collabora.value === true,
  };
  const ready = configuration.length === 0 && Object.values(dependencies).every(Boolean);
  return Response.json({ status: ready ? 'ready' : 'not_ready', checks: dependencies, configuration,
    ai: workers.map((w) => ({ enabled: w.ai_enabled, provider: w.ai_provider, model: w.ai_model })),
  }, { status: ready ? 200 : 503, headers });
}
