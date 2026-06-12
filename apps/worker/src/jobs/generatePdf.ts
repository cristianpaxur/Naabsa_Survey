/**
 * Job `generate_pdf` — implementação 004.
 * Abre /reports/[id]/print com Playwright (Chromium singleton), gera o PDF A4,
 * salva no Storage, grava o hash do document_json e transiciona para `generated`.
 * Concorrência 1 (RNF-04).
 */
export async function generatePdf(): Promise<void> {
  throw new Error(
    'generate_pdf ainda não implementado — ver implementação 004.',
  );
}
