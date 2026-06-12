import { test, expect, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const OPERATOR = { email: 'operador@naabsa.dev', password: 'naabsa123' };
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

/** Planilha draft_survey alinhada ao spec sintético seedado (NAABSA-DRAFT). */
async function buildDraftXlsx(vessel: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DADOS');
  ws.getCell('A1').value = 'NAABSA-DRAFT';
  ws.getCell('B4').value = vessel;
  ws.getCell('B5').value = 150000;
  ws.getCell('B6').value = new Date(Date.UTC(2026, 5, 6));
  ws.getCell('B7').value = 'sim';
  ws.getCell('B8').value = 'Santos';
  return (await wb.xlsx.writeBuffer()) as Buffer;
}

/** Planilha ROB (tipo sem variante) alinhada ao spec seedado (NAABSA-ROB). */
async function buildRobXlsx(vessel: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DADOS');
  ws.getCell('A1').value = 'NAABSA-ROB';
  ws.getCell('B4').value = vessel;
  ws.getCell('B5').value = 320.5;
  ws.getCell('B6').value = new Date(Date.UTC(2026, 5, 6));
  return (await wb.xlsx.writeBuffer()) as Buffer;
}

test.afterAll(async () => {
  const svc = service();
  for (const id of createdIds) {
    await svc.storage.from('reports').remove([`${id}/spreadsheet.xlsx`]);
    await svc.from('audit_log').delete().eq('report_id', id);
    await svc.from('reports').delete().eq('id', id);
  }
});

test.describe('Criação de relatório (T-12)', () => {
  test('cria draft_survey, faz upload e chega a extracted', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/reports/new');

    await page.getByRole('button').filter({ hasText: 'Draft Survey' }).click();
    await page.getByRole('button', { name: 'Descarga', exact: true }).click();
    await page.getByRole('button', { name: /Continuar para planilha/ }).click();

    const vessel = `MV E2E ${Date.now()}`;
    const buffer = await buildDraftXlsx(vessel);
    await page.locator('input[type=file]').setInputFiles({
      name: 'draft.xlsx',
      mimeType: XLSX_MIME,
      buffer,
    });
    await page.getByRole('button', { name: 'Extrair dados' }).click();

    await expect(page).toHaveURL(/\/reports\/[0-9a-f-]+\/review$/, {
      timeout: 45_000,
    });

    const match = /reports\/([^/]+)\/review/.exec(page.url());
    const id = match?.[1];
    expect(id).toBeTruthy();
    if (!id) return;
    createdIds.push(id);

    // Verificação no banco: status extracted + vessel + trilha de auditoria.
    const svc = service();
    const { data: report } = await svc
      .from('reports')
      .select('status, vessel_name, variant')
      .eq('id', id)
      .single();
    expect(report?.status).toBe('extracted');
    expect(report?.vessel_name).toBe(vessel);
    expect(report?.variant).toBe('discharge');

    const { data: logs } = await svc
      .from('audit_log')
      .select('action')
      .eq('report_id', id);
    const actions = (logs ?? []).map((l: { action: string }) => l.action);
    expect(actions).toContain('create');
    expect(actions).toContain('upload');
    expect(actions).toContain('extraction');
    expect(actions).toContain('transition');
  });

  test('variante obrigatória bloqueia o avanço do wizard (CA-005)', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/reports/new');

    await page.getByRole('button').filter({ hasText: 'Draft Survey' }).click();
    // Sem variante escolhida, "Continuar" fica desabilitado.
    const continuar = page.getByRole('button', {
      name: /Continuar para planilha/,
    });
    await expect(continuar).toBeDisabled();
    // Após escolher a variante, habilita.
    await page.getByRole('button', { name: 'Descarga', exact: true }).click();
    await expect(continuar).toBeEnabled();
  });

  test('cria rob (sem variante), faz upload e chega a extracted', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/reports/new');

    // Tipo sem variantes: sem etapa de variante, "Continuar" já habilita.
    await page.getByRole('button').filter({ hasText: 'ROB' }).click();
    await page.getByRole('button', { name: /Continuar para planilha/ }).click();

    const vessel = `MV ROB ${Date.now()}`;
    const buffer = await buildRobXlsx(vessel);
    await page.locator('input[type=file]').setInputFiles({
      name: 'rob.xlsx',
      mimeType: XLSX_MIME,
      buffer,
    });
    await page.getByRole('button', { name: 'Extrair dados' }).click();

    await expect(page).toHaveURL(/\/reports\/[0-9a-f-]+\/review$/, {
      timeout: 45_000,
    });

    const match = /reports\/([^/]+)\/review/.exec(page.url());
    const id = match?.[1];
    expect(id).toBeTruthy();
    if (!id) return;
    createdIds.push(id);

    const svc = service();
    const { data: report } = await svc
      .from('reports')
      .select('status, vessel_name, variant')
      .eq('id', id)
      .single();
    expect(report?.status).toBe('extracted');
    expect(report?.vessel_name).toBe(vessel);
    expect(report?.variant).toBeNull();
  });
});
