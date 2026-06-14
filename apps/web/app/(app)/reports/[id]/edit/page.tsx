import { notFound, redirect } from 'next/navigation';
import type { ReportSpec, FieldValue, TipTapDoc } from '@naabsa/core';
import { createClient } from '@/lib/supabase/server';
import { assembleDocument } from '@/lib/document-assembly';
import { audit } from '@/lib/audit';
import { EditorClient } from '@/components/editor/EditorClient';

/**
 * Tela 06 — Editor (008/T-006, RF-20..RF-26).
 *
 * Entrada em `editing`: se `document_json` é nulo (primeira vez), monta via
 * builder da 004 (dados efetivos + fotos confirmadas), persiste e audita.
 * Entradas seguintes carregam o documento existente (NÃO remonta). Status
 * `approved`/`generated` abrem em modo preview (somente leitura). Outros status
 * redirecionam ao lugar correto.
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
    .select(
      'id,status,spec_id,variant,vessel_name,document_json,extracted_data,operator_overrides,report_type_id',
    )
    .eq('id', id)
    .maybeSingle();
  const report = reportRow as {
    id: string;
    status: string;
    spec_id: string;
    variant: string | null;
    vessel_name: string | null;
    document_json: unknown;
    extracted_data: Record<string, FieldValue> | null;
    operator_overrides: Record<string, FieldValue> | null;
    report_type_id: string;
  } | null;
  if (!report) notFound();

  // Roteamento por status — o editor é da fase de edição em diante.
  if (
    report.status === 'draft' ||
    report.status === 'extracted'
  ) {
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

  const { data: specRow } = await supabase
    .from('report_specs')
    .select('spec')
    .eq('id', report.spec_id)
    .maybeSingle();
  const spec = (specRow as { spec: ReportSpec } | null)?.spec;
  if (!spec) notFound();

  // ── Montagem na primeira entrada em editing (RF-20) ──────────────────────
  let documentJson = report.document_json as TipTapDoc | null;
  if (report.status === 'editing' && !documentJson) {
    const built = await assembleDocument(supabase, id, {
      slug,
      spec,
      variant: report.variant,
      extracted: report.extracted_data ?? {},
      overrides: report.operator_overrides,
    });
    const { error } = await supabase
      .from('reports')
      .update({ document_json: built } as never)
      .eq('id', id)
      .eq('status', 'editing');
    if (!error) {
      await audit(supabase, {
        reportId: id,
        actor: user.id,
        action: 'document_assembled',
        payload: { slug, variant: report.variant },
      });
      documentJson = built;
    } else {
      // Concorrência: outro processo pode ter montado/avançado. Recarrega.
      const { data: again } = await supabase
        .from('reports')
        .select('document_json')
        .eq('id', id)
        .maybeSingle();
      documentJson =
        (again as { document_json: TipTapDoc | null } | null)?.document_json ??
        built;
    }
  }

  if (!documentJson) {
    // approved/generated sem documento é inconsistente.
    notFound();
  }

  const specLabel = report.variant
    ? `${slug} · ${report.variant}`
    : slug || 'relatório';

  const initialView =
    report.status === 'approved' || report.status === 'generated'
      ? 'preview'
      : 'edit';

  return (
    <EditorClient
      reportId={id}
      vesselName={report.vessel_name}
      specLabel={specLabel}
      initialDoc={documentJson}
      initialStatus={report.status as 'editing' | 'approved' | 'generated'}
      initialView={initialView}
    />
  );
}
