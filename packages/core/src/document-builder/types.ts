/**
 * Tipos exclusivos do document-builder (004/T-001).
 * Complementam os tipos do domínio em ../types.ts.
 */

import type { TipTapDoc } from './nodes';
import type { ReportSpec, FieldValue } from '../types';

/** Foto alocada em um slot, com URL assinada para render. */
export interface PhotoAlloc {
  slotId: string;
  photoId: string;
  /** URL assinada ou pública para a versão processada. */
  src: string;
  /** Recorte salvo pelo operador (proporções 0–1). */
  crop?: { x: number; y: number; width: number; height: number } | null;
}

/** Entrada do builder. */
export interface BuilderInput {
  spec: ReportSpec;
  variant: string | null;
  /** Valores efetivos (extracted_data + overrides já resolvidos). */
  data: Record<string, FieldValue>;
  /** Matrizes das tabelas range-based (v2) — usado pelas grades em T-012. */
  tables: Record<string, FieldValue[][]>;
  photos: PhotoAlloc[];
  /**
   * Imagens das abas da planilha (print pixel-perfeito via LibreOffice), por
   * fase (`initial`/`intermediate`/`final`) → caminho de Storage. Quando
   * presente, o "Draft details" embute a imagem; senão cai nas grades nativas.
   */
  sheetImages?: Record<string, string | null>;
}

/** Contrato que cada builder de tipo deve cumprir. */
export type ReportBuilder = (input: BuilderInput) => TipTapDoc;
