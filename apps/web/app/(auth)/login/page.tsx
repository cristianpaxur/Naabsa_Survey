'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !pass.trim()) {
      setError('Preencha e-mail e senha para continuar.');
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pass,
    });
    if (authError) {
      setError('E-mail ou senha inválidos.');
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '1.05fr 1fr',
      }}
    >
      {/* Painel institucional (navy) */}
      <section
        style={{
          background: 'var(--navy)',
          padding: '48px 52px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(#ffffff0a 1px, transparent 1px)',
            backgroundSize: '100% 38px',
            opacity: 0.5,
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Logo size={30} />
          <span
            style={{
              fontWeight: 800,
              fontSize: 21,
              letterSpacing: '.14em',
              color: '#fff',
            }}
          >
            NAABSA
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <div
            style={{
              width: 46,
              height: 4,
              background: 'var(--vermelho)',
              borderRadius: 3,
              marginBottom: 24,
            }}
          />
          <h1
            style={{
              fontSize: 31,
              fontWeight: 800,
              color: '#fff',
              lineHeight: 1.12,
              letterSpacing: '-.02em',
              margin: 0,
            }}
          >
            Relatórios de inspeção
            <br />
            marítima, automatizados.
          </h1>
          <p
            style={{
              marginTop: 16,
              fontSize: 14,
              color: '#aeb8cc',
              lineHeight: 1.6,
              maxWidth: 380,
            }}
          >
            Da planilha ao PDF, com extração determinística e o operador no
            controle de cada etapa.
          </p>
        </div>
        <div
          style={{
            position: 'relative',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: '#6f7a95',
            letterSpacing: '.03em',
          }}
        >
          ACESSO INTERNO · 1–3 OPERADORES
        </div>
      </section>

      {/* Formulário */}
      <section
        style={{
          background: 'var(--papel)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
        }}
      >
        <form onSubmit={onSubmit} style={{ width: 360 }}>
          <div
            style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.01em' }}
          >
            Entrar
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--rocha)', marginTop: 6 }}>
            Use as credenciais fornecidas pelo administrador.
          </div>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: '#fbeceb',
                border: '1px solid #f0c4c2',
                borderRadius: 9,
                padding: '11px 13px',
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'var(--vermelho)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  flex: 'none',
                }}
              >
                !
              </span>
              <span style={{ fontSize: 13, color: '#9b2a2c' }}>{error}</span>
            </div>
          )}

          <Field label="E-mail">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="voce@naabsa.com.br"
              style={inputStyle}
            />
          </Field>

          <div style={{ marginTop: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <label style={labelStyle}>Senha</label>
              <span
                style={{ fontSize: 12, color: 'var(--navy)', fontWeight: 600 }}
              >
                Esqueci minha senha
              </span>
            </div>
            <input
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              type="password"
              placeholder="••••••••"
              style={{ ...inputStyle, marginTop: 7 }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 24,
              width: '100%',
              height: 48,
              background: 'var(--navy)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
              letterSpacing: '.01em',
              opacity: loading ? 0.8 : 1,
            }}
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>

          <div
            style={{
              marginTop: 20,
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: '#b5ab9d',
            }}
          >
            SUPABASE AUTH · TLS · v1.0.0
          </div>
        </form>
      </section>
    </main>
  );
}

const inputStyle = {
  marginTop: 7,
  width: '100%',
  height: 46,
  background: '#fff',
  border: '1px solid #d9d4cb',
  borderRadius: 9,
  padding: '0 14px',
  fontSize: 14,
  color: '#1d1d1d',
  outline: 'none',
} as const;

const labelStyle = {
  fontSize: 12.5,
  fontWeight: 600,
  color: '#3f3a33',
} as const;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 20 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Logo({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: '#fff',
        borderRadius: 6,
        position: 'relative',
        flex: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: size * 0.2,
          bottom: size * 0.2,
          width: size * 0.3,
          height: size * 0.3,
          background: 'var(--vermelho)',
          borderRadius: 2,
        }}
      />
    </div>
  );
}
