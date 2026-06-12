import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/ui/Sidebar';

/**
 * Shell autenticado (grupo (app)): sidebar + área de conteúdo. O middleware já
 * garante sessão+papel; aqui buscamos o profile para exibir nome/papel.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('profiles')
    .select('display_name,role')
    .eq('user_id', user.id)
    .maybeSingle();
  const profile = data as { display_name: string; role: string } | null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '230px 1fr',
        minHeight: '100vh',
      }}
    >
      <Sidebar
        displayName={profile?.display_name ?? 'Usuário'}
        role={profile?.role ?? 'operator'}
      />
      <main style={{ background: 'var(--papel)', minHeight: '100vh' }}>
        {children}
      </main>
    </div>
  );
}
