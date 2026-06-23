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
      // Worker (token) recebe cabeçalho/rodapé por página via Playwright; o
      // preview do operador (sessão) renderiza o cabeçalho no fluxo.
      showInFlowHeader: !tokenOk,
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
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Roboto+Slab:wght@500;600;700&display=swap" rel="stylesheet" />
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
  --naabsa-navy: #002060;
  --print-navy: #16294d;
  --print-vermelho: #bf2c30;
  --print-rocha: #7d7468;
  --print-tinta: #151515;
  --print-cinza: #7f7f7f;
  --print-papel: #ffffff;
  --print-borda: #d0ccc6;
  --font-sans: 'Calibri', 'Carlito', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-slab: 'Roboto Slab', 'Rockwell', Georgia, serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
}

@page { size: A4 portrait; margin: 18mm 18mm 24mm 18mm; }

*, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: white; color: var(--print-tinta);
  font-family: var(--font-sans); font-size: 11pt; line-height: 1.4; }

.print-naabsa-header { display: flex; align-items: flex-end; justify-content: space-between;
  max-width: 174mm; margin: 0 auto 2pt; padding-bottom: 4pt;
  border-bottom: 1pt solid var(--naabsa-navy); break-inside: avoid; }
.print-naabsa-logo { height: 11mm; width: auto; display: block; }
.print-naabsa-tag { text-align: right; font-family: var(--font-slab); color: var(--naabsa-navy); }
.print-naabsa-tag-main { font-size: 18pt; font-weight: 600; letter-spacing: 0.01em; line-height: 1.05; }
.print-naabsa-tag-sub { font-size: 10pt; font-weight: 500; }

.print-cover-address { display: flex; justify-content: space-around; gap: 24pt;
  max-width: 174mm; margin: 8pt auto 16pt; font-family: var(--font-sans); font-size: 9.5pt;
  line-height: 1.35; color: var(--print-tinta); text-align: center; break-inside: avoid; }

.print-document { font-family: var(--font-sans); font-size: 11pt; line-height: 1.4;
  color: var(--print-tinta); background: var(--print-papel); max-width: 174mm; margin: 0 auto; padding: 0; }

.print-document h1 { font-size: 34pt; font-weight: 800; color: var(--print-tinta);
  text-align: center; margin: 14pt 0 10pt; letter-spacing: -0.01em; break-after: avoid; }
.print-document h2 { font-size: 13pt; font-weight: 700; color: var(--print-tinta);
  margin: 16pt 0 6pt; break-after: avoid; }
.print-document h3 { font-size: 11pt; font-weight: 700; color: var(--print-tinta);
  margin: 10pt 0 3pt; break-after: avoid; }
.print-document h2[style*='center'] { font-size: 26pt; font-weight: 800; color: var(--print-tinta);
  letter-spacing: normal; margin: 6pt 0; }
.print-document h3[style*='center'] { font-size: 20pt; font-weight: 800; color: var(--print-tinta); margin: 6pt 0 0; }
.print-document p { margin: 0 0 5pt; }
.print-document p[style*='center'] { margin: 1pt 0; }

.print-data-field { font-family: inherit; font-size: inherit; color: inherit; font-weight: inherit; }

.print-data-table { width: 100%; border-collapse: collapse; font-family: var(--font-sans);
  font-size: 9.5pt; break-inside: avoid; margin: 4pt 0 8pt; }
.print-data-table th { background: var(--naabsa-navy); color: #fff; font-weight: 700;
  font-size: 9pt; text-align: left; padding: 3pt 6pt; border: 0.5pt solid var(--naabsa-navy); }
.print-data-table td { padding: 2.5pt 6pt; border: 0.5pt solid var(--print-borda);
  vertical-align: top; font-family: var(--font-mono); font-size: 9pt; }
.print-data-table tr:nth-child(even) td { background: #f5f5f7; }
.print-data-table--label td { font-family: var(--font-sans); font-size: 10pt; }
.print-data-table--label td:first-child { font-weight: 600;
  color: var(--print-tinta); background: transparent; white-space: nowrap; width: 38%; }
.print-data-table--label tr:nth-child(even) td { background: transparent; }
.print-data-table--grid { font-size: 7.5pt; table-layout: fixed; }
.print-data-table--grid td { border: 0.4pt solid #bfbfbf; padding: 1pt 3pt; font-family: var(--font-mono);
  font-size: 7.5pt; text-align: right; color: var(--print-tinta); background: #fff;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.print-data-table--grid tr:first-child td { background: #dce6f1; font-family: var(--font-sans);
  font-weight: 700; text-align: center; color: var(--naabsa-navy); }

.print-photo-frame { break-inside: avoid; margin: 6pt auto 10pt; display: block; }
.print-photo-frame img { display: block; object-fit: cover; width: 100%; height: 100%; }
.print-photo-placeholder { display: flex; align-items: center; justify-content: center;
  background: #f0ede8; border: 1pt dashed var(--print-borda);
  color: var(--print-rocha); font-size: 9pt; font-style: italic; }
`;
