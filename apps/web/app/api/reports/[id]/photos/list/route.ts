import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadUIPhotos } from '@/lib/photos';

/**
 * Lista as fotos do relatório com URLs autenticadas da própria origem — usado pelo
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

  try {
    const photos = await loadUIPhotos(supabase, id);
    return NextResponse.json({ photos });
  } catch {
    return NextResponse.json({ error: 'Não foi possível atualizar as fotos. Tente novamente.' }, { status: 503 });
  }
}
