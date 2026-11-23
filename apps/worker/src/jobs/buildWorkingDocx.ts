/** Montagem inicial idempotente. Objetos publicados nunca são sobrescritos. */
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { serializePhotoAssignments, type PhotoAssignment } from '@naabsa/core';
import {
  replaceMscPhotoSections,
  updateMscTocPages,
} from '../lib/buildDocxMsc';
import { fitMscCoverContacts, measureMscPages } from '../lib/mscPagination';
import { paginateBqsDocx, replaceBqsPhotoSections } from '../lib/bqsDocument';
import { getServiceClient } from '../lib/supabase';
import { loadReport, buildWorkingDocx as assembleDocx } from './generatePdf';

export interface BuildWorkingDocxPayload {
  reportId: string;
  generation?: string;
  refreshPhotos?: {
    path: string;
    revision: number;
    assignmentKey: string;
    photoRevision: number;
  };
}

export const BUILD_WORKING_DOCX_QUEUE = 'build_working_docx';
export const BUILD_WORKING_DOCX_CONCURRENCY = 1;
export const BUILD_WORKING_DOCX_RETRY_LIMIT = 2;

export async function buildWorkingDocx(
  payload: BuildWorkingDocxPayload,
): Promise<void> {
  const { reportId, generation } = payload;
  const svc = getServiceClient();
  const row = await loadReport(svc, reportId);
  if (!row)
    throw new Error(
      `[build_working_docx] relatório ${reportId} não encontrado.`,
    );
  if (payload.refreshPhotos) {
    await refreshWorkingPhotos(svc, payload, row);
    return;
  }
  // Jobs legados sem geração não têm autoridade para reconstruir documentos.
  if (
    !generation ||
    generation !== row.working_docx_generation ||
    row.status !== 'editing' ||
    row.working_docx_path
  )
    return;

  const { docx } = await assembleDocx(svc, reportId, row);
  const path = `${reportId}/working/${randomUUID()}.docx`;
  const up = await svc.storage.from('reports').upload(path, docx, {
    contentType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: false,
  });
  if (up.error)
    throw new Error(
      `[build_working_docx] falha no upload: ${up.error.message}`,
    );

  // O job pode ter demorado: revalida geração, etapa e ausência de documento.
  // Em erro de resposta do banco não removemos o upload: o commit é ambíguo.
  const { error, count } = await svc
    .from('reports')
    .update(
      {
        working_docx_path: path,
        working_docx_revision: row.working_docx_revision + 1,
        working_docx_saved_at: new Date().toISOString(),
      } as never,
      { count: 'exact' },
    )
    .eq('id', reportId)
    .eq('status', 'editing')
    .eq('working_docx_generation', generation)
    .eq('working_docx_revision', row.working_docx_revision)
    .is('working_docx_path', null);
  if (error)
    throw new Error(
      `[build_working_docx] falha ao publicar documento: ${error.message}`,
    );
  if (count !== 1) return;
  await svc.from('audit_log').insert({
    report_id: reportId,
    actor: null,
    action: 'working_docx_built',
    payload: { generation, path },
  } as never);
}

async function refreshWorkingPhotos(
  svc: ReturnType<typeof getServiceClient>,
  payload: BuildWorkingDocxPayload,
  row: NonNullable<Awaited<ReturnType<typeof loadReport>>>,
) {
  const source = payload.refreshPhotos!;
  const { reportId, generation } = payload;
  const event = (action: string, extra: Record<string, unknown> = {}) =>
    svc.from('audit_log').insert({
      report_id: reportId,
      actor: null,
      action,
      payload: { ...source, ...extra },
    } as never);
  try {
    if (
      !['msc', 'bqs'].includes(row.type_slug ?? '') ||
      row.status !== 'in_review' ||
      generation !== row.working_docx_generation ||
      row.working_docx_path !== source.path ||
      row.working_docx_revision !== source.revision ||
      row.photo_assignment_revision !== source.photoRevision
    )
      return;
    const signature = async () => {
      const { data, error } = await svc
        .from('report_photos')
        .select('id,slot_id,position,crop,processed_path,status,ai_suggested')
        .eq('report_id', reportId)
        .is('removed_at', null)
        .not('slot_id', 'is', null);
      if (error) throw new Error('Não foi possível conferir as fotos atuais.');
      return createHash('sha256')
        .update(serializePhotoAssignments((data ?? []) as PhotoAssignment[]))
        .digest('hex');
    };
    if ((await signature()) !== source.assignmentKey)
      throw new Error('As fotos mudaram. Tente avançar novamente.');
    const { data: blob, error } = await svc.storage
      .from('reports')
      .download(source.path);
    if (error || !blob)
      throw new Error('Não foi possível recuperar o Word atual.');
    const original = Buffer.from(await blob.arrayBuffer());
    const fresh = await assembleDocx(svc, reportId, row);
    let docx: Buffer;
    if (row.type_slug === 'bqs') {
      docx = await paginateBqsDocx(
        replaceBqsPhotoSections(original, fresh.docx),
      );
    } else {
      const fitted = await fitMscCoverContacts(
        replaceMscPhotoSections(original, fresh.docx),
      );
      docx = fitted.docx;
      let pages = fitted.pages,
        stable = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        docx = updateMscTocPages(docx, pages);
        const measured = await measureMscPages(docx);
        if (
          Object.entries(pages).every(([id, page]) => measured[id] === page)
        ) {
          stable = true;
          break;
        }
        pages = measured;
      }
      if (!stable)
        throw new Error(
          'A paginação das fotos não estabilizou. Tente novamente.',
        );
      if (pages['msc_cover_contacts_end'] !== 1)
        throw new Error('Os contatos do comando precisam permanecer na capa.');
    }
    if ((await signature()) !== source.assignmentKey)
      throw new Error('As fotos mudaram. Tente avançar novamente.');
    const path = `${reportId}/working/${randomUUID()}.docx`;
    const uploaded = await svc.storage.from('reports').upload(path, docx, {
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    });
    if (uploaded.error)
      throw new Error('Não foi possível salvar as fotos no Word.');
    const { error: publishError, count } = await svc
      .from('reports')
      .update(
        {
          working_docx_path: path,
          working_docx_revision: source.revision + 1,
          working_docx_saved_at: new Date().toISOString(),
        } as never,
        { count: 'exact' },
      )
      .eq('id', reportId)
      .eq('status', 'in_review')
      .eq('working_docx_generation', generation)
      .eq('working_docx_path', source.path)
      .eq('working_docx_revision', source.revision)
      .eq('photo_assignment_revision', source.photoRevision)
      .is('wopi_lock', null);
    if (publishError || count !== 1)
      throw new Error(
        'O documento mudou durante a atualização das fotos. Tente novamente.',
      );
    await event('photos_docx_synced', {
      path,
      revision: source.revision + 1,
      previousPath: source.path,
    });
  } catch (error) {
    await event('photos_docx_sync_failed', {
      message:
        error instanceof Error ? error.message : 'Falha ao atualizar as fotos.',
    });
    throw error;
  }
}
