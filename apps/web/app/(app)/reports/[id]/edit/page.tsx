import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';
import { enqueueBuildWorkingDocx } from '@/lib/queue';
import { CollaboraEditor } from '@/components/editor/CollaboraEditor';
import type { ReportStatus } from '@/lib/state-machine';

/**
 * Tela 06 — Editor nativo Collabora (012/T-004, RF-001..RF-007).
 *
 * Entrada em `editing`: se o `working.docx` ainda não foi montado, enfileira o build
 * (worker) — o CollaboraEditor faz polling até existir e abre o iframe do LibreOffice.
 * `approved`/`generated` abrem em leitura. Outros status redirecionam ao lugar correto.
 */
export default async function EditPage({
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
    .select('id,status,variant,vessel_name,working_docx_path,report_type_id')
    .eq('id', id)
    .maybeSingle();
  const report = reportRow as {
    id: string;
    status: string;
    variant: string | null;
    vessel_name: string | null;
    working_docx_path: string | null;
    report_type_id: string;
  } | null;
  if (!report) notFound();

  // Roteamento por status — o editor é da fase de edição em diante.
  if (report.status === 'draft' || report.status === 'extracted') {
    redirect(`/reports/${id}/review`);
  }
  if (report.status === 'in_review') {
    redirect(`/reports/${id}/photos`);
  }

  const { data: typeRow } = await supabase
    .from('report_types')
    .select('slug')
    .eq('id', report.report_type_id)
    .maybeSingle();
  const slug = (typeRow as { slug: string } | null)?.slug ?? '';
  const specLabel = report.variant ? `${slug} · ${report.variant}` : slug || 'relatório';

  // Montagem do working.docx na 1ª entrada em editing (RF-001): enfileira o build.
  // O CollaboraEditor faz polling (getEditorUrl → pending) até o .docx existir.
  if (report.status === 'editing' && !report.working_docx_path) {
    try {
      await enqueueBuildWorkingDocx({ reportId: id });
      await audit(supabase, {
        reportId: id,
        actor: user.id,
        action: 'working_docx_enqueued',
        payload: { slug, variant: report.variant },
      });
    } catch {
      /* o CollaboraEditor mostra erro/retry se o build não vier */
    }
  }

  const initialView =
    report.status === 'approved' || report.status === 'generated' ? 'preview' : 'edit';

  return (
    <CollaboraEditor
      reportId={id}
      vesselName={report.vessel_name}
      specLabel={specLabel}
      initialStatus={report.status as ReportStatus}
      initialView={initialView}
    />
  );
}
