import 'server-only';
import { randomUUID } from 'node:crypto';
import { enableDynamicToc } from '@naabsa/core/docx-toc';
import type { ServerClient } from './supabase/server';
import { createServiceClient } from './supabase/service';
import { currentLock, type WopiReport } from './wopi/lock';

export type TocReport = Pick<
  WopiReport,
  | 'status'
  | 'working_docx_path'
  | 'working_docx_revision'
  | 'wopi_lock'
  | 'wopi_lock_expires_at'
>;

/** Retrofit the saved Word before opening a new session; never rebuild its body. */
export async function prepareWorkingToc(
  client: ServerClient,
  reportId: string,
  report: TocReport,
): Promise<void> {
  if (
    report.status !== 'editing' ||
    !report.working_docx_path ||
    currentLock(report)
  )
    return;
  const storage = createServiceClient().storage.from('reports');
  const source = await storage.download(report.working_docx_path);
  if (source.error || !source.data)
    throw new Error(
      'Não foi possível preparar o índice do documento. Tente abrir novamente.',
    );
  const original = Buffer.from(await source.data.arrayBuffer());
  const updated = enableDynamicToc(original);
  if (updated === original) return;
  if (report.working_docx_revision === undefined)
    throw new Error('Revisão do documento indisponível.');
  const path = `${reportId}/working/${randomUUID()}.docx`;
  const upload = await storage.upload(path, updated, {
    contentType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: false,
  });
  if (upload.error)
    throw new Error(
      'Não foi possível salvar a atualização do índice. Tente abrir novamente.',
    );
  let query = client
    .from('reports')
    .update(
      {
        working_docx_path: path,
        working_docx_revision: report.working_docx_revision + 1,
        working_docx_saved_at: new Date().toISOString(),
      } as never,
      { count: 'exact' },
    )
    .eq('id', reportId)
    .eq('status', 'editing')
    .eq('working_docx_path', report.working_docx_path)
    .eq('working_docx_revision', report.working_docx_revision);
  // A session may acquire/refresh its lock while we prepare the package.
  for (const key of ['wopi_lock', 'wopi_lock_expires_at'] as const) {
    const value = report[key];
    query = value == null ? query.is(key, null) : query.eq(key, value);
  }
  const saved = await query;
  // Retain the immutable upload on an ambiguous DB response, as PutFile does.
  if (saved.error || saved.count !== 1)
    throw new Error(
      'O documento mudou durante a atualização do índice. Tente abrir novamente.',
    );
}
