import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { loadUIPhotos } from '@/lib/photos';

/**
 * Lista as fotos do relatório com URLs assinadas (≤ 10 min) — usado pelo
 * polling da galeria (RNF-05). Requer sessão; a leitura segue a RLS do usuário.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  }

  const photos = await loadUIPhotos(supabase, createServiceClient(), id);
  return NextResponse.json({ photos });
}
