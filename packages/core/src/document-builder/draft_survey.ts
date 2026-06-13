/**
 * Builder do tipo draft_survey (004/T-003).
 *
 * Recebe spec + variant + dados efetivos + fotos e devolve o doc TipTap
 * completo. Texto estático por variante em content/.
 */

import { doc } from './nodes';
import { buildDraftDischargeContent } from './content/draft_survey.discharge';
import { buildDraftLoadingContent } from './content/draft_survey.loading';
import type { BuilderInput, ReportBuilder } from './types';
import type { TipTapDoc } from './nodes';

const SUPPORTED_TYPE = 'draft_survey';

/**
 * Builder do tipo draft_survey.
 *
 * @throws {Error} se `spec.report_type` não for "draft_survey" ou se a variante
 *   não for "loading" | "discharge" | null.
 */
export const buildDraftSurvey: ReportBuilder = (input: BuilderInput): TipTapDoc => {
  const { spec, variant } = input;

  if (spec.report_type !== SUPPORTED_TYPE) {
    throw new Error(
      `buildDraftSurvey: tipo incompatível "${spec.report_type}" (esperado "${SUPPORTED_TYPE}").`,
    );
  }

  let content;

  if (variant === 'discharge' || variant === null) {
    content = buildDraftDischargeContent(input);
  } else if (variant === 'loading') {
    content = buildDraftLoadingContent(input);
  } else {
    throw new Error(
      `buildDraftSurvey: variante desconhecida "${variant}". Esperado "loading" | "discharge" | null.`,
    );
  }

  return doc(content);
};
