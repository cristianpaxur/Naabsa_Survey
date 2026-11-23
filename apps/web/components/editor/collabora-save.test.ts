import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isCollaboraSaveSessionInvalid,
  requestCollaboraSave,
} from './collabora-save';
import { waitForCollaboraReady } from './collabora-ready';

const origin = 'https://office.test';
const listeners = new Set<(event: MessageEvent) => void>();
const host = {
  addEventListener: (_type: string, fn: (event: MessageEvent) => void) =>
    listeners.add(fn),
  removeEventListener: (_type: string, fn: (event: MessageEvent) => void) =>
    listeners.delete(fn),
} as unknown as Window;
let editor = { postMessage: vi.fn() };
const win = () => editor as unknown as Window;
function message(
  MessageId: string,
  Values: unknown,
  source: unknown = editor,
  from = origin,
) {
  for (const fn of [...listeners])
    fn({
      origin: from,
      source,
      data: JSON.stringify({ MessageId, Values }),
    } as MessageEvent);
}
const views = (ReadOnly: unknown = '0') =>
  message('Get_Views_Resp', [{ IsCurrentView: true, ReadOnly }]);
const response = (values: unknown, source: unknown = editor, from = origin) =>
  message('Action_Save_Resp', values, source, from);
const commands = () =>
  editor.postMessage.mock.calls.map(([data]) => JSON.parse(data as string));
async function start(signal?: AbortSignal) {
  const saving = requestCollaboraSave(host, win(), origin, signal);
  views();
  await Promise.resolve();
  return { saving };
}
beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  editor = { postMessage: vi.fn() };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('prontidão do Collabora', () => {
  it('aguarda o documento e repete a consulta quando o iframe acaba de carregar', async () => {
    const saving = requestCollaboraSave(host, win(), origin);
    expect(commands().map((m) => m.MessageId)).toEqual([
      'Host_PostmessageReady',
      'Grab_Focus',
      'Get_Views',
    ]);
    message('App_LoadingStatus', { Status: 'Frame_Ready' });
    expect(commands().at(-1).MessageId).toBe('Host_PostmessageReady');
    message('App_LoadingStatus', { Status: 'Document_Loaded' });
    expect(commands().at(-1).MessageId).toBe('Get_Views');
    expect(commands().some((m) => m.MessageId === 'Action_Save')).toBe(false);
    views();
    await Promise.resolve();
    response({ success: true });
    await expect(saving).resolves.toBe('saved');
  });
  it.each([true, 'true', 1, '1'])(
    'recusa sessão somente leitura (%s) sem enviar save nem atualizar campos',
    async (readOnly) => {
      const saving = requestCollaboraSave(host, win(), origin);
      views(readOnly);
      await expect(saving).rejects.toThrow('somente leitura');
      expect(
        commands().some((m) =>
          ['Action_Save', 'Send_UNO_Command'].includes(m.MessageId),
        ),
      ).toBe(false);
      expect(isCollaboraSaveSessionInvalid(win())).toBe(true);
      expect(listeners.size).toBe(0);
    },
  );
  it('não confunde outro participante com a sessão atual e exige permissão explícita', async () => {
    const ready = waitForCollaboraReady(host, win(), origin);
    message('Get_Views_Resp', [
      { IsCurrentView: false, ReadOnly: false },
      { IsCurrentView: true },
    ]);
    expect(listeners.size).toBe(1);
    views('0');
    await expect(ready).resolves.toBe('editable');
  });
  it('ignora origens, janelas e mensagens malformadas durante o handshake', async () => {
    const ready = waitForCollaboraReady(host, win(), origin);
    const values = [{ IsCurrentView: true, ReadOnly: false }];
    message('Get_Views_Resp', values, {});
    message('Get_Views_Resp', values, editor, 'https://other.test');
    for (const fn of listeners)
      fn({
        origin,
        source: editor,
        data: '{broken',
      } as unknown as MessageEvent);
    expect(listeners.size).toBe(1);
    views();
    await expect(ready).resolves.toBe('editable');
  });
  it('timeout antes do save permite tentar de novo sem invalidar a sessão', async () => {
    const saving = requestCollaboraSave(host, win(), origin);
    const result = expect(saving).rejects.toThrow('pronto');
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(isCollaboraSaveSessionInvalid(win())).toBe(false);
    const second = await start();
    response({ success: true });
    await expect(second.saving).resolves.toBe('saved');
  });
  it('cancelar antes do handshake não envia comandos nem invalida a sessão', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      requestCollaboraSave(host, win(), origin, controller.signal),
    ).rejects.toThrow('cancelado');
    expect(commands()).toEqual([]);
    expect(isCollaboraSaveSessionInvalid(win())).toBe(false);
    expect(listeners.size).toBe(0);
  });
});

