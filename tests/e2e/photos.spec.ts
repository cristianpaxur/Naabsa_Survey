import { test, expect, type Locator } from '@playwright/test';
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

test('arrasta fotos com prévia e persiste os movimentos entre galeria e grupos', async ({ page }) => {
  const id = await seedReport(ids, 'in_review');
  const firstPhoto = await seedPhoto(id);
  const secondPhoto = await seedPhoto(id);
  const initial = page.locator('[data-slot-id="photos_initial"]');
  const cover = page.locator('[data-slot-id="cover"]');
  const gallery = page.locator('[data-photo-gallery]');
  const findPhoto = (photoId: string) => `[data-photo-id="${photoId}"]`;
  const hitPhoto = (photoId: string) => page.locator(findPhoto(photoId)).locator('img');
  const preview = page.locator('.photo-drag-preview');
  const saving = page.getByText('Salvando posição…');

  async function pickUp(photoId: string) {
    const source = hitPhoto(photoId);
    await source.hover();
    const { x, y, width, height } = (await source.boundingBox())!;
    await page.mouse.down();
    await page.mouse.move(x + width / 2 + 12, y + height / 2, { steps: 3 });
    await expect(preview).toBeVisible();
  }

  async function moveTo(target: Locator, offsetY?: number) {
    const { x, y, width, height } = (await target.boundingBox())!;
    await page.mouse.move(x + width / 2, y + (offsetY ?? height / 2), { steps: 8 });
  }

  async function release() {
    await page.mouse.up();
    await expect(preview).toBeHidden();
    await expect(saving).toBeHidden();
  }

  await login(page);
  await page.goto(`/reports/${id}/photos`);
  await pickUp(firstPhoto);
  const initialPreview = (await preview.boundingBox())!;
  await moveTo(initial, 18);
  await expect(initial).toHaveAttribute('data-drop-state', 'over');
  expect((await preview.boundingBox())!.x).toBeGreaterThan(initialPreview.x);
  await release();
  await expect(initial.locator(findPhoto(firstPhoto))).toBeVisible();

  await pickUp(secondPhoto);
  await moveTo(initial, 18);
  await release();
  await expect(initial.locator(findPhoto(secondPhoto))).toBeVisible();
  await pickUp(secondPhoto);
  await moveTo(hitPhoto(firstPhoto));
  await release();
  await expect(initial.locator('[data-photo-id]').first()).toHaveAttribute('data-photo-id', secondPhoto);
  await page.reload();
  await expect(initial.locator('[data-photo-id]').first()).toHaveAttribute('data-photo-id', secondPhoto);

  await pickUp(secondPhoto);
  await moveTo(cover, 18);
  await release();
  await expect(cover.locator(findPhoto(secondPhoto))).toBeVisible();
  await pickUp(secondPhoto);
  await moveTo(gallery, 22);
  await release();
  await expect(gallery.locator(findPhoto(secondPhoto))).toBeVisible();
  await expect.poll(async () => checked(await service().from('report_photos')
    .select('slot_id').eq('id', secondPhoto).single(), 'foto devolvida').slot_id).toBeNull();
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
