/**
 * GET /reports/[id]/print?token=… — rota de impressão (004/T-006).
 *
 * Consumida EXCLUSIVAMENTE pelo worker pg-boss via Playwright.
 * Protegida por PRINT_SERVICE_TOKEN (CA-005): retorna 401 sem token válido.
 * Retorna 404 se o relatório não existir ou não tiver document_json.
 *
 * Não herda o layout do grupo (app) — a rota fica fora do grupo.
 */

import 'server-only';
import { type NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServiceClient } from '@/lib/supabase/service';
import { PrintDocument } from '@/components/print/PrintDocument';
import type { TipTapDoc } from '@naabsa/core';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Autenticação por token de serviço (CA-005) ───────────────────────────
  const serviceToken = process.env.PRINT_SERVICE_TOKEN ?? '';
  if (!serviceToken) {
    return new Response('Serviço de impressão não configurado.', { status: 503 });
  }

  const tokenParam =
    request.nextUrl.searchParams.get('token') ??
    request.headers.get('x-print-token') ??
    '';

  if (tokenParam !== serviceToken) {
    return new Response('Não autorizado.', { status: 401 });
  }

  // ── Carregar documento ───────────────────────────────────────────────────
  const { id } = await params;
  const svc = createServiceClient();

  const { data: report } = await svc
    .from('reports')
    .select('vessel_name, document_json')
    .eq('id', id)
    .single();

  if (!report?.document_json) {
    return new Response('Relatório não encontrado ou sem documento gerado.', { status: 404 });
  }

  const documentJson = report.document_json as unknown as TipTapDoc;
  const vesselName = report.vessel_name as string | null;

  // ── Render do componente React ───────────────────────────────────────────
  const body = renderToStaticMarkup(
    PrintDocument({ document: documentJson, vesselName: vesselName ?? undefined }),
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
 * O arquivo fonte é apps/web/components/print/print.css.
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
}

*, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

html, body { margin: 0; padding: 0; background: white; color: var(--print-tinta);
  font-family: var(--font-sans); font-size: 10pt; line-height: 1.5; }

.print-document { font-family: var(--font-sans); font-size: 10pt; line-height: 1.5;
  color: var(--print-tinta); background: var(--print-papel); max-width: 170mm; margin: 0 auto; padding: 16px; }

.print-document h1 { font-size: 16pt; font-weight: 800; color: var(--print-vermelho);
  letter-spacing: -0.02em; margin: 0 0 4pt; break-after: avoid; }
.print-document h2 { font-size: 12pt; font-weight: 700; color: var(--print-navy);
  margin: 0 0 10pt; break-after: avoid; }
.print-document h3 { font-size: 10pt; font-weight: 700; color: var(--print-navy);
  text-transform: uppercase; letter-spacing: 0.06em; margin: 12pt 0 4pt;
  border-bottom: 1.5pt solid var(--print-navy); padding-bottom: 2pt; break-after: avoid; }
.print-document p { margin: 0 0 4pt; }

.print-data-field { font-family: var(--font-mono); font-size: 9.5pt;
  color: var(--print-navy); font-weight: 600; }

.print-data-table { width: 100%; border-collapse: collapse; font-size: 9pt;
  break-inside: avoid; margin-bottom: 8pt; }
.print-data-table th { background: var(--print-navy); color: #fff; font-weight: 700;
  font-size: 8.5pt; text-align: left; padding: 4pt 6pt; border: 0.5pt solid var(--print-navy); }
.print-data-table td { padding: 3pt 6pt; border: 0.5pt solid var(--print-borda);
  vertical-align: top; font-family: var(--font-mono); font-size: 8.5pt; }
.print-data-table tr:nth-child(even) td { background: #f5f3f0; }

.print-photo-frame { break-inside: avoid; margin-bottom: 8pt; display: block; }
.print-photo-frame img { display: block; object-fit: cover; width: 100%; height: 100%; }
.print-photo-placeholder { display: flex; align-items: center; justify-content: center;
  background: #f0ede8; border: 1.5pt dashed var(--print-borda);
  color: var(--print-rocha); font-size: 8pt; font-style: italic; }
`;
