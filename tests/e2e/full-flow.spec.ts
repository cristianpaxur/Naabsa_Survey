import { test, expect, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * E2E do fluxo feliz COMPLETO (012/T-010, CA-007 — substitui o editor da 008).
 *
 * criar → upload → revisar (corrigir erro) → fotos (alocar) → editar no
 * COLLABORA (working.docx montado pelo worker + iframe WOPI) → aprovar
 * (Action_Save → snapshot → generate_pdf) → PDF gerado e baixável.
 *
 * Requer a stack rodando: web (APP_BASE_URL) + worker (LibreOffice) +
 * Supabase + Collabora (COLLABORA_BASE_URL/WOPI). A foto processada é semeada
 * via service role para isolar este teste do job process_photo (photos.spec).
 */

const OPERATOR = { email: 'operador@naabsa.dev', password: 'naabsa123' };
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const BUCKET = 'reports';

const createdIds: string[] = [];

function service(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('voce@naabsa.com.br').fill(OPERATOR.email);
  await page.getByPlaceholder('••••••••').fill(OPERATOR.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 25_000 });
}

/** Planilha draft_survey/discharge SEM B6 (survey_date) → erro a corrigir. */
async function buildDraftXlsxMissingDate(vessel: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DADOS');
  ws.getCell('A1').value = 'NAABSA-DRAFT';
  ws.getCell('B4').value = vessel;
  ws.getCell('B5').value = 150000;
  // B6 (survey_date) intencionalmente vazio → erro bloqueante na revisão.
  ws.getCell('B7').value = 'sim';
  ws.getCell('B8').value = 'Santos';
  return (await wb.xlsx.writeBuffer()) as Buffer;
}

async function jpeg(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 40, g: 70, b: 120 } },
  })
    .jpeg()
    .toBuffer();
}

