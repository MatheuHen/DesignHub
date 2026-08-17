import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../lib/errors.js';
import { listRespostasBySolicitacao, updateSolicitacaoFields } from './solicitacao.repository.js';

function updateClient(returnedRows: unknown[]) {
  return {
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: returnedRows, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof updateSolicitacaoFields>[0];
}

describe('updateSolicitacaoFields (RF005 — defesa em profundidade de ownership)', () => {
  it('lança NotFoundError quando nenhuma linha corresponde a id + id_designer', async () => {
    const client = updateClient([]);
    await expect(
      updateSolicitacaoFields(client, 1, 'designer-x', { tema: 'Novo' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('resolve quando exatamente uma linha é atualizada', async () => {
    const client = updateClient([{ id_solicitacao: 1 }]);
    await expect(
      updateSolicitacaoFields(client, 1, 'designer-x', { tema: 'Novo' }),
    ).resolves.toBeUndefined();
  });
});

describe('listRespostasBySolicitacao (RF005 — detalhes de atendimento)', () => {
  it('retorna array vazio quando a solicitação não tem atendimento vinculado', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      }),
    } as unknown as Parameters<typeof listRespostasBySolicitacao>[0];

    await expect(listRespostasBySolicitacao(client, 1)).resolves.toEqual([]);
  });
});
