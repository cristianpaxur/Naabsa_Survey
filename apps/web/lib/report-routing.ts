import type { ReportStatus } from './state-machine';

/** Rota de abertura de um relatório conforme o status (mapa `openReport` do protótipo). */
export function reportHref(id: string, status: ReportStatus): string {
  switch (status) {
    case 'draft':
    case 'extracted':
    case 'in_review':
      return `/reports/${id}/review`;
    case 'editing':
    case 'approved':
    case 'generated':
      // O editor abre approved/generated em modo preview (PDF real); ver edit/page.tsx.
      return `/reports/${id}/edit`;
    case 'purged':
      return `/reports/${id}/history`;
  }
}
