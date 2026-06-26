/**
 * Cliente de discovery do Collabora (011/T-005). O Collabora publica em
 * `/hosting/discovery` (XML) o `urlsrc` do editor por tipo de arquivo. O app monta
 * a URL do iframe com `urlsrc + WOPISrc=<endpoint WOPI> + access_token`.
 *
 * Cacheado em memória (TTL) para não bater no Collabora a cada abertura.
 */
const DISCOVERY_TTL_MS = 10 * 60 * 1000;

let cache: { at: number; map: Record<string, string> } | null = null;

/** Extrai do XML de discovery o mapa `ext → urlsrc` (preferindo a action `edit`). */
export function parseDiscovery(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const editPreferred: Record<string, boolean> = {};
  const re = /<action\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] ?? '';
    const ext = /\bext="([^"]*)"/.exec(attrs)?.[1];
    const name = /\bname="([^"]*)"/.exec(attrs)?.[1];
    const urlsrc = /\burlsrc="([^"]*)"/.exec(attrs)?.[1];
    if (!ext || !urlsrc) continue;
    const isEdit = name === 'edit';
    if (!(ext in out) || (isEdit && !editPreferred[ext])) {
      out[ext] = urlsrc;
      editPreferred[ext] = isEdit;
    }
  }
  return out;
}

/** Limpa o cache (testes / troca de COLLABORA_URL). */
export function clearDiscoveryCache(): void {
  cache = null;
}

/** Resolve o `urlsrc` do editor para uma extensão (default `docx`). */
export async function getEditorUrlSrc(ext = 'docx', now = Date.now()): Promise<string> {
  if (!cache || now - cache.at > DISCOVERY_TTL_MS) {
    const base = process.env['COLLABORA_URL'];
    if (!base) throw new Error('COLLABORA_URL não configurado.');
    const res = await fetch(`${base.replace(/\/$/, '')}/hosting/discovery`);
    if (!res.ok) throw new Error(`discovery falhou: HTTP ${res.status}`);
    cache = { at: now, map: parseDiscovery(await res.text()) };
  }
  const urlsrc = cache.map[ext];
  if (!urlsrc) throw new Error(`Sem editor para .${ext} no discovery do Collabora.`);
  return urlsrc;
}
