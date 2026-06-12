import Ajv, { type ErrorObject } from 'ajv';
import schema from './spec.schema.json';
import type { ReportSpec } from '../types';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn = ajv.compile(schema);

export interface SpecValid {
  valid: true;
  spec: ReportSpec;
}
export interface SpecInvalid {
  valid: false;
  errors: string[];
}
export type SpecValidationResult = SpecValid | SpecInvalid;

/**
 * Valida um candidato a report spec contra o JSON Schema (PRD §8).
 * Erros em pt-BR, prontos para exibição na UI do admin (impl 009).
 */
export function validateSpec(input: unknown): SpecValidationResult {
  // `ok` em variável (não inline) para `input` permanecer `unknown` — evita o
  // estreitamento ao tipo inferido do schema pelo type-guard do ajv.
  const ok = validateFn(input);
  if (ok) {
    return { valid: true, spec: input as unknown as ReportSpec };
  }
  const raw = validateFn.errors ?? [];
  // Dedup mantendo ordem (oneOf/allOf podem repetir mensagens).
  const errors = [...new Set(raw.map(formatError))];
  return { valid: false, errors };
}

function pathLabel(instancePath: string): string {
  if (!instancePath) return 'raiz do spec';
  return instancePath.replace(/^\//, '').replace(/\//g, ' › ');
}

function formatError(err: ErrorObject): string {
  const at = pathLabel(err.instancePath);
  const params = err.params as Record<string, unknown>;
  switch (err.keyword) {
    case 'required':
      return `Campo obrigatório ausente: '${String(params['missingProperty'])}' (em ${at}).`;
    case 'additionalProperties':
      return `Propriedade não permitida: '${String(params['additionalProperty'])}' (em ${at}).`;
    case 'enum':
      return `Valor inválido em ${at}: deve ser um de ${JSON.stringify(params['allowedValues'])}.`;
    case 'const':
      return `Valor inválido em ${at}: deve ser ${JSON.stringify(params['allowedValue'])}.`;
    case 'type':
      return `Tipo inválido em ${at}: esperado ${String(params['type'])}.`;
    case 'pattern':
      return `Formato inválido em ${at} (padrão ${String(params['pattern'])}).`;
    case 'minItems':
      return `Lista muito curta em ${at}: mínimo de ${String(params['limit'])} item(ns).`;
    case 'minProperties':
      return `Objeto vazio em ${at}: ao menos ${String(params['limit'])} propriedade(s).`;
    case 'minLength':
      return `Texto vazio/curto em ${at} (mínimo ${String(params['limit'])}).`;
    case 'minimum':
      return `Valor abaixo do mínimo em ${at} (mínimo ${String(params['limit'])}).`;
    case 'anyOf':
      return `Combinação inválida em ${at} (ex.: regra 'range' exige 'min' ou 'max').`;
    case 'oneOf':
      return `Estrutura inválida em ${at}: não corresponde a nenhuma forma válida (ex.: validação deve ser 'compare' ou 'range').`;
    case 'if':
      // Condição if/then/else falhou — a mensagem específica vem de outro erro.
      return `Restrição condicional não satisfeita em ${at} (ex.: 'date' exige 'format'; 'enum' exige 'options').`;
    default:
      return `${at}: ${err.message ?? 'inválido'}.`;
  }
}
