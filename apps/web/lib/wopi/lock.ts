/**
 * Tipos e lógica PURA do lock WOPI (011) — sem dependências de servidor
 * (`server-only`, Supabase, Next), portanto testável isoladamente.
 */

export interface WopiReport {
  id: string;
  status: string;
  vessel_name: string | null;
  working_docx_path: string | null;
  working_docx_revision?: number;
  working_docx_generation?: string;
  working_docx_saved_at?: string | null;
  wopi_lock: string | null;
  wopi_lock_expires_at: string | null;
}

/**
 * O PutFile só é aceito em `editing` (012/T-007). A partir da aprovação o
 * working.docx é o registro do documento aprovado — um PutFile tardio (sessão
 * do Collabora aberta antes da aprovação, token ainda com canWrite) faria o
 * PDF divergir do documento congelado.
 */
export function canPutFile(report: Pick<WopiReport, 'status'>): boolean {
  return report.status === 'editing';
}

/** Lock corrente, se ainda não expirou; senão `null`. */
export function currentLock(report: WopiReport, now = Date.now()): string | null {
  if (!report.wopi_lock || !report.wopi_lock_expires_at) return null;
  return new Date(report.wopi_lock_expires_at).getTime() > now ? report.wopi_lock : null;
}

export interface LockOutcome {
  /** Status HTTP da resposta WOPI. */
  status: number;
  /** Valor do header `X-WOPI-Lock` a devolver (quando aplicável). */
  lockHeader?: string;
  /** Novo lock a persistir: string = trava; `null` = destrava; `undefined` = sem mudança. */
  newLock?: string | null;
}

/**
 * Decisão pura do lifecycle de lock WOPI (011/T-006, RF-005). Recebe a operação
 * (`X-WOPI-Override`), o lock corrente válido e o lock do request; devolve o que
 * responder e o que persistir. Sem efeitos colaterais.
 */
export function lockDecision(op: string, cur: string | null, requestLock: string): LockOutcome {
  switch (op) {
    case 'GET_LOCK':
      return { status: 200, lockHeader: cur ?? '' };
    case 'LOCK':
      // Trava nova ou re-trava com o mesmo lock; conflito se já travado por outro.
      if (cur && cur !== requestLock) return { status: 409, lockHeader: cur };
      return { status: 200, newLock: requestLock };
    case 'REFRESH_LOCK':
      if (!cur || cur !== requestLock) return { status: 409, lockHeader: cur ?? '' };
      return { status: 200, newLock: requestLock };
    case 'UNLOCK':
      if (!cur || cur !== requestLock) return { status: 409, lockHeader: cur ?? '' };
      return { status: 200, newLock: null };
    default:
      return { status: 400 };
  }
}
