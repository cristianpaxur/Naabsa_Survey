import { test, expect } from '@playwright/test';
import { checked, cleanupReports, createDraft, login, service } from './fixtures';
const ids: string[] = [];
test.afterAll(() => cleanupReports(ids));

test('cria Draft Survey com planilha real e persiste extração/variante', async ({ page }) => {
  await login(page);
  const { reportId, vessel } = await createDraft(page, ids);
  const svc = service();
  const report = checked(await svc.from('reports').select('status,vessel_name,variant').eq('id', reportId).single(), 'relatório extraído');
  expect(report).toMatchObject({ status: 'in_review', vessel_name: vessel, variant: 'discharge' });
  const actions = checked(await svc.from('audit_log').select('action').eq('report_id', reportId), 'auditoria')?.map(row => row.action);
  expect(actions).toEqual(expect.arrayContaining(['create', 'upload', 'extraction', 'transition']));
});
test('variante obrigatória bloqueia o avanço até a escolha', async ({ page }) => {
  await login(page);
  await page.goto('/reports/new');
  await page.getByRole('button').filter({ hasText: 'Draft Survey' }).click();
  const continueButton = page.getByRole('button', { name: /Continuar para planilha/ });
  await expect(continueButton).toBeDisabled();
  await page.getByRole('button', { name: 'Descarga', exact: true }).click();
  await expect(continueButton).toBeEnabled();
});
test('ROB permanece indisponível até possuir implementação suportada', async ({ page }) => {
  await login(page);
  await page.goto('/reports/new');
  await expect(page.getByRole('button').filter({ hasText: 'ROB' })).toBeDisabled();
});
