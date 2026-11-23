import { randomUUID } from 'node:crypto';
import { getBoss } from './boss';
import { getServiceClient } from './supabase';
import { getAiModel, getAiProvider, isAiEnabled } from './llm';

/** Publica vida + conexão real com a fila; tabela acessível apenas a administradores. */
export async function startWorkerHeartbeat(): Promise<() => void> {
  const id = randomUUID();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    let queueReady = false;
    try { queueReady = !!(await (await getBoss()).getQueue('process_photo')); }
    catch { /* só registra o estado, nunca connection string */ }
    try {
      const { error } = await getServiceClient().from('worker_heartbeats').upsert({
        id, seen_at: new Date().toISOString(), queue_ready: queueReady,
        ai_enabled: isAiEnabled(), ai_provider: getAiProvider(), ai_model: getAiModel(),
      } as never).abortSignal(AbortSignal.timeout(5000));
      if (error) console.error('[worker] heartbeat indisponível; verifique a migração e o banco.');
    } catch { console.error('[worker] heartbeat indisponível.'); }
    if (!stopped) timer = setTimeout(() => { void tick(); }, 30_000);
  };
  await tick();
  return () => { stopped = true; clearTimeout(timer); };
}
