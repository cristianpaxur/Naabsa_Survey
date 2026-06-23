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
  if (!ok) {
    const raw = validateFn.errors ?? [];
    // Dedup mantendo ordem (oneOf/allOf podem repetir mensagens).
    const errors = [...new Set(raw.map(formatError))];
    return { valid: false, errors };
  }

  // Estrutura válida pelo schema → checagens semânticas do contrato (v1/v2),
  // que o JSON Schema sozinho não expressa (requiredness condicional por aba).
  const semantic = semanticChecks(input as unknown as ReportSpec);
  if (semantic.length > 0) return { valid: false, errors: semantic };

  return { valid: true, spec: input as unknown as ReportSpec };
}

/**
 * Regras dependentes do contrato (§3.4.1 da impl 003):
 *  - v1 (contract ausente/1): `source.sheet` é obrigatório (aba única).
 *  - v2 (contract 2): `sheet` é obrigatório no fingerprint e em cada campo;
 *    valores de `variant_source.map` devem existir em `variants`.
 */
function semanticChecks(spec: ReportSpec): string[] {
  const errors: string[] = [];
  const contract = spec.contract ?? 1;
  const src = spec.source;

  if (contract === 1) {
    if (!src.sheet) {
      errors.push(
        "Contrato v1: 'source.sheet' é obrigatório (ou defina 'contract: 2' para multi-aba).",
      );
    }
    return errors;
  }

  // contract === 2 (multi-aba)
  if (!src.fingerprint.sheet) {
    errors.push("Contrato v2: 'source.fingerprint.sheet' é obrigatório.");
  }

  const blocks: [string, Record<string, { sheet?: string }>][] = [
    ['common', src.common.fields],
  ];
  for (const [variant, block] of Object.entries(src.by_variant ?? {})) {
    blocks.push([`by_variant › ${variant}`, block.fields]);
  }
  for (const [where, fields] of blocks) {
    for (const [name, field] of Object.entries(fields)) {
      if (!field.sheet) {
        errors.push(
          `Contrato v2: campo '${name}' (em ${where}) precisa de 'sheet'.`,
        );
      }
    }
  }

  if (src.variant_source) {
    const variants = new Set(spec.variants);
    for (const target of Object.values(src.variant_source.map)) {
      if (!variants.has(target)) {
        errors.push(
          `'variant_source.map' aponta para a variante '${target}', ausente em 'variants'.`,
        );
      }
    }
  }

  return errors;
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
