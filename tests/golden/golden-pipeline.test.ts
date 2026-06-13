/**
 * Golden test — pipeline extrai → monta → renderiza (004/T-009, CA-004).
 *
 * Este teste cobre a parte determinística do pipeline sem necessitar de
 * Chromium ou servidor rodando. Valida que:
 *   - O builder produz o JSON TipTap determinístico dado os mesmos inputs.
 *   - O HTML renderizado contém os dados esperados.
 *   - O resultado é estável (snapshot) — qualquer regressão em core/content/
 *     é detectada.
 *
 * O teste de PDF completo (CA-004 definitivo: diff ≤ 0,5% de pixels) requer o
 * worker com Playwright e é executado manualmente via `pnpm golden:generate`.
 * Ver tests/golden/draft_survey.discharge/README.md.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { runExtraction } from '../../packages/core/src/extractor';
import { buildDraftSurvey } from '../../packages/core/src/document-builder/draft_survey';
import { PrintDocument } from '../../apps/web/components/print/PrintDocument';
import {
  sampleSpec,
  buildCompleteWorkbook,
} from '../../packages/core/src/extractor/synthFixtures';
import type { TipTapDoc } from '../../packages/core/src/document-builder/nodes';
import type { PhotoAlloc } from '../../packages/core/src/document-builder/types';

describe('Golden pipeline — draft_survey.discharge', () => {
  it('extrai os dados da fixture sintética sem erros de nível error', async () => {
    const wb = buildCompleteWorkbook();
    const result = await runExtraction(wb, sampleSpec, 'discharge');
    const errors = result.issues.filter((i) => i.level === 'error');
    expect(errors).toHaveLength(0);
    expect(result.data['vessel_name']).toBe('MV Cabo Frio');
    expect(result.data['survey_date']).toBe('2026-06-06');
    expect(result.data['disch_port']).toBe('Tubarão');
  });

  it('builder produz doc TipTap determinístico (snapshot — CA-001)', async () => {
    const wb = buildCompleteWorkbook();
    const { data } = await runExtraction(wb, sampleSpec, 'discharge');

    const photos: PhotoAlloc[] = [
      { slotId: 'draft_fwd', photoId: 'golden-photo-1', src: 'https://cdn.example.com/golden.jpg' },
    ];

    const doc = buildDraftSurvey({ spec: sampleSpec, variant: 'discharge', data, photos });

    expect(doc.type).toBe('doc');
    expect(doc).toMatchSnapshot('draft_survey.discharge.json');
  });

  it('HTML renderizado contém os dados do navio e porto', async () => {
    const wb = buildCompleteWorkbook();
    const { data } = await runExtraction(wb, sampleSpec, 'discharge');
    const doc = buildDraftSurvey({
      spec: sampleSpec,
      variant: 'discharge',
      data,
      photos: [],
    }) as TipTapDoc;

    const html = renderToStaticMarkup(
      PrintDocument({ document: doc, vesselName: 'MV Cabo Frio' }),
    );

    expect(html).toContain('MV Cabo Frio');
    expect(html).toContain('Tubarão');
    expect(html).toContain('DESCARGA');
    expect(html).toContain('NAABSA');
  });

  it('HTML renderizado sem foto exibe placeholder de erro visível', async () => {
    const wb = buildCompleteWorkbook();
    const { data } = await runExtraction(wb, sampleSpec, 'discharge');
    const doc = buildDraftSurvey({
      spec: sampleSpec,
      variant: 'discharge',
      data,
      photos: [], // sem foto
    }) as TipTapDoc;

    const html = renderToStaticMarkup(
      PrintDocument({ document: doc }),
    );

    // Foto ausente deve exibir placeholder (princípio: não gerar PDF com buraco invisível)
    expect(html).toContain('print-photo-placeholder');
    expect(html).toContain('Foto não disponível');
  });

  it('HTML renderizado com foto inclui a tag img com src correto', async () => {
    const wb = buildCompleteWorkbook();
    const { data } = await runExtraction(wb, sampleSpec, 'discharge');
    const photos: PhotoAlloc[] = [
      { slotId: 'draft_fwd', photoId: 'p1', src: 'https://cdn.example.com/photo.jpg' },
    ];
    const doc = buildDraftSurvey({
      spec: sampleSpec,
      variant: 'discharge',
      data,
      photos,
    }) as TipTapDoc;

    const html = renderToStaticMarkup(PrintDocument({ document: doc }));
    expect(html).toContain('https://cdn.example.com/photo.jpg');
    expect(html).not.toContain('print-photo-placeholder');
  });
});
