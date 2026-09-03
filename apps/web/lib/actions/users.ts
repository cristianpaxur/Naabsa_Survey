'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  isUserRole,
  isUserStatus,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  wouldRemoveLastActiveAdmin,
  type UserRole,
} from '@/lib/users/rules';

type AccessRow = {
  email: string;
  role: UserRole;
  status: string;
  linked_user_id: string | null;
};

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if ((data as { role?: string } | null)?.role !== 'admin')
    redirect('/acesso-negado');
  return { actorId: user.id, service: createServiceClient() };
}

function go(message: string, kind: 'ok' | 'error' = 'ok'): never {
  redirect(`/admin/users?${kind}=${encodeURIComponent(message)}`);
}

async function auditUser(
  actorId: string,
  action: string,
  payload: Record<string, unknown>,
) {
  const service = createServiceClient();
  await service
    .from('audit_log')
    .insert({ report_id: null, actor: actorId, action, payload } as never);
}

export async function createUserAccess(formData: FormData) {
  const { actorId, service } = await requireAdmin();
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const displayName = String(formData.get('display_name') ?? '').trim();
  const role = String(formData.get('role') ?? 'operator');
  const password = String(formData.get('password') ?? '');
  if (!isValidEmail(email)) go('Informe um e-mail válido.', 'error');
  if (displayName.length < 2) go('Informe o nome do usuário.', 'error');
  if (!isUserRole(role)) go('Papel de usuário inválido.', 'error');
  if (!isValidPassword(password))
    go('A senha deve ter pelo menos 8 caracteres.', 'error');

  const { data: duplicate } = await service
    .from('user_access')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (duplicate) go('Já existe um usuário com esse e-mail.', 'error');

  // Cria a conta já confirmada para não depender de SMTP ou convite por e-mail.
  const { data: authUsers, error: listError } =
    await service.auth.admin.listUsers({ perPage: 1000 });
  if (listError) go('Não foi possível consultar as contas de acesso.', 'error');
  let authUser = authUsers.users.find(
    (candidate) => normalizeEmail(candidate.email ?? '') === email,
  );
  let createdAuthUser = false;
  if (!authUser) {
    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });
    if (createError || !created.user) {
      go('Não foi possível criar a conta de acesso.', 'error');
    }
    authUser = created.user;
    createdAuthUser = true;
  } else {
    const { error: passwordError } = await service.auth.admin.updateUserById(
      authUser.id,
      { password },
    );
    if (passwordError)
      go('Não foi possível definir a senha da conta.', 'error');
  }

  const { error } = await service.from('user_access').insert({
    email,
    display_name: displayName,
    role,
    status: 'active',
    invited_by: actorId,
    linked_user_id: authUser.id,
  } as never);
  if (error) {
    if (createdAuthUser) await service.auth.admin.deleteUser(authUser.id);
    go('Não foi possível cadastrar o usuário.', 'error');
  }

  const { error: profileError } = await service.from('profiles').upsert(
    {
      user_id: authUser.id,
      display_name: displayName,
      email,
      role,
      status: 'active',
      auth_provider: 'password',
    } as never,
    { onConflict: 'user_id' },
  );
  if (profileError) {
    await service.from('user_access').delete().eq('email', email);
    if (createdAuthUser) await service.auth.admin.deleteUser(authUser.id);
    go('Não foi possível criar o perfil do usuário.', 'error');
  }
  await auditUser(actorId, 'user_invited', { email, role });
  revalidatePath('/admin/users');
  go(
    createdAuthUser
      ? 'Usuário cadastrado e pronto para acessar.'
      : 'Usuário cadastrado e conta existente vinculada com a nova senha.',
  );
}

async function getAccess(email: string): Promise<{
  row: AccessRow;
  activeAdminCount: number;
  actorId: string;
  service: ReturnType<typeof createServiceClient>;
}> {
  const { actorId, service } = await requireAdmin();
  const { data } = await service
    .from('user_access')
    .select('email,role,status,linked_user_id')
    .eq('email', email)
    .maybeSingle();
  if (!data) go('Usuário não encontrado.', 'error');
  const { count } = await service
    .from('user_access')
    .select('email', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('status', 'active');
  return {
    row: data as AccessRow,
    activeAdminCount: count ?? 0,
    actorId,
    service,
  };
}

export async function updateUserAccess(formData: FormData) {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const displayName = String(formData.get('display_name') ?? '').trim();
  const role = String(formData.get('role') ?? '');
  const status = String(formData.get('status') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!isUserRole(role) || !isUserStatus(status) || displayName.length < 2)
    go('Dados do usuário inválidos.', 'error');
  if (password && !isValidPassword(password))
    go('A nova senha deve ter pelo menos 8 caracteres.', 'error');
  const { row, activeAdminCount, actorId, service } = await getAccess(email);
  if (
    wouldRemoveLastActiveAdmin({
      currentRole: row.role,
      currentStatus: row.status,
      nextRole: role,
      nextStatus: status,
      activeAdminCount,
    })
  ) {
    go(
      'Não é possível remover ou desativar o último administrador ativo.',
      'error',
    );
  }
  const { error } = await service
    .from('user_access')
    .update({
      display_name: displayName,
      role,
      status,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('email', email);
  if (error) go('Não foi possível atualizar o usuário.', 'error');
  if (row.linked_user_id) {
    await service
      .from('profiles')
      .update({ display_name: displayName, role, status } as never)
      .eq('user_id', row.linked_user_id);
    if (password) {
      const { error: passwordError } = await service.auth.admin.updateUserById(
        row.linked_user_id,
        {
          password,
        },
      );
      if (passwordError)
        go(
          'Os dados foram salvos, mas não foi possível alterar a senha.',
          'error',
        );
    }
  } else if (password) {
    go('O usuário ainda não possui uma conta vinculada.', 'error');
  }
  await auditUser(actorId, 'user_updated', { email, role, status });
  revalidatePath('/admin/users');
  go('Usuário atualizado.');
}

export async function deleteUserAccess(formData: FormData) {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const { row, activeAdminCount, actorId, service } = await getAccess(email);
  if (
    wouldRemoveLastActiveAdmin({
      currentRole: row.role,
      currentStatus: row.status,
      nextStatus: 'inactive',
      activeAdminCount,
    })
  ) {
    go('Não é possível excluir o último administrador ativo.', 'error');
  }
  if (row.linked_user_id) {
    await service
      .from('profiles')
      .update({ status: 'inactive' } as never)
      .eq('user_id', row.linked_user_id);
  }
  const { error } = await service
    .from('user_access')
    .delete()
    .eq('email', email);
  if (error) go('Não foi possível excluir o acesso.', 'error');
  await auditUser(actorId, 'user_access_removed', {
    email,
    linked_user_id: row.linked_user_id,
  });
  revalidatePath('/admin/users');
  go('Acesso removido.');
}
