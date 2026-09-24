import { describe, expect, it } from 'vitest';
import { describeQueueFailure } from './queue-error';

describe('describeQueueFailure', () => {
  it('transforma tenant inexistente em orientação operacional', () => {
    expect(describeQueueFailure(new Error('(ENOTFOUND) tenant/user postgres.gwxgqsqzaljuankvvubz not found')))
      .toEqual({
        message: 'A fila está indisponível. Verifique a conexão DATABASE_URL do web e do worker.',
        code: 'QUEUE_DATABASE_UNAVAILABLE',
      });
  });

  it('não expõe detalhes da conexão em erros genéricos', () => {
    expect(describeQueueFailure(new Error('password authentication failed for user postgres.gwxgqsqzaljuankvvubz')))
      .toEqual({
        message: 'A fila está indisponível. Verifique a conexão DATABASE_URL do web e do worker.',
        code: 'QUEUE_DATABASE_UNAVAILABLE',
      });
  });

  it('mantém uma mensagem segura para erros desconhecidos', () => {
    expect(describeQueueFailure(new Error('falha inesperada')))
      .toEqual({
        message: 'Não foi possível iniciar o processamento. Tente novamente.',
        code: 'QUEUE_UNAVAILABLE',
      });
  });
});
