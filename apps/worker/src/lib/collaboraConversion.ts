/**
 * Conversão DOCX → PDF pelo mesmo Collabora Online usado no editor.
 *
 * Usar o endpoint de conversão do Collabora evita que o preview seja paginado
 * por uma versão diferente do LibreOffice instalada no container do worker.
 */

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function collaboraConversionUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const base = (
    env['COLLABORA_CONVERSION_URL'] ?? env['COLLABORA_URL'] ?? ''
  ).trim();
  if (!base) return null;

  const url = new URL(base);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL do conversor Collabora deve usar HTTP ou HTTPS.');
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/cool/convert-to/pdf`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export async function convertDocxToPdfWithCollabora(
  docx: Buffer,
  endpoint: string,
): Promise<Buffer> {
  const form = new FormData();
  form.append(
    'data',
    new Blob([new Uint8Array(docx)], { type: DOCX_MIME }),
    'report.docx',
  );

  const response = await fetch(endpoint, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`Collabora respondeu HTTP ${response.status}.`);
  }

  const pdf = Buffer.from(await response.arrayBuffer());
  if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('Collabora não retornou um PDF válido.');
  }
  return pdf;
}
