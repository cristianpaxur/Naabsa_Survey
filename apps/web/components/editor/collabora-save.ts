// O SDK não devolve identificador de Action_Save. Depois de uma tentativa
// ambígua, respostas antigas não podem ser usadas numa nova tentativa da mesma
// WindowProxy. Reabrir exige outro elemento iframe, não apenas mudar seu src.
const invalidSessions = new WeakSet<Window>();
const pendingSessions = new WeakSet<Window>();

export function isCollaboraSaveSessionInvalid(editor: Window): boolean {
  return invalidSessions.has(editor);
}

/** O sucesso exige resposta explícita do iframe correto. */
export function requestCollaboraSave(host: Window, editor: Window, origin: string, signal?: AbortSignal): Promise<'saved' | 'unmodified'> {
  if (invalidSessions.has(editor)) return Promise.reject(new Error('Reabra o editor e confira o texto salvo antes de tentar novamente.'));
  if (pendingSessions.has(editor)) return Promise.reject(new Error('Já existe um salvamento aguardando confirmação.'));
  pendingSessions.add(editor);
  return new Promise((resolve, reject) => {
    let settled = false;
    let sent = false;
    const finish = (error?: Error, outcome: 'saved' | 'unmodified' = 'saved') => {
      if (settled) return;
      settled = true;
      if (error && sent) invalidSessions.add(editor);
      pendingSessions.delete(editor);
      clearTimeout(timer);
      host.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve(outcome);
    };
    const onAbort = () => finish(new Error('Salvamento cancelado.'));
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== editor) return;
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (message?.MessageId !== 'Action_Save_Resp') return;
        // SDK: 'unmodified' confirma explicitamente ausência de alterações
        // pendentes. Não é o mesmo que sucesso ausente ou timeout.
        if (typeof message.Values?.success === 'boolean' && message.Values.result === 'unmodified') finish(undefined, 'unmodified');
        else finish(message.Values?.success === true ? undefined : new Error('O editor não confirmou o salvamento.'));
      } catch { /* Mensagens de outros recursos do editor. */ }
    };
    const timer = setTimeout(() => finish(new Error('Tempo esgotado ao confirmar o salvamento. Reabra o editor antes de tentar novamente.')), 15_000);
    host.addEventListener('message', onMessage);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    try {
      sent = true;
      editor.postMessage(JSON.stringify({ MessageId: 'Action_Save', Values: {
        Notify: true, DontTerminateEdit: true, DontSaveIfUnmodified: false,
      } }), origin);
    } catch { finish(new Error('Não foi possível solicitar o salvamento.')); }
  });
}
