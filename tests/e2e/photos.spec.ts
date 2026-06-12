import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * E2E da tela de fotos (PRD T-16 / CA-002). Cobre: alocar fotos nos slots,
 * recortar, bloqueio do avanço com slot obrigatório pendente e avanço quando
 * tudo completo (in_review → editing).
 *
 * NÃO executar nesta worktree (sem .env). O setup usa o service role para criar
 * um relatório já em `in_review` com fotos processadas (a etapa de revisão que
 * leva a in_review é da implementação 006), evitando depender do worker.
 */

const OPERATOR = { email: 'operador@naabsa.dev', password: 'naabsa123' };
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

/** Gera um JPEG sólido para usar como foto processada de teste. */
async function jpeg(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 60, g: 80, b: 110 },
    },
  })
    .jpeg()
    .toBuffer();
}

/**
 * Cria um relatório draft_survey/discharge em `in_review`, sobe N fotos já
 * "processadas" (processed_path/thumb_path/status=done) e devolve os ids.
 */
async function seedReportWithPhotos(
  svc: SupabaseClient,
  photoCount: number,
): Promise<{ reportId: string; photoIds: string[]; specSlots: string[] }> {
  const { data: type } = await svc
    .from('report_types')
    .select('id,active_spec_id')
    .eq('slug', 'draft_survey')
    .single();
  const reportTypeId = (type as { id: string }).id;
  const specId = (type as { active_spec_id: string }).active_spec_id;

  const { data: op } = await svc
    .from('profiles')
    .select('user_id')
    .limit(1)
    .single();
  const createdBy = (op as { user_id: string }).user_id;

  const { data: report } = await svc
    .from('reports')
    .insert({
      report_type_id: reportTypeId,
      spec_id: specId,
      variant: 'discharge',
      status: 'in_review',
      created_by: createdBy,
      vessel_name: 'MV PHOTOS E2E',
    })
    .select('id')
    .single();
  const reportId = (report as { id: string }).id;
  createdIds.push(reportId);

  const { data: specRow } = await svc
    .from('report_specs')
    .select('spec')
    .eq('id', specId)
    .single();
  const slots =
    (specRow as { spec: { photo_slots?: { id: string }[] } }).spec
      .photo_slots ?? [];

  const photoIds: string[] = [];
  for (let i = 0; i < photoCount; i++) {
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
    const { data: row } = await svc
      .from('report_photos')
      .insert({
        report_id: reportId,
        original_path: `${reportId}/photos/original/${uuid}.jpg`,
        processed_path: processedPath,
        thumb_path: thumbPath,
        status: 'done',
        slot_id: null,
      })
      .select('id')
      .single();
    photoIds.push((row as { id: string }).id);
  }

  return {
    reportId,
    photoIds,
    specSlots: slots.map((s) => s.id),
  };
}

test.afterAll(async () => {
  const svc = service();
  for (const id of createdIds) {
    await svc.storage
      .from(BUCKET)
      .list(`${id}/photos/processed`)
      .then(async ({ data }) => {
        if (data && data.length > 0) {
          await svc.storage
            .from(BUCKET)
            .remove(data.map((f) => `${id}/photos/processed/${f.name}`));
        }
      });
    await svc.from('report_photos').delete().eq('report_id', id);
    await svc.from('audit_log').delete().eq('report_id', id);
    await svc.from('reports').delete().eq('id', id);
  }
});

test.describe('Pipeline de fotos — alocação e gate (T-16)', () => {
  test('aloca, recorta, bloqueia avanço com obrigatório pendente, depois avança', async ({
    page,
  }) => {
    const svc = service();
    const { reportId, photoIds } = await seedReportWithPhotos(svc, 6);

    await login(page);
    await page.goto(`/reports/${reportId}/photos`);
    await expect(
      page.getByRole('heading', { name: 'Fotos' }),
    ).toBeVisible({ timeout: 20_000 });

    // Gate inicial: avanço bloqueado (slots obrigatórios pendentes).
    const advance = page.getByRole('button', {
      name: /Avançar para edição/,
    });
    await expect(advance).toBeDisabled();
    await expect(page.getByText(/slot obrigatório pendente/)).toBeVisible();

    // Aloca via fallback de clique: seleciona a 1ª foto e clica "Alocar" em
    // cada slot obrigatório (draft_fwd, draft_aft, draft_mid, holds×2).
    const galleryItems = page.locator('[data-photo-id]');
    const allocateButtons = page.getByText('Alocar', { exact: true });

    async function allocateNext(galleryIndex: number) {
      await galleryItems.nth(galleryIndex).click();
      await allocateButtons.first().click();
      await page.waitForTimeout(500);
    }

    // Aloca fotos suficientes para satisfazer required+min.
    for (let i = 0; i < 5; i++) {
      await allocateNext(i);
    }

    // Recorta a primeira foto alocada (abre o modal travado no aspect).
    await page.locator('button[title="Recortar"]').first().click();
    await expect(
      page.getByRole('dialog', { name: 'Recortar foto' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Salvar recorte/ }).click();
    await expect(
      page.getByRole('dialog', { name: 'Recortar foto' }),
    ).toBeHidden({ timeout: 20_000 });

    // Verificação no banco: crop persistido e alocações auditadas.
    const { data: cropped } = await svc
      .from('report_photos')
      .select('crop')
      .eq('report_id', reportId)
      .not('crop', 'is', null);
    expect((cropped ?? []).length).toBeGreaterThanOrEqual(1);

    const { data: logs } = await svc
      .from('audit_log')
      .select('action')
      .eq('report_id', reportId);
    const actions = (logs ?? []).map((l: { action: string }) => l.action);
    expect(actions).toContain('allocate_photo');
    expect(actions).toContain('crop_photo');

    // Avança: gate satisfeito → transição in_review→editing.
    await expect(advance).toBeEnabled();
    await advance.click();
    await expect(page).toHaveURL(
      new RegExp(`/reports/${reportId}/edit$`),
      { timeout: 20_000 },
    );

    const { data: report } = await svc
      .from('reports')
      .select('status')
      .eq('id', reportId)
      .single();
    expect((report as { status: string }).status).toBe('editing');

    // Sanidade: as fotos seedadas existem.
    expect(photoIds.length).toBe(6);
  });

  test('upload rejeita arquivo acima de 15 MB (413) sem bloquear válidos', async ({
    page,
  }) => {
    const svc = service();
    const { reportId } = await seedReportWithPhotos(svc, 0);

    await login(page);

    // Chama o endpoint diretamente com um lote misto (1 grande + 1 válido).
    const big = Buffer.alloc(16 * 1024 * 1024, 1);
    const small = await jpeg(800, 600);
    const result = await page.evaluate(
      async ({ id, bigB64, smallB64 }) => {
        function toFile(b64: string, name: string) {
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new File([arr], name, { type: 'image/jpeg' });
        }
        const fd = new FormData();
        fd.append('files', toFile(bigB64, 'grande.jpg'));
        fd.append('files', toFile(smallB64, 'ok.jpg'));
        const res = await fetch(`/api/reports/${id}/photos`, {
          method: 'POST',
          body: fd,
        });
        return { status: res.status, body: await res.json() };
      },
      {
        id: reportId,
        bigB64: big.toString('base64'),
        smallB64: small.toString('base64'),
      },
    );

    expect(result.status).toBe(202);
    expect(result.body.photoIds.length).toBe(1);
    expect(result.body.rejected.length).toBe(1);
  });
});
