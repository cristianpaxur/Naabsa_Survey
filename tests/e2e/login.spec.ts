import { test, expect } from '@playwright/test';
import { checked, OPERATOR, service } from './fixtures';

const NOROLE = { email: `e2e-norole-${crypto.randomUUID()}@example.com`, password: 'E2E-NoRole-123!' };
let createdNoRoleId: string | undefined;
test.afterAll(async () => {
  if (createdNoRoleId) checked(await service().auth.admin.deleteUser(createdNoRoleId), 'cleanup usuário sem papel');
});

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

  test('usuário sem papel recebe erro e não mantém acesso ao dashboard', async ({ page }) => {
    const svc = service();
    const created = checked(await svc.auth.admin.createUser({ ...NOROLE, email_confirm: true }), 'criar usuário sem papel');
    if (!created.user) throw new Error('createUser não retornou usuário');
    createdNoRoleId = created.user.id;

    await page.goto('/login');
    await page.getByPlaceholder('voce@naabsa.com.br').fill(NOROLE.email);
    await page.getByPlaceholder('••••••••').fill(NOROLE.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Seu acesso não está ativo. Entre em contato com o administrador.', { exact: true })).toBeVisible();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});
