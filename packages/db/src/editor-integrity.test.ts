import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from './testDatabase';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let reportId: string;
interface DocumentRow { working_docx_generation: string; working_docx_revision: number; working_docx_path: string | null; approved_docx_path: string | null; }
async function read() { return (await db.query<DocumentRow>('select * from reports where id=$1', [reportId])).rows[0]!; }

beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec("insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000011','editor@example.test')");
  const { rows } = await db.query<{ id: string }>(`insert into reports(report_type_id,spec_id,status,working_docx_path,working_docx_revision,created_by)
    select id,active_spec_id,'editing','saved.docx',4,'00000000-0000-4000-8000-000000000011' from report_types where slug='draft_survey' returning id`);
  reportId = rows[0]!.id;
}, 60000);
afterAll(async () => { await db?.close(); });

describe('integridade editor em PostgreSQL volátil', () => {
  it('aprovação CAS congela caminho/revisão e impede PutFile tardio', async () => {
    const result = await db.query(`update reports set status='approved',approved_docx_path=working_docx_path,approved_docx_revision=working_docx_revision
      where id=$1 and status='editing' and working_docx_revision=4 and working_docx_path='saved.docx' returning id`, [reportId]);
    expect(result.rows).toHaveLength(1);
    const late = await db.query(`update reports set working_docx_path='late.docx',working_docx_revision=5
      where id=$1 and status='editing' and working_docx_revision=4 returning id`, [reportId]);
    expect(late.rows).toHaveLength(0);
    expect((await read()).approved_docx_path).toBe('saved.docx');
  });
  it('regenerar preserva documento e snapshot anterior', async () => {
    const before = await read();
    await db.query("update reports set status='generated' where id=$1", [reportId]);
    await db.query("update reports set status='editing' where id=$1", [reportId]);
    const after = await read();
    expect(after.working_docx_path).toBe('saved.docx');
    expect(after.approved_docx_path).toBe('saved.docx');
    expect(after.working_docx_generation).toBe(before.working_docx_generation);
  });
  it('reset gera novo ciclo, incrementa revisão e invalida build antigo por CAS', async () => {
    const before = await read();
    await db.query("update reports set status='draft' where id=$1", [reportId]);
    const after = await read();
    expect(after.working_docx_generation).not.toBe(before.working_docx_generation);
    expect(after.working_docx_revision).toBe(before.working_docx_revision + 1);
    expect(after.working_docx_path).toBeNull();
    await db.query("update reports set status='editing' where id=$1", [reportId]);
    const late = await db.query(`update reports set working_docx_path='old-build.docx'
      where id=$1 and status='editing' and working_docx_path is null and working_docx_generation=$2 returning id`, [reportId, before.working_docx_generation]);
    expect(late.rows).toHaveLength(0);
  });
  it('formatos numéricos do operador incrementam revisão e tornam a análise de IA obsoleta', async () => {
    await db.query('update reports set ai_review=$1 where id=$2', [
      {
        status: 'done',
        data: { summer_dwt: 12_345.67 },
      },
      reportId,
    ]);
    const before = await db.query<{ data_revision: number }>(
      'select data_revision from reports where id=$1',
      [reportId],
    );

    await db.query(
      `update reports
       set operator_number_formats='{"summer_dwt":2}'::jsonb
       where id=$1`,
      [reportId],
    );

    const after = await db.query<{
      data_revision: number;
      ai_review: { status: string; data: { summer_dwt: number } };
    }>('select data_revision,ai_review from reports where id=$1', [reportId]);
    expect(Number(after.rows[0]!.data_revision)).toBe(
      Number(before.rows[0]!.data_revision) + 1,
    );
    expect(after.rows[0]!.ai_review).toEqual({
      status: 'stale',
      data: { summer_dwt: 12_345.67 },
    });
  });
});
