import { expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { resolve } from 'node:path';
import { runExtraction } from '../../packages/core/src/extractor';
import type { ReportSpec } from '../../packages/core/src/types';

export const OPERATOR = {
  email: process.env.E2E_OPERATOR_EMAIL ?? 'operador@naabsa.dev',
  password: process.env.E2E_OPERATOR_PASSWORD ?? 'naabsa123',
};
export const BUCKET = 'reports';
export function service() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function checked<T extends { data: unknown; error: { message: string } | null }>(result: T, operation: string): NonNullable<T['data']> {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  return result.data as NonNullable<T['data']>;
}
export async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('voce@naabsa.com.br').fill(OPERATOR.email);
  await page.getByPlaceholder('••••••••').fill(OPERATOR.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 25_000 });
}
export async function draftWorkbook(vessel: string, missingDate = false) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolve('tests/fixtures/planilhas/draft_survey/draft_survey.real.v1.xlsx'));
  workbook.getWorksheet('Capa')!.getCell('C13').value = vessel;
  workbook.getWorksheet('Capa')!.getCell('L4').value = 'Discharge';
  if (missingDate) workbook.getWorksheet('final')!.getCell('C5').value = null;
  return workbook;
}
export async function createDraft(page: Page, ids: string[], missingDate = false) {
  const vessel = `MV E2E ${crypto.randomUUID()}`;
  await page.goto('/reports/new');
  await page.getByRole('button').filter({ hasText: 'Draft Survey' }).click();
  await page.getByRole('button', { name: 'Descarga', exact: true }).click();
  await page.getByRole('button', { name: /Continuar para planilha/ }).click();
  const workbook = await draftWorkbook(vessel, missingDate);
  await page.locator('input[type=file]').setInputFiles({ name: 'draft.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  });
  // Registra o ID mesmo se a extração falhar; não consulta relatórios de outros testes.
  const request = page.waitForRequest(r => r.method() === 'POST' && /\/api\/reports\/[^/]+\/spreadsheet$/.test(new URL(r.url()).pathname));
  await page.getByRole('button', { name: 'Extrair dados', exact: true }).click();
  const uploaded = await request;
  const reportId = /\/reports\/([^/]+)\/spreadsheet$/.exec(new URL(uploaded.url()).pathname)![1];
  ids.push(reportId);
  await expect(page).toHaveURL(new RegExp(`/reports/${reportId}/review$`), { timeout: 60_000 });
  return { reportId, vessel };
}
export function finalDateInput(page: Page) {
  // FieldRow não possui label/for: delimita a linha pela legenda exata.
  return page.getByText('Data — Final', { exact: true }).locator('..').locator('..').locator('..').locator('input[type="date"]');
}
export async function seedReport(ids: string[], status: 'extracted' | 'in_review', missingDate = false, warning = false) {
  const svc = service();
  const type = checked(await svc.from('report_types').select('id,active_spec_id').eq('slug', 'draft_survey').single(), 'tipo Draft');
  if (!type?.active_spec_id) throw new Error('Draft Survey exige o modelo real ativo');
  const spec = checked(await svc.from('report_specs').select('spec').eq('id', type.active_spec_id).single(), 'spec ativo')?.spec as ReportSpec;
  if (spec.contract !== 2) throw new Error('E2E exige spec real Draft Survey (contrato 2)');
  const profile = checked(await svc.from('profiles').select('user_id,status').eq('email', OPERATOR.email).single(), 'operador');
  if (profile?.status !== 'active') throw new Error('E2E exige operador ativo exclusivo de testes');
  const workbook = await draftWorkbook('MV REVISÃO E2E', missingDate);
  const result = runExtraction(workbook, spec, 'discharge');
  if (warning) result.data.fin_fig_diff_pct = 0.01;
  const report = checked(await svc.from('reports').insert({ report_type_id: type.id, spec_id: type.active_spec_id,
    variant: 'discharge', status, created_by: profile.user_id, vessel_name: 'MV REVISÃO E2E',
    extracted_data: result.data, extraction_issues: result.issues, operator_overrides: {},
  }).select('id').single(), 'criar fixture relatório');
  ids.push(report.id);
  return report.id as string;
}
export async function jpeg(width = 1200, height = 900) {
  return sharp({ create: { width, height, channels: 3, background: '#456789' } }).jpeg().toBuffer();
}
export async function seedPhoto(reportId: string) {
  const svc = service();
  const id = crypto.randomUUID();
  const processed = `${reportId}/photos/processed/${id}.jpg`;
  const thumb = `${reportId}/photos/thumbs/${id}.jpg`;
  const bytes = await jpeg();
  for (const path of [processed, thumb]) checked(await svc.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg' }), `upload ${path}`);
  const row = checked(await svc.from('report_photos').insert({ report_id: reportId,
    original_path: `${reportId}/photos/original/${id}.jpg`, processed_path: processed, thumb_path: thumb,
    status: 'done', ai_status: 'idle', slot_id: null,
  }).select('id').single(), 'criar fixture foto');
  return row.id as string;
}
export async function cleanupReports(ids: string[]) {
  if (!ids.length) return;
  const svc = service();
  const failures: string[] = [];
  for (const id of ids) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Cleanup recusado: ID de relatório inválido');
    try {
      const paths: string[] = [];
      async function collect(prefix: string) {
        for (let offset = 0; ; offset += 100) {
          const rows = checked(await svc.storage.from(BUCKET).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }), `listar ${prefix}`) ?? [];
          for (const row of rows) {
            const path = `${prefix}/${row.name}`;
            if (row.id) paths.push(path); else await collect(path);
          }
          if (rows.length < 100) break;
        }
      }
      await collect(id);
      for (let offset = 0; offset < paths.length; offset += 100) checked(await svc.storage.from(BUCKET).remove(paths.slice(offset, offset + 100)), 'remover objetos E2E');
      checked(await svc.from('audit_log').delete().eq('report_id', id), 'limpar auditoria E2E');
      checked(await svc.from('reports').delete().eq('id', id), 'limpar relatório E2E');
    } catch (error) { failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (failures.length) throw new Error(`Cleanup E2E incompleto: ${failures.join('; ')}`);
}
