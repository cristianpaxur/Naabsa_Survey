import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { signToken } from './token';

const state = vi.hoisted(() => ({profile: null as unknown, profileError: null as unknown, tables: [] as string[]}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({
  from(table: string) {
    state.tables.push(table);
    const query = { select: () => query, eq: () => query,
      maybeSingle: async () => table === 'profiles'
        ? {data:state.profile,error:state.profileError}
        : {data:{id:'r1',status:'editing'},error:null} };
    return query;
  },
}) }));
import { authWopi } from './host';

beforeEach(() => { vi.stubEnv('WOPI_TOKEN_SECRET','test-secret'); state.tables=[]; state.profileError=null; });
afterEach(() => vi.unstubAllEnvs());
describe('WOPI revalida o acesso do usuário a cada requisição', () => {
  it.each(['inactive','pending'])('nega sessão %s antes de consultar documento', async status => {
    state.profile = {role:'admin',status};
    const token = signToken({reportId:'r1',userId:'u1',canWrite:true});
    const out = await authWopi(new NextRequest(`http://localhost/api/wopi/files/r1?access_token=${token}`),'r1');
    expect(out.ok).toBe(false);
    expect(state.tables).toEqual(['profiles']);
  });
  it('nega token antigo depois de reativar a conta', async () => {
    state.profile = {role:'operator',status:'active',access_revoked_at:new Date(Date.now()+1000).toISOString()};
    const token = signToken({reportId:'r1',userId:'u1',canWrite:true});
    expect((await authWopi(new NextRequest(`http://localhost/api/wopi/files/r1?access_token=${token}`),'r1')).ok).toBe(false);
  });
  it('permite acesso ativo e nega em erro na consulta de autorização', async () => {
    state.profile = {role:'operator',status:'active',access_revoked_at:null};
    const token = signToken({reportId:'r1',userId:'u1',canWrite:true});
    const req = new NextRequest(`http://localhost/api/wopi/files/r1?access_token=${token}`);
    expect((await authWopi(req,'r1')).ok).toBe(true);
    state.profileError = {message:'unavailable'};
    expect((await authWopi(req,'r1')).ok).toBe(false);
  });
});
