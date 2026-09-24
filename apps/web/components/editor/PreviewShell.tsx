import type { ReactNode } from 'react';

export function PreviewShell({
  progress,
  children,
}: {
  progress: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ed-preview-shell">
      <div className="ed-preview-shell__progress">{progress}</div>
      <div className="ed-preview-shell__content">{children}</div>
    </div>
  );
}
