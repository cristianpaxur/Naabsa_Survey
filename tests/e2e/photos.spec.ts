import { test, expect } from '@playwright/test';
import { checked, cleanupReports, jpeg, login, seedPhoto, seedReport, service } from './fixtures';
const ids: string[] = [];
test.afterAll(() => cleanupReports(ids));

test('fotos são opcionais: avança com galeria vazia', async ({ page }) => {
  const id = await seedReport(ids, 'in_review');
  await login(page);
  await page.goto(`/reports/${id}/photos`);
  await expect(page.getByText('Fotos opcionais', { exact: true })).toBeVisible();
  const advance = page.getByRole('button', { name: /Avançar para edição/ });
  await expect(advance).toBeEnabled();
  await advance.click();
  await expect(page).toHaveURL(new RegExp(`/reports/${id}/edit$`));
  expect(checked(await service().from('reports').select('status').eq('id', id).single(), 'status').status).toBe('editing');
});
test('aloca, recorta, desaloca e remove foto com estado persistido', async ({ page }) => {
  const id = await seedReport(ids, 'in_review');
  const photoId = await seedPhoto(id);
  const svc = service();
  const readPhoto = async () => checked(await svc.from('report_photos').select('slot_id,crop,removed_at').eq('id', photoId).single(), 'foto persistida');
  await login(page);
  await page.goto(`/reports/${id}/photos`);
  await page.locator(`[data-photo-id="${photoId}"]`).click();
  await page.getByRole('button', { name: /Alocar/, exact: false }).first().click();
  await expect.poll(async () => (await readPhoto()).slot_id).not.toBeNull();
  await page.getByTitle('Recortar', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Recortar foto' })).toBeVisible();
  await page.getByRole('button', { name: /Salvar recorte/ }).click();
  await expect(page.getByRole('dialog', { name: 'Recortar foto' })).toBeHidden();
  expect((await readPhoto()).crop).not.toBeNull();
  await page.getByRole('button', { name: 'Desalocar', exact: true }).click();
  await expect.poll(async () => (await readPhoto()).slot_id).toBeNull();
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await expect(page.locator(`[data-photo-id="${photoId}"]`)).toHaveCount(0);
  expect((await readPhoto()).removed_at).not.toBeNull();
});
test('lote misto rejeita foto acima de 15 MB e aceita a válida', async ({ page }) => {
  const id = await seedReport(ids, 'in_review');
  await login(page);
  const result = await page.evaluate(async ({ reportId, small }) => {
    const body = new FormData();
    body.append('files', new File([new Uint8Array(16 * 1024 * 1024)], 'grande.jpg', { type: 'image/jpeg' }));
    body.append('files', new File([Uint8Array.from(atob(small), c => c.charCodeAt(0))], 'ok.jpg', { type: 'image/jpeg' }));
    const response = await fetch(`/api/reports/${reportId}/photos`, { method: 'POST', body });
    return { status: response.status, body: await response.json() };
  }, { reportId: id, small: (await jpeg(800, 600)).toString('base64') });
  expect(result.status).toBe(202);
  expect(result.body.photoIds).toHaveLength(1);
  expect(result.body.rejected).toHaveLength(1);
  expect(result.body.rejected[0].name).toBe('grande.jpg');
});
