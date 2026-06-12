/**
 * Tela 04 — Revisão de Dados (implementação 006, RF-11..RF-14).
 *
 * Ao abrir:
 * - Carrega o relatório com spec congelado.
 * - Se status === 'extracted', transiciona para 'in_review' (auditado).
 * - Se status incompatível (não in_review, não extracted), redireciona
 *   para o dashboard.
 *
 * Agrupa campos por seção, resolve valores efetivos e passa para
 * ReviewClient (componente cliente que gerencia issues em tempo real).
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { transition } from '@/lib/state-machine';
import { validate, type Issue, type ReportSpec, type FieldValue } from '@naabsa/core';
import { groupBySectionOrdered } from '@/lib/effective-values';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ReviewClient } from '@/components/review/ReviewClient';
import { resolveFieldValue, collectFields } from '@naabsa/core';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Busca o relatório com spec
  const { data: raw } = await supabase
    .from('reports')
    .select(
      'id, status, variant, extracted_data, operator_overrides, report_specs!reports_spec_id_fkey(spec)',
    )
    .eq('id', id)
    .single();

  if (!raw) redirect('/dashboard');

  const row = raw as unknown as {
    id: string;
    status: string;
    variant: string | null;
    extracted_data: Record<string, FieldValue> | null;
    operator_overrides: Record<string, FieldValue> | null;
    report_specs:
      | { spec: ReportSpec }
      | { spec: ReportSpec }[]
      | null;
  };

  // Resolver spec do join
  let spec: ReportSpec | null = null;
  if (row.report_specs) {
    const rs = Array.isArray(row.report_specs)
      ? row.report_specs[0]
      : row.report_specs;
    spec = rs?.spec ?? null;
  }
  if (!spec) redirect('/dashboard');

  const status = row.status;

  // Redirecionar se status incompatível
  if (status !== 'extracted' && status !== 'in_review') {
    redirect('/dashboard');
  }

  // Transição extracted → in_review na primeira abertura
  if (status === 'extracted') {
    try {
      await transition(supabase, id, 'extracted', 'in_review', user.id);
    } catch {
      // Se falhar (ex.: mudança de status em paralelo), redirecionar
      redirect('/dashboard');
    }
  }

  // Calcular valores efetivos e issues iniciais
  const extracted = row.extracted_data ?? {};
  const overrides = row.operator_overrides ?? {};
  const variant = row.variant;

  const sections = groupBySectionOrdered(spec, variant, extracted, overrides);

  // Resolver effective data para validação inicial
  const fields = collectFields(spec, variant);
  const effective: Record<string, FieldValue> = {};
  for (const [name] of fields) {
    effective[name] = resolveFieldValue(name, overrides, extracted);
  }
  const initialIssues: Issue[] = validate(effective, spec, variant);

  const totalFields = sections.reduce((acc, s) => acc + s.fields.length, 0);

  return (
    <div
      style={{
        padding: '32px 36px',
        maxWidth: 1100,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 28,
          paddingBottom: 20,
          borderBottom: '1px solid var(--borda)',
        }}
      >
        <div style={{ flex: 1 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: 'var(--tinta)',
            }}
          >
            Revisão de dados
          </h1>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 12,
              color: 'var(--rocha)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {totalFields} campo{totalFields !== 1 ? 's' : ''} · valor efetivo ={' '}
            <span style={{ color: 'var(--navy)', fontWeight: 600 }}>
              override ?? extraído
            </span>
          </p>
        </div>
        <StatusBadge status="in_review" />
      </div>

      {/* Conteúdo principal (client) */}
      <ReviewClient
        reportId={id}
        sections={sections}
        initialIssues={initialIssues}
      />
    </div>
  );
}
