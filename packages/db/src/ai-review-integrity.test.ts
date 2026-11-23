import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from './testDatabase';

let db: Awaited<ReturnType<typeof createTestDatabase>>;
const reportId = '20000000-0000-0000-0000-000000000013';
beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`
    insert into auth.users(id) values ('10000000-0000-0000-0000-000000000013');
    insert into reports(id,report_type_id,spec_id,created_by,status,extracted_data)
      select '${reportId}',id,active_spec_id,'10000000-0000-0000-0000-000000000013','in_review','{"imo":"111","flag":"BR"}'::jsonb
      from report_types where slug='draft_survey';
  `);
}, 60_000);
afterAll(async () => { await db?.close(); });
describe('revision trigger no PostgreSQL volátil', () => {
  it('incrementa revisão, mantém snapshot ao editar e bloqueia CAS antigo', async () => {
    await db.query(`update reports set ai_review=$1, extraction_issues=$2 where id=$3`, [
      { status: 'done', revision: 0, data: { imo: '111', flag: 'BR' } }, [{ origin: 'ai', field: 'imo', message: 'suspeito' }], reportId,
    ]);
    await db.query(`update reports set operator_overrides='{"flag":"US"}' where id=$1`, [reportId]);
    const { rows } = await db.query<{ data_revision: number; ai_review: any; extraction_issues: any[] }>('select data_revision,ai_review,extraction_issues from reports where id=$1', [reportId]);
    expect(Number(rows[0]!.data_revision)).toBe(1);
    expect(rows[0]!.ai_review).toMatchObject({ status: 'stale', data: { imo: '111' } });
    expect(rows[0]!.extraction_issues).toHaveLength(1);
    const late = await db.query('update reports set extraction_issues=\'[]\' where id=$1 and data_revision=0 returning id', [reportId]);
    expect(late.rows).toEqual([]);
  });
  it('reenvio limpa sugestões e snapshot antigo', async () => {
    await db.query(`update reports set status='draft' where id=$1`, [reportId]);
    const { rows } = await db.query<{ ai_review: unknown; extraction_issues: unknown[] }>('select ai_review,extraction_issues from reports where id=$1', [reportId]);
    expect(rows[0]!.ai_review).toBeNull(); expect(rows[0]!.extraction_issues).toEqual([]);
  });
});
