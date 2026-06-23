/**
 * Tipos do domínio do motor (contrato do report spec — PRD §8).
 *
 * O spec é JSONB validado por `validateSpec` (spec-schema/) e consumido pelo
 * extractor e pelo document-builder. Nenhum código conhece um relatório
 * específico (princípio nº 2 do PRD): todo conhecimento vive no spec.
 */

// ── Campos ──

export type FieldType = 'string' | 'number' | 'date' | 'enum' | 'boolean' | 'time';

/** Atributos comuns a todos os tipos de campo. */
export interface BaseFieldDef {
  /**
   * Aba de origem (contrato v2 multi-aba). Quando ausente, usa-se
   * `source.sheet` (contrato v1, aba única). Em v2 é obrigatório por campo.
   */
  sheet?: string;
  /** Célula de origem (ex.: "B7"). */
  cell: string;
  /** Rótulo exibido na revisão. */
  label: string;
  /** Seção de agrupamento na revisão. */
  section: string;
  /** Sufixo de exibição no PDF (ex.: "m", "mt", "MT", "°", "cm"). */
  unit?: string;
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
export interface TimeFieldDef extends BaseFieldDef {
  type: 'time';
}

export type FieldDef =
  | StringFieldDef
  | NumberFieldDef
  | DateFieldDef
  | EnumFieldDef
  | BooleanFieldDef
  | TimeFieldDef;

export interface FieldsBlock {
  fields: Record<string, FieldDef>;
}

// ── Fonte (planilha) ──

export interface Fingerprint {
  /** Aba do fingerprint (v2). Ausente ⇒ usa `source.sheet` (v1). */
  sheet?: string;
  cell: string;
  expect: string;
}

/**
 * Origem da variante na própria planilha (v2). O extractor lê `cell` em `sheet`
 * e mapeia o texto encontrado para o nome da variante via `map`
 * (ex.: Draft Survey: `Capa!L4`, "Loading" → "loading").
 */
export interface VariantSource {
  sheet: string;
  cell: string;
  map: Record<string, string>;
}

/**
 * Tabela range-based (v2): um bloco retangular de células lido como matriz,
 * para recriar grades de cálculo como tabelas nativas no document-builder.
 */
export interface TableDef {
  id: string;
  label: string;
  sheet: string;
  /** Intervalo A1 na aba (ex.: "B8:H18"). */
  range: string;
  /** Fase associada (ex.: "initial" | "intermediate" | "final"). */
  phase?: string;
  /** Seção condicional: tabela vazia não gera erro (ex.: Intermediate). */
  optional?: boolean;
  /** Limites do range ainda a confirmar contra o render. */
  provisional?: boolean;
}

export interface SpecSource {
  /** Nome da aba a ler (contrato v1, aba única). Em v2 cada campo traz `sheet`. */
  sheet?: string;
  fingerprint: Fingerprint;
  /** Origem da variante na planilha (v2). */
  variant_source?: VariantSource;
  /** Abas a ignorar na extração (ex.: ["LOD-LOP"]). */
  ignore_sheets?: string[];
  common: FieldsBlock;
  /** Campos por variante (chave = nome da variante). */
  by_variant?: Record<string, FieldsBlock>;
  /** Tabelas range-based (v2). */
  tables?: TableDef[];
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
  /** Versão do contrato do spec: 1 (aba única) ou 2 (multi-aba). Ausente ⇒ 1. */
  contract?: number;
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
  /** Matrizes das tabelas range-based (v2). Chave = `TableDef.id`. */
  tables: Record<string, FieldValue[][]>;
  issues: Issue[];
}
