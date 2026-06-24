/**
 * Tela 08 — Histórico (010/T-002, RF-33 / RNF-07).
 *
 * Timeline cronológica do audit_log de um relatório: hora (mono), ponto colorido
 * por tipo de ação, rótulo legível, chip do ator e detalhe em mono. Responde
 * "o que veio da planilha, o que foi editado, por quem e quando".
 */
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { ReportStatus } from '@/lib/state-machine';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface AuditRow {
  id: string;
  actor: string | null;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

/** Rótulo + cor do ponto por tipo de ação (design system, spec 010 §9). */
const NAVY = 'var(--navy)';
const ROCHA = 'var(--rocha)';
const VERMELHO = '#bf2c30';
const AZUL = '#2563eb';
const AMBAR = '#d97706';
const VERDE = '#16a34a';

const ACTION_META: Record<string, { label: string; color: string }> = {
  created: { label: 'Relatório criado', color: NAVY },
  upload: { label: 'Planilha enviada', color: AZUL },
  extraction: { label: 'Extração de dados', color: ROCHA },
  override: { label: 'Campo editado', color: AMBAR },
  document_snapshot: { label: 'Snapshot do documento', color: AMBAR },
  document_assembled: { label: 'Documento montado', color: ROCHA },
  transition: { label: 'Status alterado', color: VERMELHO },
  pdf_enqueued: { label: 'PDF enfileirado', color: ROCHA },
  pdf_generated: { label: 'PDF gerado', color: VERDE },
  pdf_rejected: { label: 'PDF rejeitado', color: VERMELHO },
  retention_purged: { label: 'Dados purgados (retenção)', color: VERMELHO },
  ai_call: { label: 'Chamada de IA', color: ROCHA },
  ai_review: { label: 'Revisão por IA', color: ROCHA },
  allocate: { label: 'Foto alocada', color: VERDE },
  photo_confirmed: { label: 'Sugestão de foto confirmada', color: VERDE },
};
const actionMeta = (a: string) => ACTION_META[a] ?? { label: a, color: ROCHA };

/** Detalhe legível (mono) a partir do payload, por tipo de ação. */
function formatDetail(action: string, p: Record<string, unknown> | null): string {
  if (!p) return '';
  const s = (k: string) => (p[k] == null ? '' : String(p[k]));
  switch (action) {
    case 'override':
      return `${s('field')}${p['cell'] ? ` (${s('cell')})` : ''}: «${s('before')}» → «${s('after')}»`;
    case 'transition':
      return `${s('from')} → ${s('to')}`;
    case 'upload':
      return s('file');
    case 'extraction':
      return `${s('fields')} campos · ${s('errors')} erros · ${s('warnings')} avisos`;
    case 'pdf_generated':
      return s('storage_path') || (s('document_hash') ? `hash ${s('document_hash').slice(0, 12)}…` : '');
    case 'pdf_rejected':
      return s('reason');
    case 'retention_purged':
      return `${s('removed_blobs')} blobs removidos`;
    case 'document_assembled':
      return [s('slug'), s('variant')].filter(Boolean).join(' · ');
    case 'ai_call':
      return [s('purpose'), s('duration_ms') ? `${s('duration_ms')} ms` : ''].filter(Boolean).join(' · ');
    default: {
      const keys = Object.keys(p);
      return keys.length ? keys.map((k) => `${k}: ${s(k)}`).join(' · ').slice(0, 160) : '';
    }
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default async function HistoryPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: reportRaw } = await supabase
    .from('reports')
    .select('id, status, vessel_name')
    .eq('id', id)
    .maybeSingle();
  const report = reportRaw as { id: string; status: string; vessel_name: string | null } | null;
  if (!report) notFound();

  const { data: rowsRaw } = await supabase
    .from('audit_log')
    .select('id, actor, action, payload, created_at')
    .eq('report_id', id)
    .order('created_at', { ascending: true });
  const rows = (rowsRaw as AuditRow[] | null) ?? [];

  // Resolve nomes dos atores (service role — profiles tem RLS própria/admin).
  const actorIds = [...new Set(rows.map((r) => r.actor).filter((a): a is string => !!a))];
  const names: Record<string, string> = {};
  if (actorIds.length) {
    const svc = createServiceClient();
    const { data: profs } = await svc
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', actorIds);
    for (const p of (profs as { user_id: string; display_name: string }[] | null) ?? []) {
      names[p.user_id] = p.display_name;
    }
  }
  const actorName = (a: string | null) => (a ? (names[a] ?? 'Usuário') : 'Sistema');

  return (
    <div style={{ padding: '32px 36px', maxWidth: 920 }}>
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
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--tinta)' }}>Histórico</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--rocha)', fontFamily: 'var(--font-mono)' }}>
            {report.vessel_name ?? 'Relatório'} · {rows.length} evento{rows.length !== 1 ? 's' : ''}
          </p>
        </div>
        <StatusBadge status={report.status as ReportStatus} />
      </div>

      {rows.length === 0 ? (
        <p style={{ color: 'var(--rocha)', fontSize: 14 }}>Sem eventos registrados.</p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((r, i) => {
            const meta = actionMeta(r.action);
            const detail = formatDetail(r.action, r.payload);
            return (
              <li key={r.id} style={{ display: 'flex', gap: 14, position: 'relative' }}>
                {/* Coluna do ponto + linha vertical */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14 }}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: meta.color,
                      marginTop: 4,
                      flexShrink: 0,
                    }}
                  />
                  {i < rows.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--borda)' }} />}
                </div>
                {/* Conteúdo */}
                <div style={{ paddingBottom: 22, flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--rocha)', fontFamily: 'var(--font-mono)' }}>
                    {fmtTime(r.created_at)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tinta)' }}>{meta.label}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--navy)',
                        background: 'var(--papel, #faf8f5)',
                        border: '1px solid var(--borda)',
                        borderRadius: 999,
                        padding: '1px 8px',
                      }}
                    >
                      {actorName(r.actor)}
                    </span>
                  </div>
                  {detail && (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--rocha)',
                        fontFamily: 'var(--font-mono)',
                        marginTop: 3,
                        wordBreak: 'break-word',
                      }}
                    >
                      {detail}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
