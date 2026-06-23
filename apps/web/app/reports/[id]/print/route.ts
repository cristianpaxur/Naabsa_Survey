/**
 * GET /reports/[id]/print — rota de impressão (004/T-006, ampliada na 008/T-007).
 *
 * Dois consumidores:
 *  - worker pg-boss (Playwright): autentica por PRINT_SERVICE_TOKEN (CA-005).
 *  - operador (preview no editor): autentica por sessão; o RLS garante que só
 *    vê o próprio relatório (RNF-02 — preview = PDF pela MESMA rota).
 *
 * Sem token nem sessão → 401. Relatório inexistente/sem documento → 404.
 * Os caminhos de foto no document_json são resolvidos para URLs assinadas
 * frescas no render (lib/print-resolve).
 */

import 'server-only';
import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolvePhotoUrls } from '@/lib/print-resolve';
import { PrintDocument } from '@/components/print/PrintDocument';
import type { TipTapDoc } from '@naabsa/core';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── Autenticação: token de serviço OU sessão do operador ──────────────────
  const serviceToken = process.env.PRINT_SERVICE_TOKEN ?? '';
  const tokenParam =
    request.nextUrl.searchParams.get('token') ??
    request.headers.get('x-print-token') ??
    '';
  const tokenOk = serviceToken !== '' && tokenParam === serviceToken;

  type ReportLite = { vessel_name: string | null; document_json: unknown };
  let report: ReportLite | null = null;

  if (tokenOk) {
    // Modo worker: service role (ignora RLS).
    const svc = createServiceClient();
    const { data } = await svc
      .from('reports')
      .select('vessel_name, document_json')
      .eq('id', id)
      .single();
    report = data as ReportLite | null;
  } else {
    // Modo operador: exige sessão; RLS restringe ao dono.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response('Não autorizado.', { status: 401 });
    }
    const { data } = await supabase
      .from('reports')
      .select('vessel_name, document_json')
      .eq('id', id)
      .maybeSingle();
    report = data as ReportLite | null;
  }

  if (!report?.document_json) {
    return new Response('Relatório não encontrado ou sem documento gerado.', {
      status: 404,
    });
  }

  // ── Resolver caminhos de foto → URLs assinadas (service role p/ assinar) ──
  const rawDoc = report.document_json as unknown as TipTapDoc;
  const documentJson = await resolvePhotoUrls(rawDoc, createServiceClient());
  const vesselName = report.vessel_name as string | null;

  // ── Render do componente React ───────────────────────────────────────────
  // Import dinâmico de react-dom/server: evita o erro do App Router (Next 15)
  // "importing a component that imports react-dom/server" na análise estática.
  const { renderToStaticMarkup } = await import('react-dom/server');
  const body = renderToStaticMarkup(
    PrintDocument({
      document: documentJson,
      vesselName: vesselName ?? undefined,
    }),
  );

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${vesselName ? `${vesselName} — Relatório NAABSA` : 'Relatório NAABSA'}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Public+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    ${printCssInline}
  </style>
</head>
<body>
  ${body}
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

/**
 * CSS de impressão A4 inlinado no HTML para garantir que o worker Playwright
 * não precise carregar recursos externos ao gerar o PDF.
 * SINCRONIZADO com apps/web/components/print/print.css (T-013).
 */
const printCssInline = `
:root {
  --print-navy: #16294d;
  --print-vermelho: #bf2c30;
  --print-rocha: #7d7468;
  --print-tinta: #151515;
  --print-papel: #ffffff;
  --print-borda: #d0ccc6;
  --font-sans: 'Public Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
}

@page {
  size: A4 portrait;
  margin: 20mm 20mm 28mm 20mm;
  @top-right {
    font-family: var(--font-sans); font-size: 7.5pt; font-weight: 700;
    color: var(--print-navy); content: 'NAABSA Marine Surveyors'; letter-spacing: 0.04em;
  }
  @bottom-center {
    font-family: var(--font-sans); font-size: 8pt; color: var(--print-rocha);
    content: 'NAABSA  ·  PÁGINA ' counter(page) ' DE ' counter(pages); letter-spacing: 0.04em;
  }
}
@page :first { @top-right { content: ''; } }

*, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: white; color: var(--print-tinta);
  font-family: var(--font-sans); font-size: 10pt; line-height: 1.5; }

.print-naabsa-header { display: flex; justify-content: space-between; align-items: flex-end;
  max-width: 170mm; margin: 0 auto 16pt; padding-bottom: 8pt;
  border-bottom: 2pt solid var(--print-navy); break-inside: avoid; break-after: avoid; }
.print-naabsa-identity { display: flex; flex-direction: column; }
.print-naabsa-name { font-family: var(--font-sans); font-size: 22pt; font-weight: 800;
  color: var(--print-vermelho); letter-spacing: -0.02em; line-height: 1; }
.print-naabsa-tagline { font-family: var(--font-sans); font-size: 9pt; font-weight: 600;
  color: var(--print-navy); text-transform: uppercase; letter-spacing: 0.12em; margin-top: 2pt; }
.print-naabsa-contact { font-family: var(--font-sans); font-size: 7.5pt;
  color: var(--print-rocha); text-align: right; line-height: 1.6; }

.print-document { font-family: var(--font-sans); font-size: 10pt; line-height: 1.5;
  color: var(--print-tinta); background: var(--print-papel); max-width: 170mm; margin: 0 auto; padding: 0 16px; }

.print-document h1 { font-size: 18pt; font-weight: 800; color: var(--print-tinta);
  letter-spacing: -0.02em; margin: 0 0 8pt; break-after: avoid; }
.print-document h2 { font-size: 11pt; font-weight: 700; color: var(--print-navy);
  text-transform: uppercase; letter-spacing: 0.06em; margin: 20pt 0 6pt;
  padding-bottom: 3pt; border-bottom: 1.5pt solid var(--print-navy); break-after: avoid; }
.print-document h3 { font-size: 9.5pt; font-weight: 700; color: var(--print-navy);
  margin: 12pt 0 3pt; break-after: avoid; }
.print-document p { margin: 0 0 5pt; text-align: justify; hyphens: auto; }

.print-data-field { font-family: var(--font-mono); font-size: 9.5pt;
  color: var(--print-navy); font-weight: 600; }

.print-data-table { width: 100%; border-collapse: collapse; font-family: var(--font-sans);
  font-size: 9pt; break-inside: avoid; margin-bottom: 8pt; }
.print-data-table th { background: var(--print-navy); color: #fff; font-weight: 700;
  font-size: 8.5pt; text-align: left; padding: 4pt 6pt; border: 0.5pt solid var(--print-navy); }
.print-data-table td { padding: 3pt 6pt; border: 0.5pt solid var(--print-borda);
  vertical-align: top; font-family: var(--font-mono); font-size: 8.5pt; }
.print-data-table tr:nth-child(even) td { background: #f5f3f0; }
.print-data-table--label td:first-child { font-family: var(--font-sans); font-weight: 600;
  color: var(--print-navy); background: #f0ede8; white-space: nowrap; }

.print-photo-frame { break-inside: avoid; margin-bottom: 10pt; display: block; }
.print-photo-frame img { display: block; object-fit: cover; width: 100%; height: 100%; }
.print-photo-placeholder { display: flex; align-items: center; justify-content: center;
  background: #f0ede8; border: 1.5pt dashed var(--print-borda);
  color: var(--print-rocha); font-size: 8pt; font-style: italic; }
`;
