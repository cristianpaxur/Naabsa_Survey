import { test, expect } from '@playwright/test';

// Credenciais do seed de dev (pnpm db:seed-dev).
const OPERATOR = { email: 'operador@naabsa.dev', password: 'naabsa123' };

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
});
