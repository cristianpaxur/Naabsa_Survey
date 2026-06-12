/**
 * @naabsa/core — motor puro do sistema de relatórios.
 *
 * TypeScript puro: NÃO importa Next.js, Supabase nem o worker (PRD §7, regra
 * de lint em eslint.config.mjs). Submódulos:
 *  - spec-schema     → JSON Schema do spec + validateSpec (implementação 003)
 *  - extractor       → leitura/validação de planilha + resolveFieldValue (003)
 *  - document-builder→ template → JSON TipTap (implementação 004)
 */
export * from './types';
export * from './spec-schema';
export * from './extractor';
export * from './document-builder';
