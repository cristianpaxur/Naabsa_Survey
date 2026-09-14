import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  createUserAccess,
  deleteUserAccess,
  updateUserAccess,
} from '@/lib/actions/users';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type UserRow = {
  email: string;
  display_name: string;
  role: string;
  status: string;
  linked_user_id: string | null;
  last_login_at: string | null;
  created_at: string;
};

const inputStyle = {
  height: 40,
  border: '1px solid var(--borda)',
  borderRadius: 8,
  padding: '0 11px',
  background: '#fff',
  minWidth: 0,
} as const;
const buttonStyle = {
  height: 40,
  border: 0,
  borderRadius: 8,
  padding: '0 15px',
  background: 'var(--navy)',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: currentAdmin } = await supabase.rpc('current_is_admin');
  if (currentAdmin !== true)
    redirect('/acesso-negado');
  const { data } = await supabase
    .from('user_access')
    .select(
      'email,display_name,role,status,linked_user_id,last_login_at,created_at',
    )
    .order('display_name');
  const users = (data ?? []) as UserRow[];
  const sp = await searchParams;
  const message = one(sp.ok) ?? one(sp.error);
  const isError = Boolean(one(sp.error));

  return (
    <div style={{ padding: '28px 32px 40px', maxWidth: 1180 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 26, letterSpacing: '-.02em' }}>
          Usuários
        </h1>
        <p style={{ color: 'var(--rocha)', margin: '5px 0 0', fontSize: 14 }}>
          Cadastre quem pode acessar o sistema e controle papel e status.
        </p>
      </div>

      {message && (
        <div
          role="alert"
          style={{
            padding: '12px 14px',
            marginBottom: 18,
            borderRadius: 9,
            background: isError ? '#fff0f0' : '#eef8f1',
            color: isError ? 'var(--vermelho)' : '#28633a',
            border: `1px solid ${isError ? '#f0caca' : '#cce5d3'}`,
          }}
        >
          {message}
        </div>
      )}

      <section
        style={{
          background: '#fff',
          border: '1px solid var(--borda)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 22,
        }}
      >
        <h2 style={{ fontSize: 16, margin: '0 0 14px' }}>Adicionar usuário</h2>
        <form
          action={createUserAccess}
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 1.3fr 180px 150px auto',
            gap: 10,
          }}
        >
          <input
            name="display_name"
            aria-label="Nome"
            placeholder="Nome completo"
            required
            minLength={2}
            style={inputStyle}
          />
          <input
            name="password"
            aria-label="Senha inicial"
            placeholder="Senha inicial"
            required
            type="password"
            minLength={8}
            autoComplete="new-password"
            style={inputStyle}
          />
          <input
            name="email"
            aria-label="E-mail"
            placeholder="usuario@empresa.com"
            required
            type="email"
            style={inputStyle}
          />
          <select
            name="role"
            aria-label="Papel"
            defaultValue="operator"
            style={inputStyle}
          >
            <option value="operator">Operador</option>
            <option value="admin">Administrador</option>
          </select>
          <button style={buttonStyle}>Adicionar</button>
        </form>
      </section>

      <section
        style={{
          background: '#fff',
          border: '1px solid var(--borda)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--borda)',
            fontWeight: 700,
          }}
        >
          {users.length} {users.length === 1 ? 'usuário' : 'usuários'}
        </div>
        {users.length === 0 && (
          <div
            style={{ padding: 30, textAlign: 'center', color: 'var(--rocha)' }}
          >
            Nenhum usuário cadastrado.
          </div>
        )}
        {users.map((item) => (
          <form
            key={item.email}
            action={updateUserAccess}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.05fr 1.2fr 135px 120px 150px 110px auto',
              gap: 10,
              alignItems: 'center',
              padding: '13px 18px',
              borderBottom: '1px solid #f2efe9',
            }}
          >
            <input type="hidden" name="email" value={item.email} />
            <input
              name="display_name"
              aria-label={`Nome de ${item.email}`}
              defaultValue={item.display_name}
              required
              style={inputStyle}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.email}
              </div>
              <div
                style={{ color: 'var(--rocha)', fontSize: 11, marginTop: 3 }}
              >
                {item.linked_user_id
                  ? 'Conta vinculada'
                  : 'Aguardando primeiro login'}
              </div>
            </div>
            <select
              name="role"
              aria-label={`Papel de ${item.email}`}
              defaultValue={item.role}
              style={inputStyle}
            >
              <option value="operator">Operador</option>
              <option value="admin">Administrador</option>
            </select>
            <select
              name="status"
              aria-label={`Status de ${item.email}`}
              defaultValue={item.status}
              style={inputStyle}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
            <input
              name="password"
              aria-label={`Nova senha de ${item.email}`}
              placeholder="Nova senha (opcional)"
              type="password"
              minLength={8}
              autoComplete="new-password"
              style={inputStyle}
            />
            <div style={{ fontSize: 12, color: 'var(--rocha)' }}>
              {item.last_login_at
                ? new Intl.DateTimeFormat('pt-BR').format(
                    new Date(item.last_login_at),
                  )
                : 'Nunca acessou'}
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              <button style={{ ...buttonStyle, height: 36, padding: '0 12px' }}>
                Salvar
              </button>
              <button
                formAction={deleteUserAccess}
                aria-label={`Excluir ${item.email}`}
                style={{
                  height: 36,
                  border: '1px solid #e4bcbc',
                  borderRadius: 8,
                  padding: '0 10px',
                  background: '#fff',
                  color: 'var(--vermelho)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Excluir
              </button>
            </div>
          </form>
        ))}
      </section>
    </div>
  );
}
