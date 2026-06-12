import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Credenciais do seed de dev (pnpm db:seed-dev).
const OPERATOR = { email: 'operador@naabsa.dev', password: 'naabsa123' };
// Usuário de teste SEM profile (sem papel) — provisionado neste arquivo.
const NOROLE = { email: 'sempapel@naabsa.dev', password: 'naabsa123' };

function service(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Garante um usuário autenticável sem linha em `profiles` (sem papel). */
async function ensureNoRoleUser(svc: SupabaseClient): Promise<string> {
  const { data: list } = await svc.auth.admin.listUsers({ perPage: 200 });
  let id = list?.users.find((u) => u.email === NOROLE.email)?.id ?? null;
  if (!id) {
    const { data, error } = await svc.auth.admin.createUser({
      email: NOROLE.email,
      password: NOROLE.password,
      email_confirm: true,
    });
    if (error) throw error;
    id = data.user.id;
  }
  // Sem papel: remove qualquer profile que exista para este usuário.
  await svc.from('profiles').delete().eq('user_id', id);
  return id;
}

test.describe('Autenticação (T-11)', () => {
  test('rota protegida sem sessão redireciona ao login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('credencial inválida mostra erro pt-BR', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('voce@naabsa.com.br').fill('errado@x.com');
    await page.getByPlaceholder('••••••••').fill('senhaerrada');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('E-mail ou senha inválidos.')).toBeVisible();
  });

  test('campos vazios mostram aviso', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(
      page.getByText('Preencha e-mail e senha para continuar.'),
    ).toBeVisible();
  });

  test('login feliz leva ao dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('voce@naabsa.com.br').fill(OPERATOR.email);
    await page.getByPlaceholder('••••••••').fill(OPERATOR.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    // 1ª Server Action em dev compila sob demanda — dá folga ao redirect.
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 25_000 });
    await expect(page.getByText(/produzidos por mês/)).toBeVisible();
  });

  test('usuário sem papel cai em acesso negado', async ({ page }) => {
    const svc = service();
    await ensureNoRoleUser(svc);

    await page.goto('/login');
    await page.getByPlaceholder('voce@naabsa.com.br').fill(NOROLE.email);
    await page.getByPlaceholder('••••••••').fill(NOROLE.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/acesso-negado$/, { timeout: 25_000 });
    await expect(
      page.getByRole('heading', { name: 'Acesso negado' }),
    ).toBeVisible();
  });
});
