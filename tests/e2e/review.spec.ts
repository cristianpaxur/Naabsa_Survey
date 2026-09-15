import { test, expect } from '@playwright/test';
import { checked, cleanupReports, finalDateInput, login, seedReport, service } from './fixtures';
const ids: string[] = [];
test.afterAll(() => cleanupReports(ids));

test('corrigir data real remove erro, preserva extração e audita override', async ({ page }) => {
  const id = await seedReport(ids, 'extracted', true);
  const svc = service();
  const before = checked(await svc.from('reports').select('extracted_data').eq('id', id).single(), 'extração antes');
  await login(page);
  await page.goto(`/reports/${id}/review`);
  const confirm = page.getByRole('button', { name: /Confirmar dados/ });
  await expect(confirm).toBeDisabled();
  await finalDateInput(page).fill('2026-06-01');
  await finalDateInput(page).blur();
  await expect(confirm).toBeEnabled({ timeout: 15_000 });
  const after = checked(await svc.from('reports').select('extracted_data,operator_overrides').eq('id', id).single(), 'extração depois');
  expect(after.extracted_data).toEqual(before.extracted_data);
  expect(after.operator_overrides.final_date).toBe('2026-06-01');
  const logs = checked(await svc.from('audit_log').select('action').eq('report_id', id), 'auditoria override');
  expect(logs?.map(row => row.action)).toContain('override');
  await confirm.click();
  await expect(page).toHaveURL(new RegExp(`/reports/${id}/photos$`));
});
test('mostra seção e referência da célula real', async ({ page }) => {
  const id = await seedReport(ids, 'extracted');
  await login(page);
  await page.goto(`/reports/${id}/review`);
  await expect(page.getByText('Particulars do navio', { exact: true })).toBeVisible();
  await expect(page.getByText('C13', { exact: true })).toBeVisible();
});
test('diferença de 1% gera aviso sem bloquear confirmação', async ({ page }) => {
  const id = await seedReport(ids, 'extracted', false, true);
  await login(page);
  await page.goto(`/reports/${id}/review`);
  await expect(page.getByText('Diferença final fora do limite de ±0,5% entre figuras — revisar antes de aprovar.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirmar dados/ })).toBeEnabled();
});
