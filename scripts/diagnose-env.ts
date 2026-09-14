/** Diagnóstico local somente leitura: sem serviços, credenciais ou dados de relatórios na saída. */
import { environmentProblems as webProblems } from '../apps/web/lib/env';
import { environmentProblems as workerProblems } from '../apps/worker/src/lib/env';
import { getAiModel, getAiProvider, isAiEnabled } from '../apps/worker/src/lib/llm';

const web = webProblems();
const worker = workerProblems();
console.log(JSON.stringify({
  precedence: 'process.env > .env.local da raiz > .env da raiz (dev/start); container usa ambiente injetado',
  web: { configured: web.length === 0, issues: web },
  worker: { configured: worker.length === 0, issues: worker },
  ai: { enabled: isAiEnabled(), provider: getAiProvider(), model: getAiModel(), keyPresent: Boolean(process.env[getAiProvider() === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY']?.trim()) },
  scope: 'Somente configuração local. Disponibilidade de fila/worker/Storage/Collabora: /api/health/ready com sessão administrativa.',
}, null, 2));
process.exitCode = web.length || worker.length ? 1 : 0;