/** Semeia 1 foto "processada" alocável para o relatório (status done). */
async function seedProcessedPhoto(svc: SupabaseClient, reportId: string) {
  const uuid = crypto.randomUUID();
  const processedPath = `${reportId}/photos/processed/${uuid}.jpg`;
  const thumbPath = `${reportId}/photos/thumbs/${uuid}.jpg`;
  const buf = await jpeg(1200, 900);
  await svc.storage.from(BUCKET).upload(processedPath, buf, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  await svc.storage.from(BUCKET).upload(thumbPath, buf, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  await svc.from('report_photos').insert({
    report_id: reportId,
    original_path: `${reportId}/photos/original/${uuid}.jpg`,
    processed_path: processedPath,
    thumb_path: thumbPath,
    status: 'done',
    slot_id: null,
  } as never);
}

test.afterAll(async () => {
  const svc = service();
  for (const id of createdIds) {
    await svc.storage.from(BUCKET).list(`${id}/photos/processed`).then(async ({ data }) => {
      if (data && data.length > 0) {
        await svc.storage
          .from(BUCKET)
          .remove(data.map((f) => `${id}/photos/processed/${f.name}`));
      }
    });
    await svc.storage.from(BUCKET).list(`${id}/snapshots`).then(async ({ data }) => {
      if (data && data.length > 0) {
        await svc.storage.from(BUCKET).remove(data.map((f) => `${id}/snapshots/${f.name}`));
      }
    });
    await svc.storage
      .from(BUCKET)
      .remove([
        `${id}/final.pdf`,
        `${id}/final-v1.pdf`,
        `${id}/final.docx`,
        `${id}/working.docx`,
        `${id}/preview.pdf`,
        `${id}/spreadsheet.xlsx`,
      ]);
    await svc.from('report_photos').delete().eq('report_id', id);
    await svc.from('audit_log').delete().eq('report_id', id);
    await svc.from('reports').delete().eq('id', id);
  }
});

test.describe('Fluxo feliz completo com Collabora (012/T-010, CA-007)', () => {
  test('criar → revisar → fotos → editar no Collabora → aprovar → PDF gerado e baixável', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const svc = service();
    await login(page);

    // ── 1. Criar relatório + upload da planilha ───────────────────────────
    await page.goto('/reports/new');
    await page.getByRole('button').filter({ hasText: 'Draft Survey' }).click();
    await page.getByRole('button', { name: 'Descarga', exact: true }).click();
    await page.getByRole('button', { name: /Continuar para planilha/ }).click();

    const vessel = `MV FULLFLOW ${Date.now()}`;
    const buffer = await buildDraftXlsxMissingDate(vessel);
    await page.locator('input[type=file]').setInputFiles({
      name: 'draft.xlsx',
      mimeType: XLSX_MIME,
      buffer,
    });
    await page.getByRole('button', { name: 'Extrair dados' }).click();

    await expect(page).toHaveURL(/\/reports\/[0-9a-f-]+\/review$/, {
      timeout: 45_000,
    });
    const reportId = /reports\/([^/]+)\/review/.exec(page.url())?.[1] ?? '';
    expect(reportId).toBeTruthy();
    createdIds.push(reportId);

    // ── 2. Revisão: corrigir o erro (survey_date vazio) ───────────────────
    await expect(page.getByText('Revisão de dados')).toBeVisible({ timeout: 15_000 });
    const confirmBtn = page.getByRole('button', { name: /Confirmar dados/ });
    await expect(confirmBtn).toBeDisabled();

    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.fill('2026-06-01');
    await dateInput.blur();
    await expect(confirmBtn).toBeEnabled({ timeout: 10_000 });
    await confirmBtn.click();

    await expect(page).toHaveURL(/\/reports\/.+\/photos$/, { timeout: 15_000 });

    // ── 3. Fotos: semear foto processada, alocar e avançar ────────────────
    await expect(page.getByRole('heading', { name: 'Fotos' })).toBeVisible({
      timeout: 20_000,
    });
    await seedProcessedPhoto(svc, reportId);
    await page.reload();
    await expect(page.locator('[data-photo-id]').first()).toBeVisible({
      timeout: 20_000,
    });

    // Seleciona a foto e aloca no slot obrigatório.
    await page.locator('[data-photo-id]').first().click();
    await page.getByText('Alocar', { exact: true }).first().click();
    await page.waitForTimeout(800);

    const advance = page.getByRole('button', { name: /Avançar para edição/ });
    await expect(advance).toBeEnabled({ timeout: 15_000 });
    await advance.click();
    await expect(page).toHaveURL(new RegExp(`/reports/${reportId}/edit$`), {
      timeout: 20_000,
    });

    // ── 4. Editor nativo Collabora (012): build do working.docx + iframe ──
    await expect(page.getByRole('heading', { name: vessel })).toBeVisible({
      timeout: 20_000,
    });
    // O worker monta o working.docx (build_working_docx, com LibreOffice no
    // 2º passe) e o CollaboraEditor abre o iframe WOPI quando ele existe.
    await expect(page.locator('iframe.ed-collabora')).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText(/Edição nativa/)).toBeVisible();

    // working.docx persistido no Storage (012 RF-001).
    const { data: wdFiles } = await svc.storage
      .from(BUCKET)
      .list(reportId, { search: 'working.docx' });
    expect((wdFiles ?? []).some((f) => f.name === 'working.docx')).toBe(true);

    // ── 5. Aprovar: Action_Save → editing→approved → snapshot → generate_pdf ──
    await page.getByRole('button', { name: 'Aprovar e gerar PDF' }).click();
    // Preview com badge de geração (o Action_Save pode levar alguns segundos).
    await expect(page.getByText(/Gerando PDF|PDF pronto/)).toBeVisible({
      timeout: 30_000,
    });
    // Worker converte o working.docx EDITADO (generate_pdf) → badge "PDF pronto".
    await expect(page.getByText(/PDF pronto/)).toBeVisible({ timeout: 120_000 });

    // Snapshot binário da aprovação no Storage (012/T-007).
    const { data: snaps } = await svc.storage.from(BUCKET).list(`${reportId}/snapshots`);
    expect((snaps ?? []).some((f) => /^aprovacao-v\d+\.docx$/.test(f.name))).toBe(true);

    const baixar = page.getByRole('button', { name: /Baixar PDF/ });
    await expect(baixar).toBeEnabled();

    // ── 6. Verificação no banco ───────────────────────────────────────────
    const { data: report } = await svc
      .from('reports')
      .select('status, document_hash, pdf_paths')
      .eq('id', reportId)
      .single();
    const r = report as {
      status: string;
      document_hash: string | null;
      pdf_paths: string[] | null;
    };
    expect(r.status).toBe('generated');
    expect(r.document_hash).toBeTruthy();
    expect((r.pdf_paths ?? []).length).toBeGreaterThanOrEqual(1);

    const { data: logs } = await svc
      .from('audit_log')
      .select('action')
      .eq('report_id', reportId);
    const actions = (logs ?? []).map((l: { action: string }) => l.action);
    expect(actions).toContain('working_docx_enqueued');
    expect(actions).toContain('document_snapshot');
    expect(actions).toContain('pdf_enqueued');
    expect(actions).toContain('transition');
    expect(actions).toContain('pdf_generated');
  });
});
