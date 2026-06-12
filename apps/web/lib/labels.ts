/** Rótulos pt-BR de variantes e descrições de tipos (alinhados ao protótipo). */
const VARIANT_LABELS: Record<string, string> = {
  loading: 'Carregamento',
  discharge: 'Descarga',
  on_hire: 'On-Hire',
  off_hire: 'Off-Hire',
};

export function variantLabel(slug: string): string {
  return VARIANT_LABELS[slug] ?? slug;
}

const TYPE_DESCRIPTIONS: Record<string, string> = {
  draft_survey: 'Cálculo de calado · carga e descarga',
  bunker_surveyor: 'Medição de combustível a bordo',
  msc: 'Marine survey & condition',
  on_off_hire: 'Entrega e devolução de afretamento',
  rob: 'Remaining on board',
};

export function typeDescription(slug: string): string {
  return TYPE_DESCRIPTIONS[slug] ?? '';
}
