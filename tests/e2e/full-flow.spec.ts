import { test, expect } from '@playwright/test';
import { BUCKET, checked, cleanupReports, createDraft, finalDateInput, login, service } from './fixtures';

// Stack isolada completa: web + worker/LibreOffice + Supabase + Collabora.
// Cobre abertura e aprovação nativa. Digitação real no canvas e fidelidade visual
// da edição no PDF continuam como aceite manual; este teste não simula edição.
const ids: string[] = [];
test.afterAll(() => cleanupReports(ids));

test('planilha real → corrigir data → sem fotos → abrir Collabora → aprovar → baixar PDF', async ({ page }) => {
  test.setTimeout(300_000);
  const svc = service();
  await login(page);
  const { reportId, vessel } = await createDraft(page, ids, true);
  await expect(page.getByText('Revisão de dados', { exact: true })).toBeVisible();
  const confirm = page.getByRole('button', { name: /Confirmar dados/ });
  await expect(confirm).toBeDisabled();
  await finalDateInput(page).fill('2026-06-01');
  await finalDateInput(page).blur();
  await expect(confirm).toBeEnabled({ timeout: 15_000 });
  await confirm.click();
  await expect(page).toHaveURL(new RegExp(`/reports/${reportId}/photos$`));
  const advance = page.getByRole('button', { name: /Avançar para edição/ });
  await expect(advance).toBeEnabled();
  await advance.click();
  await expect(page).toHaveURL(new RegExp(`/reports/${reportId}/edit$`));
  await expect(page.getByRole('heading', { name: vessel, exact: true })).toBeVisible();
  await expect(page.getByTitle('Editor do relatório (Collabora)', { exact: true })).toBeVisible({ timeout: 120_000 });

  const working = checked(await svc.from('reports').select('working_docx_path,working_docx_revision').eq('id', reportId).single(), 'documento de trabalho');
  expect(working?.working_docx_path).toMatch(new RegExp(`^${reportId}/working/[0-9a-f-]+\\.docx$`));
  const original = checked(await svc.storage.from(BUCKET).download(working.working_docx_path), 'download working DOCX');
  expect(original?.size).toBeGreaterThan(0);

  const approve = page.getByRole('button', { name: 'Aprovar e gerar PDF', exact: true });
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page.getByText(/PDF pronto/)).toBeVisible({ timeout: 120_000 });
  const report = checked(await svc.from('reports').select('status,document_hash,pdf_paths,approved_docx_path,approved_docx_revision,working_docx_path').eq('id', reportId).single(), 'relatório gerado');
  expect(report?.status).toBe('generated');
  expect(report?.document_hash).toBeTruthy();
  expect(report?.approved_docx_path).toBe(report?.working_docx_path);
  expect(report?.approved_docx_revision).toBeGreaterThanOrEqual(working.working_docx_revision);
  const approved = checked(await svc.storage.from(BUCKET).download(report.approved_docx_path), 'snapshot aprovado');
  expect(approved?.size).toBeGreaterThan(0);
  expect(report.pdf_paths).toHaveLength(1);
  expect(report.pdf_paths[0]).toMatch(new RegExp(`^${reportId}/final-v\\d+-r${report.approved_docx_revision}\\.pdf$`));
  const pdf = checked(await svc.storage.from(BUCKET).download(report.pdf_paths[0]), 'download PDF persistido');
  expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page.getByRole('button', { name: /Baixar PDF/ })).toBeEnabled();
  const actions = checked(await svc.from('audit_log').select('action').eq('report_id', reportId), 'auditoria')?.map(row => row.action);
  expect(actions).toEqual(expect.arrayContaining(['working_docx_enqueued', 'document_snapshot', 'pdf_enqueued', 'transition', 'pdf_generated']));
});
