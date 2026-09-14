import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

/** O browser acessa somente a origem HTTPS do app; Storage permanece privado. */
export async function GET(request: Request, { params }: {
  params: Promise<{ id: string; photoId: string }>;
}) {
  const { id, photoId } = await params;
  const size = new URL(request.url).searchParams.get('size') ?? 'thumb';
  if (!['thumb', 'full'].includes(size)) return new Response(null, { status: 400, headers });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401, headers });
  // RLS valida o acesso ativo antes de qualquer leitura com service role.
  const { data, error } = await supabase.from('report_photos')
    .select('thumb_path,processed_path').eq('id', photoId).eq('report_id', id)
    .eq('status', 'done').is('removed_at', null).maybeSingle();
  if (error) return new Response(null, { status: 503, headers });
  const photo = data as { thumb_path: string | null; processed_path: string | null } | null;
  if (!photo) return new Response(null, { status: 404, headers });
  const paths = [...new Set(size === 'thumb' ? [photo.thumb_path, photo.processed_path] : [photo.processed_path])]
    .filter((path): path is string => !!path && path.startsWith(`${id}/photos/`)
      && !path.split('/').includes('..') && /\.(jpe?g|png)$/i.test(path));
  if (!paths.length) return new Response(null, { status: 404, headers });
  const storage = createServiceClient().storage.from('reports');
  for (const path of paths) {
    const { data: blob, error: downloadError } = await storage.download(path);
    if (!downloadError && blob) return new Response(blob, { headers: {
      ...headers, 'Content-Type': /\.png$/i.test(path) ? 'image/png' : 'image/jpeg',
    } });
  }
  return new Response(null, { status: 503, headers });
}
