'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  isUserRole,
  isUserStatus,
  isValidEmail,
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
  if (!isValidEmail(email)) go('Informe um e-mail válido.', 'error');
  if (displayName.length < 2) go('Informe o nome do usuário.', 'error');
  if (!isUserRole(role)) go('Papel de usuário inválido.', 'error');

  const { data: duplicate } = await service
    .from('user_access')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (duplicate) go('Já existe um usuário com esse e-mail.', 'error');

  // O convite mantém o fluxo atual por e-mail/senha utilizável e também deixa
  // a allowlist pronta para o futuro login Microsoft (Entra).
  const { data: authUsers, error: listError } =
    await service.auth.admin.listUsers({ perPage: 1000 });
  if (listError) go('Não foi possível consultar as contas de acesso.', 'error');
  let authUser = authUsers.users.find(
    (candidate) => normalizeEmail(candidate.email ?? '') === email,
  );
  let createdAuthUser = false;
  if (!authUser) {
    const { data: invited, error: inviteError } =
      await service.auth.admin.inviteUserByEmail(email, {
        data: { display_name: displayName },
      });
    if (inviteError || !invited.user) {
      go(
        'Não foi possível enviar o convite. Verifique a configuração de e-mail do Supabase.',
        'error',
      );
    }
    authUser = invited.user;
    createdAuthUser = true;
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
      ? 'Usuário cadastrado e convite enviado por e-mail.'
      : 'Usuário cadastrado e conta existente vinculada.',
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
  if (!isUserRole(role) || !isUserStatus(status) || displayName.length < 2)
    go('Dados do usuário inválidos.', 'error');
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
