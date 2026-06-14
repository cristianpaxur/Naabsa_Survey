import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@naabsa/db';
import type { TipTapDoc, TipTapNode } from '@naabsa/core';

/**
 * Resolução de fotos para o render de /print (008/T-007, RNF-02).
 *
 * O `document_json` guarda em cada `photoFrame.src` o CAMINHO de Storage da
 * foto processada (não uma URL assinada — que expiraria). Antes de renderizar,
 * trocamos cada caminho por uma URL assinada fresca (≤ 10 min). Assim o preview
 * (operador) e o PDF (worker) sempre usam a mesma rota e URLs válidas.
 */

const BUCKET = 'reports';
const SIGNED_TTL = 600; // 10 min (RNF-05)

function isPath(src: unknown): src is string {
  return typeof src === 'string' && src.length > 0 && !/^https?:\/\//i.test(src);
}

/** Coleta os caminhos de Storage de todos os photoFrame do doc. */
function collectPhotoPaths(doc: TipTapDoc): Set<string> {
  const paths = new Set<string>();
  const visit = (node: TipTapNode): void => {
    if (node.type === 'photoFrame' && isPath(node.attrs?.src)) {
      paths.add(node.attrs!.src as string);
    }
    node.content?.forEach(visit);
  };
  doc.content.forEach(visit);
  return paths;
}

/** Devolve uma cópia do node com src trocado conforme o mapa (recursivo). */
function mapNode(node: TipTapNode, signed: Map<string, string>): TipTapNode {
  let next = node;
  if (node.type === 'photoFrame' && isPath(node.attrs?.src)) {
    const url = signed.get(node.attrs!.src as string);
    if (url) {
      next = { ...node, attrs: { ...node.attrs, src: url } };
    }
  }
  if (next.content) {
    next = { ...next, content: next.content.map((c) => mapNode(c, signed)) };
  }
  return next;
}

/**
 * Substitui os caminhos de Storage dos photoFrame por URLs assinadas. Usa o
 * service client (acesso ao bucket privado). Retorna um novo doc; o original
 * não é mutado.
 */
export async function resolvePhotoUrls(
  doc: TipTapDoc,
  service: SupabaseClient<Database>,
): Promise<TipTapDoc> {
  const paths = collectPhotoPaths(doc);
  if (paths.size === 0) return doc;

  const signed = new Map<string, string>();
  const { data } = await service.storage
    .from(BUCKET)
    .createSignedUrls(Array.from(paths), SIGNED_TTL);
  for (const u of data ?? []) {
    if (u.signedUrl && u.path) signed.set(u.path, u.signedUrl);
  }

  return { ...doc, content: doc.content.map((n) => mapNode(n, signed)) };
}
