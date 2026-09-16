import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collaboraConversionUrl,
  convertDocxToPdfWithCollabora,
} from './collaboraConversion';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('collaboraConversionUrl', () => {
  it('prefere a URL interna dedicada e monta o endpoint PDF', () => {
    expect(
      collaboraConversionUrl({
        COLLABORA_CONVERSION_URL: 'http://collabora:9980/',
        COLLABORA_URL: 'https://office.example.test',
      }),
    ).toBe('http://collabora:9980/cool/convert-to/pdf');
  });

  it('usa COLLABORA_URL como fallback e aceita ausência de configuração', () => {
    expect(
      collaboraConversionUrl({ COLLABORA_URL: 'https://office.example.test' }),
    ).toBe('https://office.example.test/cool/convert-to/pdf');
    expect(collaboraConversionUrl({})).toBeNull();
  });
});

describe('convertDocxToPdfWithCollabora', () => {
  it('envia o DOCX por multipart e devolve somente um PDF válido', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      const form = init?.body as FormData;
      const file = form.get('data') as Blob;
      expect(file.type).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(file.size).toBe(4);
      return new Response(Buffer.from('%PDF-valid'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const pdf = await convertDocxToPdfWithCollabora(
      Buffer.from('DOCX'),
      'http://collabora:9980/cool/convert-to/pdf',
    );

    expect(pdf.toString()).toBe('%PDF-valid');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejeita erro HTTP e resposta que não seja PDF', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })));
    await expect(
      convertDocxToPdfWithCollabora(
        Buffer.from('DOCX'),
        'http://collabora:9980/cool/convert-to/pdf',
      ),
    ).rejects.toThrow('HTTP 403');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-a-pdf')));
    await expect(
      convertDocxToPdfWithCollabora(
        Buffer.from('DOCX'),
        'http://collabora:9980/cool/convert-to/pdf',
      ),
    ).rejects.toThrow('PDF válido');
  });
});