describe('confirmação de salvamento Collabora', () => {
  it('timeout rejeita e remove listener; jamais autoriza aprovação', async () => {
    const { saving } = await start();
    const result = expect(saving).rejects.toThrow('Tempo esgotado');
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(listeners.size).toBe(0);
    expect(isCollaboraSaveSessionInvalid(win())).toBe(true);
  });
  it.each([
    { success: false },
    {},
    { success: 'true' },
    { result: 'unmodified' },
  ])('não aceita sucesso ausente ou inválido %j', async (values) => {
    const { saving } = await start();
    response(values);
    await expect(saving).rejects.toThrow('não confirmou');
  });
  it('ignora outra janela e outra origem, aceita somente sucesso explícito do editor', async () => {
    const { saving } = await start();
    response({ success: true }, {});
    response({ success: true }, editor, 'https://other.test');
    expect(listeners.size).toBe(1);
    response({ success: true });
    await expect(saving).resolves.toBe('saved');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('navegação cancela espera, limpa recursos e invalida save em voo', async () => {
    const controller = new AbortController();
    const { saving } = await start(controller.signal);
    controller.abort();
    await expect(saving).rejects.toThrow('cancelado');
    expect(vi.getTimerCount()).toBe(0);
    expect(listeners.size).toBe(0);
    await expect(requestCollaboraSave(host, win(), origin)).rejects.toThrow(
      'Reabra',
    );
  });
  it.each([
    { success: false, result: 'unmodified' },
    { success: true, wasModified: false },
  ])(
    'reconhece ausência explícita de mudanças pendentes %j',
    async (values) => {
      const { saving } = await start();
      response(values);
      await expect(saving).resolves.toBe('unmodified');
      expect(commands().at(-1).Values.DontSaveIfUnmodified).toBe(true);
    },
  );
  it('A atrasado após timeout não pode confirmar tentativa B na mesma sessão', async () => {
    const { saving } = await start();
    const timedOut = expect(saving).rejects.toThrow('Tempo esgotado');
    await vi.advanceTimersByTimeAsync(15_000);
    await timedOut;
    const second = requestCollaboraSave(host, win(), origin);
    response({ success: true });
    await expect(second).rejects.toThrow('Reabra o editor');
    expect(
      commands().filter((m) => m.MessageId === 'Action_Save'),
    ).toHaveLength(1);
  });
  it('após remontar, resposta do iframe antigo não pode confirmar B no novo iframe', async () => {
    const oldEditor = editor;
    const { saving } = await start();
    const timedOut = expect(saving).rejects.toThrow('Tempo esgotado');
    await vi.advanceTimersByTimeAsync(15_000);
    await timedOut;
    editor = { postMessage: vi.fn() };
    const second = await start();
    response({ success: true }, oldEditor);
    expect(listeners.size).toBe(1);
    response({ success: true });
    await expect(second.saving).resolves.toBe('saved');
    expect(listeners.size).toBe(0);
  });
  it('erro ao enviar save exige nova sessão', async () => {
    const saving = requestCollaboraSave(host, win(), origin);
    editor.postMessage.mockImplementationOnce(() => {
      throw new Error('transporte interrompido');
    });
    views();
    await expect(saving).rejects.toThrow('solicitar');
    await expect(requestCollaboraSave(host, win(), origin)).rejects.toThrow(
      'Reabra',
    );
  });
  it('não envia duas solicitações simultâneas durante o handshake', async () => {
    const first = requestCollaboraSave(host, win(), origin);
    await expect(requestCollaboraSave(host, win(), origin)).rejects.toThrow(
      'aguardando confirmação',
    );
    views();
    await Promise.resolve();
    response({ success: true });
    await expect(first).resolves.toBe('saved');
    expect(
      commands().filter((m) => m.MessageId === 'Action_Save'),
    ).toHaveLength(1);
  });
  it('atualiza as referências de página antes de salvar para preview e aprovação', async () => {
    const { saving } = await start();
    expect(commands().slice(-2)).toEqual([
      {
        MessageId: 'Send_UNO_Command',
        Values: { Command: '.uno:UpdateFields' },
      },
      {
        MessageId: 'Action_Save',
        Values: {
          Notify: true,
          DontTerminateEdit: true,
          DontSaveIfUnmodified: true,
        },
      },
    ]);
    expect(
      editor.postMessage.mock.calls.every(([, target]) => target === origin),
    ).toBe(true);
    response({ success: true });
    await expect(saving).resolves.toBe('saved');
  });
});
