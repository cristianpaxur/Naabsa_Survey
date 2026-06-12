import { notFound, redirect } from 'next/navigation';
import type { ReportSpec } from '@naabsa/core';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { loadUIPhotos } from '@/lib/photos';
import { PhotosClient } from '@/components/photos/PhotosClient';

/**
 * Tela 05 — Fotos (RF-15..RF-19). Carrega o relatório, os slots do spec
 * congelado e as fotos (com URLs assinadas) e delega a interação ao
 * PhotosClient (upload, dnd, crop, gate de avanço).
 */
export default async function PhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: reportRow } = await supabase
    .from('reports')
    .select('id,status,spec_id,vessel_name,variant')
    .eq('id', id)
    .maybeSingle();
  const report = reportRow as {
    id: string;
    status: string;
    spec_id: string;
    vessel_name: string | null;
    variant: string | null;
  } | null;
  if (!report) notFound();

  // Fotos pertencem à etapa de revisão. Fora dela, leva ao lugar certo.
  if (report.status === 'draft' || report.status === 'extracted') {
    redirect(`/reports/${id}/review`);
  }
  if (report.status !== 'in_review') {
    redirect(`/reports/${id}/edit`);
  }

  const { data: specRow } = await supabase
    .from('report_specs')
    .select('spec')
    .eq('id', report.spec_id)
    .maybeSingle();
  const spec = (specRow as { spec: ReportSpec } | null)?.spec;
  const slots = spec?.photo_slots ?? [];

  const photos = await loadUIPhotos(supabase, createServiceClient(), id);

  const metaLabel = report.variant ? report.variant : 'sem variante';

  return (
    <PhotosClient
      reportId={id}
      vesselName={report.vessel_name}
      metaLabel={metaLabel}
      slots={slots}
      initialPhotos={photos}
    />
  );
}
