'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

export function Sidebar({
  displayName,
  role,
}: {
  displayName: string;
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = role === 'admin';

  async function logout() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const novoActive = pathname === '/reports/new';
  const specsActive = pathname.startsWith('/admin');
  const relActive =
    pathname === '/dashboard' ||
    (pathname.startsWith('/reports/') && !novoActive);

  return (
    <aside
      style={{
        background: '#fbfaf8',
        borderRight: '1px solid var(--borda)',
        padding: '20px 14px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '4px 8px 20px',
        }}
      >
        <Logo size={24} />
        <span
          style={{
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: '.13em',
            color: 'var(--navy)',
          }}
        >
          NAABSA
        </span>
      </div>

      <SectionLabel>Trabalho</SectionLabel>
      <NavItem href="/dashboard" active={relActive}>
        Relatórios
      </NavItem>
      <NavItem href="/reports/new" active={novoActive}>
        Novo relatório
      </NavItem>

      {isAdmin && (
        <>
          <Divider />
          <SectionLabel>Administração</SectionLabel>
          <NavItem href="/admin/specs" active={specsActive}>
            Specs
          </NavItem>
        </>
      )}

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '10px 10px',
          borderTop: '1px solid var(--borda)',
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'var(--navy)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            flex: 'none',
          }}
        >
          {initials(displayName)}
        </div>
        <div style={{ lineHeight: 1.25, flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--rocha)' }}>
            {roleLabel(role)}
          </div>
        </div>
        <button
          onClick={logout}
          title="Sair"
          aria-label="Sair"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--rocha)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            padding: 4,
          }}
        >
          Sair
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        height: 40,
        padding: '0 12px',
        borderRadius: 9,
        fontSize: 14,
        fontWeight: 600,
        textDecoration: 'none',
        marginTop: 2,
        background: active ? 'var(--navy)' : 'transparent',
        color: active ? '#fff' : '#4a443c',
      }}
    >
      {children}
    </Link>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '.12em',
        color: '#b5ab9d',
        textTransform: 'uppercase',
        padding: '0 8px 8px',
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{ height: 1, background: 'var(--borda)', margin: '13px 8px' }}
    />
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function roleLabel(role: string): string {
  return role === 'admin' ? 'Admin' : 'Operador';
}

function Logo({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: 'var(--navy)',
        borderRadius: 5,
        position: 'relative',
        flex: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: size * 0.21,
          bottom: size * 0.21,
          width: size * 0.29,
          height: size * 0.29,
          background: 'var(--vermelho)',
          borderRadius: 2,
        }}
      />
    </div>
  );
}
