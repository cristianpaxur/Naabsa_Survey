import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './testDatabase';

let db: PGlite;
const actor = randomUUID();
const type = randomUUID();
const spec = randomUUID();
let report: string;
let photo: string;
let request: string;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.query('insert into auth.users(id,email) values ($1,$2)', [actor, 'photo-test@example.test']);
  await db.query("insert into report_types(id,slug,name) values ($1,'test_photos','Teste fotos')", [type]);
  await db.query('insert into report_specs(id,report_type_id,version,spec) values ($1,$2,1,$3)', [spec, type,
    JSON.stringify({ photo_slots: [{ id: 'cover', max: 1 }, { id: 'gallery', max: 5 }] })]);
}, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  report = randomUUID(); photo = randomUUID(); request = randomUUID();
  await db.query("insert into reports(id,report_type_id,spec_id,created_by,status) values ($1,$2,$3,$4,'in_review')", [report, type, spec, actor]);
  await db.query("insert into report_photos(id,report_id,original_path,status,ai_status,ai_request_id) values ($1,$2,'original.jpg','done','running',$3)", [photo, report, request]);
});
async function apply(slot = 'cover', revision = 0, id = photo, requestId = request) {
  const result = await db.query<{ applied: boolean }>('select apply_photo_suggestion($1,$2,$3,$4,$5,$6) as applied', [report, id, requestId, revision, slot, ['dark']]);
  return result.rows[0]!.applied;
}
async function current(id = photo) {
  return (await db.query<{ slot_id: string | null; ai_suggested: boolean; ai_status: string; confirmed_by: string | null; position: number }>(
    'select slot_id,ai_suggested,ai_status,confirmed_by,position from report_photos where id=$1', [id])).rows[0]!;
}

describe('integridade de fotos no PostgreSQL isolado', () => {
  it('publica sugestão uma única vez, ainda exigindo confirmação humana', async () => {
    expect(await apply()).toBe(true);
    expect(await current()).toMatchObject({ slot_id: 'cover', ai_suggested: true, ai_status: 'done' });
    expect(await apply()).toBe(false);
  });
  it('uma escolha manual ocorrida durante a chamada prevalece', async () => {
    await db.query('update report_photos set slot_id=$1,confirmed_by=$2,ai_suggested=false where id=$3', ['gallery', actor, photo]);
    expect(await apply()).toBe(false);
    expect(await current()).toMatchObject({ slot_id: 'gallery', confirmed_by: actor, ai_suggested: false });
  });
  it('etapa avançada impede sugestão e alteração manual tardias', async () => {
    await db.query("update reports set status='editing' where id=$1", [report]);
    expect(await apply()).toBe(false);
    await expect(db.query("update report_photos set slot_id='cover' where id=$1", [photo])).rejects.toThrow('durante a revisão');
    expect((await current()).slot_id).toBeNull();
  });
  it('voltar à revisão não aceita resultado do ciclo anterior', async () => {
    await db.query("update reports set status='editing' where id=$1", [report]);
    await db.query("update reports set status='in_review' where id=$1", [report]);
    expect(await apply()).toBe(false);
    expect(await apply('cover', 2)).toBe(true);
  });
  it('foto removida logicamente nunca recebe sugestão e mantém original', async () => {
    await db.query('update report_photos set removed_at=now() where id=$1', [photo]);
    expect(await apply()).toBe(false);
    expect((await db.query('select original_path from report_photos where id=$1', [photo])).rows).toHaveLength(1);
  });
  it('requisição substituída por retry invalida resposta antiga', async () => {
    await db.query('update report_photos set ai_request_id=$1 where id=$2', [randomUUID(), photo]);
    expect(await apply()).toBe(false);
    expect((await current()).slot_id).toBeNull();
  });
  it('respeita capacidade no instante da gravação e permite outro slot', async () => {
    const existing = randomUUID();
    await db.query("insert into report_photos(id,report_id,original_path,status,slot_id) values ($1,$2,'existing.jpg','done','cover')", [existing, report]);
    expect(await apply()).toBe(true);
    expect(await current()).toMatchObject({ slot_id: null, ai_suggested: false, ai_status: 'done' });
    await expect(db.query("update report_photos set slot_id='cover' where id=$1", [photo])).rejects.toThrow('Slot cheio');
    await db.query("update report_photos set slot_id='gallery' where id=$1", [photo]);
    expect((await current()).slot_id).toBe('gallery');
  });
  it('posição de novas sugestões vem depois das fotos existentes', async () => {
    await db.query("insert into report_photos(report_id,original_path,status,slot_id,position) values ($1,'existing.jpg','done','gallery',3)", [report]);
    expect(await apply('gallery')).toBe(true);
    expect((await current()).position).toBe(4);
  });
  it('operador não pode invocar a publicação reservada ao worker', async () => {
    await db.exec('set role authenticated');
    try { await expect(apply()).rejects.toThrow('permission denied'); }
    finally { await db.exec('reset role'); }
  });
});
