/**
 * Job `ai_review` — implementação 010 (atrás da flag AI_ENABLED).
 * Pós-extração: envia os dados extraídos + metadados do spec ao modelo e
 * transforma o retorno em issues de nível `warning` (origem `ai`). Falha/timeout
 * nunca bloqueia o fluxo (RNF-06).
 */
export async function aiReview(): Promise<void> {
  throw new Error('ai_review ainda não implementado — ver implementação 010.');
}
