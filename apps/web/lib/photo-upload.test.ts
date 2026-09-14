import { describe, expect, it, vi } from 'vitest';
import { uploadPhotos } from './photo-upload';

const photo = (name = 'vistoria.jpg') => new File(['jpeg'], name, { type: 'image/jpeg' });
const accepted = () => Response.json({ photoIds: ['saved-photo'] }, { status: 202 });

describe('uploadPhotos', () => {
  it('informa falha de rede e preserva o arquivo para nova tentativa', async () => {
    const file = photo();
    const result = await uploadPhotos('report', [file], vi.fn().mockRejectedValue(new TypeError('Falha de rede.')));
    expect(result.accepted).toBe(0);
    expect(result.retryFiles).toEqual([file]);
    expect(result.messages[0]).toContain('Falha de rede');
  });

  it.each([401, 413, 502])('HTTP %i com HTML não quebra a recuperação', async (status) => {
    const file = photo();
    const result = await uploadPhotos('report', [file], vi.fn().mockResolvedValue(new Response('<html>erro</html>', { status })));
    expect(result.retryFiles).toEqual([file]);
    expect(result.messages).toHaveLength(1);
  });

  it('timeout aborta envio e mantém seleção sem aguardar indefinidamente', async () => {
    const request = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const result = await uploadPhotos('report', [photo()], request, 10);
    expect(result.messages[0]).toContain('Tempo de envio esgotado');
  });

  it('mantém somente rejeitados em lote com sucesso parcial, incluindo nomes iguais', async () => {
    const first = photo(); const second = photo();
    const request = vi.fn().mockResolvedValueOnce(accepted()).mockResolvedValueOnce(Response.json({ photoIds: [], rejected: [{ reason: 'Arquivo inválido.' }] }, { status: 202 }));
    const result = await uploadPhotos('report', [first, second], request);
    expect(result.accepted).toBe(1);
    expect(result.retryFiles).toEqual([second]);
    expect(result.messages[0]).toContain('Arquivo inválido');
  });

  it('reutiliza o identificador após resposta perdida para evitar foto duplicada', async () => {
    const file = photo();
    const firstRequest = vi.fn().mockRejectedValue(new TypeError('offline'));
    await uploadPhotos('report', [file], firstRequest);
    const retry = vi.fn().mockResolvedValue(accepted());
    await uploadPhotos('report', [file], retry);
    const firstBody = firstRequest.mock.calls[0]?.[1]?.body as FormData;
    const retryBody = retry.mock.calls[0]?.[1]?.body as FormData;
    expect(retryBody.get('uploadIds')).toBe(firstBody.get('uploadIds'));
  });

  it('lote de 25 respeita Retry-After e conclui os arquivos além do limite de 20/minuto', async () => {
    let windowCount = 0;
    const ids: string[] = [];
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      ids.push((init?.body as FormData).get('uploadIds') as string);
      if (windowCount >= 20) return Response.json({ error: 'Aguarde a próxima janela.' }, {
        status: 429, headers: { 'Retry-After': '60' },
      });
      windowCount++;
      return accepted();
    });
    const delay = vi.fn(async () => { windowCount = 0; });
    const onWait = vi.fn();
    const result = await uploadPhotos('report', Array.from({ length: 25 }, (_, index) => photo(`${index}.jpg`)), request, 60_000, { delay, onWait });
    expect(result.accepted).toBe(25);
    expect(result.retryFiles).toEqual([]);
    expect(request).toHaveBeenCalledTimes(26);
    expect(delay).toHaveBeenCalledWith(60_000);
    expect(onWait).toHaveBeenCalledWith(60);
    expect(ids[20]).toBe(ids[21]);
    expect(new Set(ids).size).toBe(25);
  });

  it('limitação persistente tem tentativas limitadas e mantém arquivo para recuperação', async () => {
    const file = photo();
    const request = vi.fn(async () => Response.json({ error: 'Limite temporário.' }, { status: 429, headers: { 'Retry-After': '1' } }));
    const delay = vi.fn(async () => {});
    const result = await uploadPhotos('report', [file], request, 60_000, { delay });
    expect(request).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
    expect(result.retryFiles).toEqual([file]);
    expect(result.messages[0]).toContain('Limite temporário');
  });
});
