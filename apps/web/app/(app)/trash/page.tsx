import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TrashReportActions } from '@/components/dashboard/TrashReportActions';
import type { ReportStatus } from '@/lib/state-machine';

interface TrashedReport {
  id: string;
  vessel_name: string | null;
  variant: string | null;
  status: ReportStatus;
  deleted_at: string;
  report_types: { name: string } | null;
}

export default async function TrashPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('reports')
    .select('id,vessel_name,variant,status,deleted_at,report_types(name)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  const rows = (data ?? []) as unknown as TrashedReport[];

  return (
    <div style={{ padding: '26px 32px 30px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Lixeira</h1>
        <p style={{ margin: '5px 0 0', color: 'var(--rocha)', fontSize: 13.5 }}>
          Relatórios ficam preservados aqui até serem restaurados ou excluídos
          definitivamente.
        </p>
      </div>

      <div
        style={{
          background: '#fff',
          border: '1px solid var(--borda)',
          borderRadius: 12,
          overflowX: 'auto',
        }}
      >
        {rows.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '100px 1.4fr 1.2fr 120px 140px 270px',
              gap: 12,
              minWidth: 980,
              padding: '12px 20px',
              background: '#fbfaf8',
              borderBottom: '1px solid var(--borda)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--rocha)',
            }}
          >
            <div>ID</div>
            <div>Navio</div>
            <div>Tipo · Variante</div>
            <div>Status</div>
            <div>Excluído em</div>
            <div />
          </div>
        )}
        {rows.map((report) => (
          <div
            key={report.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '100px 1.4fr 1.2fr 120px 140px 270px',
              gap: 12,
              minWidth: 980,
              alignItems: 'center',
              padding: '15px 20px',
              borderBottom: '1px solid #f2efe9',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--navy)',
              }}
            >
              {report.id.slice(0, 8)}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {report.vessel_name ?? '—'}
            </div>
            <div style={{ fontSize: 13, color: '#4a443c' }}>
              {report.report_types?.name ?? '—'} · {report.variant ?? '—'}
            </div>
            <StatusBadge status={report.status} />
            <div style={{ fontSize: 12, color: 'var(--rocha)' }}>
              {fmtDate(report.deleted_at)}
            </div>
            <TrashReportActions
              reportId={report.id}
              vesselName={report.vessel_name}
            />
          </div>
        ))}
        {rows.length === 0 && (
          <div
            style={{
              padding: 44,
              textAlign: 'center',
              color: 'var(--rocha)',
              fontSize: 14,
            }}
          >
            A lixeira está vazia.
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
