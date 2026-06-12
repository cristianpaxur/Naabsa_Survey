import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

// Rotas públicas (não exigem sessão). A rota de impressão tem auth própria
// (token de serviço / sessão — implementação 004).
function isPublic(pathname: string): boolean {
  if (pathname === '/login') return true;
  if (/^\/reports\/[^/]+\/print$/.test(pathname)) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);

  // getUser() valida o token no servidor e mantém a sessão fresca.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // Logado tentando ver o login → vai para o dashboard.
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (isPublic(pathname)) return response;

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Tem sessão: exige papel (RF-02). Sem profile → acesso negado.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) {
    if (pathname === '/acesso-negado') return response;
    return NextResponse.redirect(new URL('/acesso-negado', request.url));
  }

  return response;
}

export const config = {
  // Roda nas páginas; ignora api (auth própria), estáticos e imagens.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
