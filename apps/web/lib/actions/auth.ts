'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export interface LoginState {
  error: string | null;
}

/**
 * Login via Server Action: o cliente de servidor grava a sessão nos cookies
 * (de forma confiável, antes do redirect) — evita o race do cliente browser em
 * que o middleware ainda não enxerga a sessão recém-criada.
 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) {
    return { error: 'Preencha e-mail e senha para continuar.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: 'E-mail ou senha inválidos.' };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
