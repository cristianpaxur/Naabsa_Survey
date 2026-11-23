export interface QueueFailureDescription {
  message: string;
  code: 'QUEUE_DATABASE_UNAVAILABLE' | 'QUEUE_UNAVAILABLE';
}

/**
 * Converte erros do pg-boss em mensagens úteis sem expor usuário, host ou
 * qualquer parte da connection string na interface ou no audit_log.
 */
export function describeQueueFailure(error: unknown): QueueFailureDescription {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const normalized = raw.toLowerCase();
  const databaseUnavailable = /database_url|tenant\/user|password authentication|enotfound|econnrefused|etimedout|econnreset|pooler|connection/.test(normalized);
  if (databaseUnavailable) {
    return {
      message: 'A fila está indisponível. Verifique a conexão DATABASE_URL do web e do worker.',
      code: 'QUEUE_DATABASE_UNAVAILABLE',
    };
  }
  return {
    message: 'Não foi possível iniciar o processamento. Tente novamente.',
    code: 'QUEUE_UNAVAILABLE',
  };
}
