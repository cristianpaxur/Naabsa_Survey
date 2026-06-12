/**
 * Tipos do domínio do motor (contrato do report spec — PRD §8).
 *
 * O spec é JSONB validado por `validateSpec` (spec-schema/) e consumido pelo
 * extractor e pelo document-builder. Nenhum código conhece um relatório
 * específico (princípio nº 2 do PRD): todo conhecimento vive no spec.
 */

// ── Campos ──

export type FieldType = 'string' | 'number' | 'date' | 'enum' | 'boolean';

/** Atributos comuns a todos os tipos de campo. */
export interface BaseFieldDef {
  /** Célula de origem (ex.: "B7"). */
  cell: string;
  /** Rótulo exibido na revisão. */
  label: string;
  /** Seção de agrupamento na revisão. */
  section: string;
  required?: boolean;
  /** Validações numéricas/derivadas por campo. */
  min?: number;
  max?: number;
  /** Regex (string) aplicada ao valor textual. */
  pattern?: string;
}

export interface StringFieldDef extends BaseFieldDef {
  type: 'string';
}
export interface NumberFieldDef extends BaseFieldDef {
  type: 'number';
  /** Casas decimais (precisão de exibição). */
  decimals?: number;
}
export interface DateFieldDef extends BaseFieldDef {
  type: 'date';
  /** Formato de exibição (ex.: "DD/MMM/YYYY"). O valor extraído é ISO (YYYY-MM-DD). */
  format: string;
}
export interface EnumFieldDef extends BaseFieldDef {
  type: 'enum';
  options: string[];
}
export interface BooleanFieldDef extends BaseFieldDef {
  type: 'boolean';
}

export type FieldDef =
  | StringFieldDef
  | NumberFieldDef
  | DateFieldDef
  | EnumFieldDef
  | BooleanFieldDef;

export interface FieldsBlock {
  fields: Record<string, FieldDef>;
}

// ── Fonte (planilha) ──

export interface Fingerprint {
  cell: string;
  expect: string;
}

export interface SpecSource {
  /** Nome da aba a ler. */
  sheet: string;
  fingerprint: Fingerprint;
  common: FieldsBlock;
  /** Campos por variante (chave = nome da variante). */
  by_variant?: Record<string, FieldsBlock>;
}

// ── Validações cruzadas ──

export type CompareOp = '>=' | '<=' | '>' | '<' | '==' | '!=';

export interface CompareValidation {
  rule: 'compare';
  left: string;
  op: CompareOp;
  right: string;
  level: IssueLevel;
  message: string;
}

export interface RangeValidation {
  rule: 'range';
  field: string;
  min?: number;
  max?: number;
  level: IssueLevel;
  message: string;
}

export type ValidationRule = CompareValidation | RangeValidation;

// ── Slots de foto ──

export interface PhotoSlot {
  id: string;
  label: string;
  /** Aspect ratio (ex.: "4:3", "16:9"). */
  aspect: string;
  required?: boolean;
  min?: number;
  max?: number;
}

// ── Spec completo ──

export interface ReportSpec {
  report_type: string;
  version: number;
  /** Vazio quando o tipo não tem variantes. */
  variants: string[];
  source: SpecSource;
  validations?: ValidationRule[];
  photo_slots?: PhotoSlot[];
}

// ── Saída da extração ──

export type IssueLevel = 'error' | 'warning';
export type IssueOrigin = 'extraction' | 'validation' | 'ai';

export interface Issue {
  /** Campo do spec (ou identificador da regra cruzada). */
  field: string;
  /** Célula de origem; null para issues sem célula (ex.: regra cruzada). */
  cell: string | null;
  level: IssueLevel;
  message: string;
  origin: IssueOrigin;
}

/** Valor efetivo de um campo após coerção (serializável em JSONB). */
export type FieldValue = string | number | boolean | null;

export interface ExtractionResult {
  data: Record<string, FieldValue>;
  issues: Issue[];
}
