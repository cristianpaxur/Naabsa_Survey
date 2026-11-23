export interface PhotoUploadResult {
  accepted: number;
  retryFiles: File[];
  messages: string[];
}

const uploadIds = new WeakMap<File, string>();

/** Uma requisição por arquivo limita tamanho total e preserva sucesso parcial. */
export async function uploadPhotos(
  reportId: string,
  files: File[],
  transport: typeof fetch = fetch,
  timeoutMs = 60_000,
  options: { onWait?: (seconds: number | null) => void; delay?: (milliseconds: number) => Promise<void> } = {},
): Promise<PhotoUploadResult> {
  const result: PhotoUploadResult = { accepted: 0, retryFiles: [], messages: [] };
  for (const file of files) {
    let uploadId = uploadIds.get(file);
    if (!uploadId) { uploadId = crypto.randomUUID(); uploadIds.set(file, uploadId); }
    // Uma janela esgotada não transforma os demais arquivos do lote em rejeitados.
    // No máximo três envios por arquivo; cada request tem seu próprio timeout.
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const form = new FormData();
        form.append('files', file);
        form.append('uploadIds', uploadId);
        const response = await transport(`/api/reports/${reportId}/photos`, {
          method: 'POST', body: form, signal: controller.signal,
        });
        const body = await response.json().catch(() => null) as {
          photoIds?: string[]; rejected?: { reason: string }[]; error?: string;
        } | null;
        if (response.status === 429 && attempt < 2) {
          const header = response.headers.get('Retry-After');
          const seconds = header && /^\d+(?:\.\d+)?$/.test(header) ? Number(header)
            : header ? (Date.parse(header) - Date.now()) / 1000 : 1;
          const waitMs = Math.max(250, Number.isFinite(seconds) ? seconds * 1000 : 1000);
          if (waitMs <= 65_000) {
            clearTimeout(timer);
            options.onWait?.(Math.ceil(waitMs / 1000));
            await (options.delay ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(waitMs);
            options.onWait?.(null);
            continue;
          }
        }
        if (!response.ok || !body?.photoIds?.length) {
          const fallback = response.status === 401 ? 'Sessão expirada. Entre novamente.'
            : response.status === 413 ? 'Arquivo acima do limite permitido.'
            : `Falha no envio (HTTP ${response.status}). Tente novamente.`;
          throw new Error(body?.error || body?.rejected?.[0]?.reason || fallback);
        }
        result.accepted++;
      } catch (err) {
        result.retryFiles.push(file);
        result.messages.push(`${file.name}: ${controller.signal.aborted ? 'Tempo de envio esgotado. Tente novamente.'
          : err instanceof Error ? err.message : 'Falha de rede. Tente novamente.'}`);
      } finally {
        clearTimeout(timer);
        options.onWait?.(null);
      }
      break;
    }
  }

  return result;
}
