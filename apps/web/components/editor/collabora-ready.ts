/**
 * iframe.load only means the HTML loaded. Get_Views is answered only after
 * Collabora's Document_Loaded; it also identifies this session's permissions.
 * Grab_Focus reactivates an idle editor before asking it to save.
 */
export function waitForCollaboraReady(
  host: Window,
  editor: Window,
  origin: string,
  signal?: AbortSignal,
): Promise<'editable' | 'readonly'> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (permission?: 'editable' | 'readonly', error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      host.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(permission!);
    };
    const send = (MessageId: string) => {
      try {
        editor.postMessage(JSON.stringify({ MessageId }), origin);
      } catch {
        finish(
          undefined,
          new Error('Não foi possível comunicar com o editor.'),
        );
      }
    };
    const onAbort = () => finish(undefined, new Error('Salvamento cancelado.'));
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== editor) return;
      let message;
      try {
        message =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (message?.MessageId === 'App_LoadingStatus') {
        if (message.Values?.Status === 'Frame_Ready')
          send('Host_PostmessageReady');
        if (message.Values?.Status === 'Document_Loaded') {
          send('Host_PostmessageReady');
          send('Get_Views');
        }
      }
      if (
        message?.MessageId !== 'Get_Views_Resp' ||
        !Array.isArray(message.Values)
      )
        return;
      const current = message.Values.find(
        (view: { IsCurrentView?: unknown } | null) =>
          view?.IsCurrentView === true,
      );
      if ([false, 0, '0', 'false'].includes(current?.ReadOnly))
        finish('editable');
      else if ([true, 1, '1', 'true'].includes(current?.ReadOnly))
        finish('readonly');
    };
    const timer = setTimeout(
      () =>
        finish(
          undefined,
          new Error(
            'O editor ainda não confirmou que está pronto. Aguarde o carregamento e tente novamente.',
          ),
        ),
      15_000,
    );
    host.addEventListener('message', onMessage);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    send('Host_PostmessageReady');
    if (!settled) send('Grab_Focus');
    if (!settled) send('Get_Views');
  });
}
