import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { transactionPreservesLocks } from './lockGuard.core';

/**
 * lockGuard (008/T-003, PRD RF-22).
 *
 * `filterTransaction` que cancela qualquer transação que REMOVA ou ALTERE um
 * nó travado (`photoFrame`, `dataTable`) já presente no documento. Cobre delete
 * direto, select-all + delete, replace por paste, e undo que desmontaria o
 * documento (spec §6.4). A lógica pura (testável) está em ./lockGuard.core.
 */

export {
  LOCKED_NODE_TYPES,
  BYPASS_LOCK_GUARD,
  lockedNodesPreserved,
  transactionPreservesLocks,
} from './lockGuard.core';

export const lockGuardPluginKey = new PluginKey('naabsaLockGuard');

/** Extensão TipTap que instala o filtro de transação. */
export const LockGuard = Extension.create({
  name: 'lockGuard',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: lockGuardPluginKey,
        filterTransaction(tr, state) {
          return transactionPreservesLocks(tr, state);
        },
      }),
    ];
  },
});
