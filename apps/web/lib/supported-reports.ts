/** Tipos com pipeline nativo implementado. Adicionar junto ao builder e seu aceite. */
export function supportsReport(slug: string): boolean {
  return slug === 'draft_survey' || slug === 'msc';
}
