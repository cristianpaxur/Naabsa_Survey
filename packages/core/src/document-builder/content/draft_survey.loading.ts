/**
 * Conteúdo do Draft Survey — variante LOADING.
 * Delega ao módulo compartilhado `draft_survey.content` (reescrito 2026-06-23
 * para fidelidade ao modelo `MV-PERSEUS-I.model.docx`).
 */
import type { TipTapNode } from '../nodes';
import type { BuilderInput } from '../types';
import { buildDraftSurveyContent } from './draft_survey.content';

export function buildDraftLoadingContent(
  input: Pick<BuilderInput, 'data' | 'photos' | 'tables'>,
): TipTapNode[] {
  return buildDraftSurveyContent(input, 'loading');
}
