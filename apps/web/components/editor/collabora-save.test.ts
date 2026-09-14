import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isCollaboraSaveSessionInvalid, requestCollaboraSave } from './collabora-save';

let listener: ((event: MessageEvent) => void) | undefined;
const host = {
  addEventListener: vi.fn((_type: string, fn: (event: MessageEvent) => void) => { listener = fn; }),
  removeEventListener: vi.fn((_type: string, fn: (event: MessageEvent) => void) => { if (listener === fn) listener = undefined; }),
};
let editor = { postMessage: vi.fn() };
function response(values: unknown, source: unknown = editor, origin = 'https://office.test') {
  listener?.({ origin, source, data: JSON.stringify({ MessageId: 'Action_Save_Resp', Values: values }) } as MessageEvent);
}
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); editor = { postMessage: vi.fn() }; listener = undefined; });
afterEach(() => vi.useRealTimers());

describe('confirmação de salvamento Collabora', () => {
  it('timeout rejeita e remove listener; jamais autoriza aprovação', async () => {
    const saving = requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test');
    const result = expect(saving).rejects.toThrow('Tempo esgotado');
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(host.removeEventListener).toHaveBeenCalledOnce();
  });
  it.each([{ success: false }, {}, { success: 'true' }, { result: 'unmodified' }])('não aceita sucesso ausente ou inválido %j', async (values) => {
    const saving = requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test');
    response(values);
    await expect(saving).rejects.toThrow('não confirmou');
  });
  it('ignora outra janela e outra origem, aceita somente sucesso explícito do editor', async () => {
    const saving = requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test');
    response({ success: true }, {});
    response({ success: true }, editor, 'https://other.test');
    expect(host.removeEventListener).not.toHaveBeenCalled();
    response({ success: true });
    await saving;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('navegação cancela espera e limpa recursos', async () => {
    const controller = new AbortController();
    const saving = requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test', controller.signal);
    controller.abort();
    await expect(saving).rejects.toThrow('cancelado');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('reconhece ausência explícita de mudanças pendentes segundo o SDK', async () => {
    const saving = requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test');
    response({ success: false, result: 'unmodified' });
    await expect(saving).resolves.toBe('unmodified');
  });
  it('A atrasado após timeout não pode confirmar tentativa B na mesma sessão', async () => {
    const first = requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test');
    const timedOut = expect(first).rejects.toThrow('Tempo esgotado');
    await vi.advanceTimersByTimeAsync(15_000);
    await timedOut;
    expect(isCollaboraSaveSessionInvalid(editor as unknown as Window)).toBe(true);

    const second = requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test');
    response({ success: true }); // Resposta remota atrasada de A.
    await expect(second).rejects.toThrow('Reabra o editor');
    expect(editor.postMessage).toHaveBeenCalledOnce();
    expect(host.addEventListener).toHaveBeenCalledOnce();
  });
  it('após remontar, resposta do iframe antigo não pode confirmar B no novo iframe', async () => {
    const oldEditor = editor;
    const first = requestCollaboraSave(host as unknown as Window, oldEditor as unknown as Window, 'https://office.test');
    const timedOut = expect(first).rejects.toThrow('Tempo esgotado');
    await vi.advanceTimersByTimeAsync(15_000);
    await timedOut;
    editor = { postMessage: vi.fn() }; // Outro elemento iframe → outra WindowProxy.
    const second = requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test');
    response({ success: true }, oldEditor);
    expect(host.removeEventListener).toHaveBeenCalledOnce(); // Só a limpeza de A.
    response({ success: true }, editor);
    await expect(second).resolves.toBe('saved');
    expect(host.removeEventListener).toHaveBeenCalledTimes(2);
  });
  it('abort após postMessage invalida sessão pois a operação remota pode continuar', async () => {
    const controller = new AbortController();
    const first = requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test', controller.signal);
    controller.abort();
    await expect(first).rejects.toThrow('cancelado');
    await expect(requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test')).rejects.toThrow('Reabra');
  });
  it('erro após envio também exige nova sessão', async () => {
    editor.postMessage.mockImplementationOnce(() => { throw new Error('transporte interrompido'); });
    await expect(requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test')).rejects.toThrow('solicitar');
    await expect(requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test')).rejects.toThrow('Reabra');
  });
  it('não envia duas solicitações simultâneas na mesma sessão', async () => {
    const first = requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test');
    await expect(requestCollaboraSave(host as unknown as Window, editor as unknown as Window, 'https://office.test')).rejects.toThrow('aguardando confirmação');
    response({ success: true });
    await expect(first).resolves.toBe('saved');
    expect(editor.postMessage).toHaveBeenCalledOnce();
  });
});
