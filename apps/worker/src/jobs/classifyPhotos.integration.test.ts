import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ service: vi.fn(), call: vi.fn(), enabled: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getServiceClient: mocks.service }));
vi.mock('../lib/llm', () => ({
  callLLM: mocks.call, isAiEnabled: mocks.enabled,
  parseJsonFromText: (text: string | null) => { try { return JSON.parse(text || 'null'); } catch { return null; } },
}));
import { classifyPhotos, schedulePhotoClassification } from './classifyPhotos';

type Row = Record<string, unknown>;
function fakeService(photos: Row[]) {
  let stage = 'in_review';
  const report = { spec_id: 'spec', status: stage, photo_review_revision: 2 };
  const from = (table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let patch: Row | undefined;
    let single = false;
    const query = {
      select: () => query,
      update: (value: Row) => { patch = value; return query; },
      insert: () => query,
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
      is: (key: string, value: unknown) => { filters.push((row) => (row[key] ?? null) === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
      single: () => { single = true; return query; },
      maybeSingle: () => { single = true; return query; },
      then: (resolve: (value: unknown) => unknown) => {
        let rows = table === 'reports' ? [{ ...report, status: stage }] : table === 'report_specs'
          ? [{ spec: { photo_slots: [{ id: 'cover', label: 'Capa', max: 5 }] } }] : photos;
        if (table === 'report_photos') rows = rows.filter((row) => filters.every((test) => test(row)));
        if (patch) for (const row of rows) Object.assign(row, patch);
        return Promise.resolve(resolve({ data: single ? rows[0] && { ...rows[0] } : rows.map((row) => ({ ...row })), error: null }));
      },
    };
    return query;
  };
  const rpc = vi.fn(async (_name, args: Row) => {
    const photo = photos.find((p) => p.id === args.p_photo_id);
    const apply = stage === 'in_review' && photo?.ai_request_id === args.p_request_id && !photo?.confirmed_by && !photo?.slot_id;
    if (apply) Object.assign(photo!, { slot_id: args.p_slot_id, ai_suggested: true, ai_status: 'done' });
    return { data: apply, error: null };
  });
  return { from, rpc, stage: (next: string) => { stage = next; }, storage: { from: () => ({ download: async () => ({ data: new Blob(['image']) }) }) } };
}
function row(id: string): Row {
  return { id, report_id: 'report', processed_path: `${id}.jpg`, status: 'done', ai_status: 'pending',
    ai_run_id: null, ai_request_id: null, ai_job_id: null, ai_attempt: -1,
    slot_id: null, confirmed_by: null, removed_at: null };
}

beforeEach(() => { vi.resetAllMocks(); mocks.enabled.mockReturnValue(true); });

describe('classificação de fotos no worker', () => {
  it('IA desligada não inicia classificação nem altera fotos', async () => {
    mocks.enabled.mockReturnValue(false);
    await classifyPhotos({ reportId: 'report' });
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it('falha em uma foto deixa erro recuperável e continua as demais', async () => {
    const photos = [row('first'), row('second')]; const service = fakeService(photos);
    mocks.service.mockReturnValue(service);
    mocks.call.mockResolvedValueOnce(null).mockResolvedValueOnce('{"slot_id":"cover","flags":[]}');
    await classifyPhotos({ reportId: 'report' });
    expect(photos[0]?.ai_status).toBe('error');
    expect(photos[1]?.slot_id).toBe('cover');
  });

  it('resposta tardia é enviada ao RPC condicionado e preserva decisão humana', async () => {
    const photo = row('photo'); const service = fakeService([photo]); mocks.service.mockReturnValue(service);
    mocks.call.mockImplementation(async () => {
      Object.assign(photo, { slot_id: 'manual', confirmed_by: 'operator', ai_status: 'done', ai_request_id: null });
      return '{"slot_id":"cover","flags":[]}';
    });
    await classifyPhotos({ reportId: 'report' });
    expect(service.rpc).toHaveBeenCalledWith('apply_photo_suggestion', expect.objectContaining({ p_revision: 2, p_photo_id: 'photo' }));
    expect(photo.slot_id).toBe('manual');
    expect(photo.ai_status).toBe('done');
  });

  it('mudança de etapa durante chamada descarta o resultado', async () => {
    const photo = row('photo'); const service = fakeService([photo]); mocks.service.mockReturnValue(service);
    mocks.call.mockImplementation(async () => { service.stage('editing'); return '{"slot_id":"cover"}'; });
    await classifyPhotos({ reportId: 'report' });
    expect(photo.slot_id).toBeNull();
    expect(photo.ai_status).toBe('done');
  });

  it('agenda cada término de foto, inclusive dentro da mesma janela de 20 segundos', async () => {
    const service = fakeService([row('first'), row('second')]); mocks.service.mockReturnValue(service);
    const send = vi.fn().mockResolvedValue('job');
    await schedulePhotoClassification({ reportId: 'report', photoId: 'first' }, send);
    await schedulePhotoClassification({ reportId: 'report', photoId: 'second' }, send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('falha de enqueue fica visível e recuperável por foto', async () => {
    const photo = row('photo'); mocks.service.mockReturnValue(fakeService([photo]));
    await schedulePhotoClassification({ reportId: 'report', photoId: 'photo' }, vi.fn().mockRejectedValue(new Error('offline')));
    expect(photo.ai_status).toBe('error');
    expect(photo.ai_error).toContain('Tente novamente');
  });

  it('retoma running na redelivery do mesmo job e invalida a resposta da execução interrompida', async () => {
    const photo: Row = { ...row('photo'), ai_run_id: 'run' };
    const service = fakeService([photo]); mocks.service.mockReturnValue(service);
    let finishPrevious!: (value: string) => void;
    mocks.call.mockReturnValueOnce(new Promise<string>((resolve) => { finishPrevious = resolve; }))
      .mockResolvedValueOnce('{"slot_id":"cover"}');
    const payload = { reportId: 'report', photoId: 'photo', runId: 'run' };
    const first = classifyPhotos(payload, {}, { jobId: 'job', retryCount: 0 });
    await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(1));
    const firstToken = photo.ai_request_id;
    await classifyPhotos(payload, {}, { jobId: 'job', retryCount: 1 });
    expect(photo.ai_request_id).not.toBe(firstToken);
    expect(photo.ai_attempt).toBe(1);
    expect(photo.slot_id).toBe('cover');
    finishPrevious('{"slot_id":null}');
    await first;
    expect(photo.slot_id).toBe('cover');
    expect(photo.ai_status).toBe('done');
  });

  it('duplicata de outra job ou da mesma tentativa não toma uma chamada em curso', async () => {
    const photo: Row = { ...row('photo'), ai_run_id: 'run', ai_status: 'running', ai_job_id: 'owner', ai_attempt: 0 };
    mocks.service.mockReturnValue(fakeService([photo]));
    const payload = { reportId: 'report', photoId: 'photo', runId: 'run' };
    await classifyPhotos(payload, {}, { jobId: 'duplicate', retryCount: 1 });
    await classifyPhotos(payload, {}, { jobId: 'owner', retryCount: 0 });
    expect(mocks.call).not.toHaveBeenCalled();
    expect(photo.ai_job_id).toBe('owner');
  });

  it('retry manual substitui geração, ignorando redelivery anterior e jobs já concluídos', async () => {
    const photo: Row = { ...row('photo'), ai_run_id: 'new-run' };
    mocks.service.mockReturnValue(fakeService([photo])); mocks.call.mockResolvedValue('{"slot_id":"cover"}');
    await classifyPhotos({ reportId: 'report', photoId: 'photo', runId: 'old-run' }, {}, { jobId: 'old-job', retryCount: 1 });
    expect(mocks.call).not.toHaveBeenCalled();
    const payload = { reportId: 'report', photoId: 'photo', runId: 'new-run' };
    await classifyPhotos(payload, {}, { jobId: 'new-job', retryCount: 0 });
    await classifyPhotos(payload, {}, { jobId: 'new-job', retryCount: 1 });
    expect(mocks.call).toHaveBeenCalledTimes(1);
    expect(photo.ai_status).toBe('done');
  });

  it('reentrega do process_photo recupera queda entre pending e enqueue sem trocar a geração', async () => {
    const photo: Row = { ...row('photo'), ai_run_id: 'persisted-before-crash' };
    mocks.service.mockReturnValue(fakeService([photo]));
    const send = vi.fn().mockResolvedValue('job');
    await schedulePhotoClassification({ reportId: 'report', photoId: 'photo' }, send);
    expect(send).toHaveBeenCalledWith({ reportId: 'report', photoId: 'photo', runId: 'persisted-before-crash' });
    expect(photo.ai_run_id).toBe('persisted-before-crash');
  });
});
