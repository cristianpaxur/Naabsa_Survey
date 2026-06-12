import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FilterBar, type TypeOption } from '@/components/dashboard/FilterBar';
import { reportHref } from '@/lib/report-routing';
import type { ReportStatus } from '@/lib/state-machine';

interface ReportRow {
  id: string;
  vessel_name: string | null;
  variant: string | null;
  status: ReportStatus;
  created_at: string;
  created_by: string;
  report_types: { slug: string; name: string } | null;
}

type SearchParams = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = str(sp.q);
  const typeSlug = str(sp.type);
  const status = str(sp.status);
  const period = str(sp.period);

  const supabase = await createClient();

  const { data: typesData } = await supabase
    .from('report_types')
    .select('id,slug,name')
    .order('name');
  const types = (typesData ?? []) as {
    id: string;
    slug: string;
    name: string;
  }[];
  const typeOptions: TypeOption[] = types.map((t) => ({
    slug: t.slug,
    name: t.name,
  }));

  let query = supabase
    .from('reports')
    .select(
      'id, vessel_name, variant, status, created_at, created_by, report_types(slug, name)',
    )
    .order('created_at', { ascending: false });

  const typeId = types.find((t) => t.slug === typeSlug)?.id;
  if (typeId) query = query.eq('report_type_id', typeId);
  if (status) query = query.eq('status', status);
  if (q) query = query.ilike('vessel_name', `%${q}%`);
  if (period) {
    const days = Number(period);
    if (Number.isFinite(days) && days > 0) {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      query = query.gte('created_at', since);
    }
  }

  const { data } = await query;
  const rows = (data ?? []) as unknown as ReportRow[];

  const { count: total } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true });

  const authorIds = [...new Set(rows.map((r) => r.created_by))];
  const authorMap = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id,display_name')
      .in('user_id', authorIds);
    for (const p of (profs ?? []) as {
      user_id: string;
      display_name: string;
    }[]) {
      authorMap.set(p.user_id, p.display_name);
    }
  }

  const GRID = '108px 1.5fr 1.4fr 130px 110px 90px 30px';

  return (
    <div>
      <div
        style={{
          padding: '26px 32px 18px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}
          >
            Relatórios
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--rocha)', marginTop: 4 }}>
            {rows.length} de {total ?? 0} · 30–50 produzidos por mês
          </div>
        </div>
        <Link
          href="/reports/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 9,
            height: 44,
            padding: '0 18px',
            background: 'var(--navy)',
            color: '#fff',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          + Novo relatório
        </Link>
      </div>

      <FilterBar types={typeOptions} />

      <div
        style={{
          margin: '0 32px 30px',
          background: '#fff',
          border: '1px solid var(--borda)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: GRID,
            padding: '13px 20px',
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
          <div>Atualizado</div>
          <div>Autor</div>
          <div />
        </div>

        {rows.map((r) => (
          <Link
            key={r.id}
            href={reportHref(r.id, r.status)}
            style={{
              display: 'grid',
              gridTemplateColumns: GRID,
              padding: '15px 20px',
              borderBottom: '1px solid #f2efe9',
              alignItems: 'center',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
                color: 'var(--navy)',
                fontWeight: 500,
              }}
            >
              {r.id.slice(0, 8)}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1d1d1d' }}>
              {r.vessel_name ?? '—'}
            </div>
            <div style={{ fontSize: 13.5, color: '#4a443c' }}>
              {r.report_types?.name ?? '—'}{' '}
              <span style={{ color: '#b5ab9d' }}>·</span>{' '}
              <span style={{ color: 'var(--rocha)' }}>{r.variant ?? '—'}</span>
            </div>
            <div>
              <StatusBadge status={r.status} />
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
                color: '#6f675c',
              }}
            >
              {fmtDate(r.created_at)}
            </div>
            <div style={{ fontSize: 13, color: '#4a443c' }}>
              {authorMap.get(r.created_by) ?? '—'}
            </div>
            <div style={{ color: '#c4bcb0', fontSize: 16, textAlign: 'right' }}>
              ›
            </div>
          </Link>
        ))}

        {rows.length === 0 && (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'var(--rocha)',
              fontSize: 13.5,
            }}
          >
            Nenhum relatório corresponde aos filtros.
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
