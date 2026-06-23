import type { Node as PMNode } from '@tiptap/pm/model';
import type { Transaction, EditorState } from '@tiptap/pm/state';

/**
 * Núcleo PURO do lockGuard (008/T-003). Sem dependências de runtime do TipTap
 * (apenas tipos, apagados na compilação) — testável em vitest node sem carregar
 * o editor. A fiação como extensão ProseMirror vive em ./lockGuard.ts.
 *
 * Princípio: todo nó travado (`photoFrame`, `dataTable`) existente no documento
 * ANTERIOR deve continuar existindo, idêntico (mesmo tipo + atributos), no doc
 * RESULTANTE. Checagem de "subconjunto de multiconjunto" independente de ordem —
 * adições (montagem inicial — RF-20) são permitidas.
 */

export const LOCKED_NODE_TYPES = ['photoFrame', 'dataTable', 'leaderLine'] as const;

/** Meta para permitir explicitamente uma transação (ex.: montagem programática). */
export const BYPASS_LOCK_GUARD = 'naabsaBypassLockGuard';

/** JSON.stringify com chaves ordenadas (determinístico p/ comparação). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/** Chave de identidade de um nó travado: tipo + atributos serializados. */
function lockedKey(node: PMNode): string {
  return `${node.type.name}::${stableStringify(node.attrs)}`;
}

/** Coleta as chaves de todos os nós travados de um doc (com multiplicidade). */
function collectLockedKeys(doc: PMNode): Map<string, number> {
  const counts = new Map<string, number>();
  doc.descendants((node) => {
    if ((LOCKED_NODE_TYPES as readonly string[]).includes(node.type.name)) {
      const key = lockedKey(node);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return false; // atoms — não há filhos a visitar
    }
    return true;
  });
  return counts;
}

/**
 * Retorna `true` se todos os nós travados de `oldDoc` continuam presentes
 * (idênticos) em `newDoc`. Função PURA.
 */
export function lockedNodesPreserved(oldDoc: PMNode, newDoc: PMNode): boolean {
  const oldKeys = collectLockedKeys(oldDoc);
  if (oldKeys.size === 0) return true; // nada a proteger

  const newKeys = collectLockedKeys(newDoc);
  for (const [key, oldCount] of oldKeys) {
    const newCount = newKeys.get(key) ?? 0;
    if (newCount < oldCount) return false; // removido ou alterado
  }
  return true;
}

/**
 * Decide se uma transação pode prosseguir. Transações sem mudança de doc ou
 * marcadas com BYPASS_LOCK_GUARD passam direto.
 */
export function transactionPreservesLocks(
  tr: Transaction,
  state: EditorState,
): boolean {
  if (tr.getMeta(BYPASS_LOCK_GUARD)) return true;
  if (!tr.docChanged) return true;
  return lockedNodesPreserved(state.doc, tr.doc);
}
