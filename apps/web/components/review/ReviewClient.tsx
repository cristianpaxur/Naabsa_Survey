'use client';

/**
 * ReviewClient — componente cliente da tela de revisão (implementação 006).
 *
 * Gerencia o estado local das issues (actualizadas por setOverride) e
 * orquestra FieldRow + PendingPanel.
 */
import { useState } from 'react';
import type { Issue } from '@naabsa/core';
import type { EffectiveSection } from '@/lib/effective-values';
import { FieldRow } from './FieldRow';
import { PendingPanel } from './PendingPanel';

interface ReviewClientProps {
  reportId: string;
  sections: EffectiveSection[];
  initialIssues: Issue[];
}

export function ReviewClient({
  reportId,
  sections,
  initialIssues,
}: ReviewClientProps) {
  const [issues, setIssues] = useState<Issue[]>(initialIssues);

  const totalFields = sections.reduce((acc, s) => acc + s.fields.length, 0);

  function issuesForField(name: string): Issue[] {
    return issues.filter((i) => i.field === name);
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 32,
        alignItems: 'flex-start',
      }}
    >
      {/* Área principal de campos por seção */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {sections.map((section) => (
          <section key={section.section} style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--rocha)',
                textTransform: 'uppercase',
                letterSpacing: '.1em',
                margin: '0 0 4px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {section.section}
            </h2>
            <div
              style={{
                background: '#fff',
                border: '1px solid var(--borda)',
                borderRadius: 10,
                padding: '0 20px',
              }}
            >
              {section.fields.map((ef) => (
                <FieldRow
                  key={ef.name}
                  reportId={reportId}
                  name={ef.name}
                  def={ef.def}
                  value={ef.value}
                  isOverride={ef.isOverride}
                  fieldIssues={issuesForField(ef.name)}
                  onIssuesUpdated={setIssues}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Painel lateral de pendências */}
      <PendingPanel
        reportId={reportId}
        issues={issues}
        totalFields={totalFields}
      />
    </div>
  );
}
