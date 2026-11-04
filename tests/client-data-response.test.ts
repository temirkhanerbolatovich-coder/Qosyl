import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  clientData,
  requestClientData,
  CLIENT_READ_ERROR,
  CLIENT_WRITE_UNCONFIRMED,
} from '../src/lib/client-data-response';
import { marketplaceCopy } from '../src/lib/marketplace-copy';

const schema = z.strictObject({ saved: z.literal(true) });
afterEach(() => vi.unstubAllGlobals());

describe('client response failure boundaries', () => {
  it('accepts the contract and rejects missing, extra and malformed fields without Zod output', () => {
    expect(clientData(schema, { data: { saved: true } })).toEqual({ saved: true });
    for (const value of [
      null,
      { data: { saved: 'private-marker' } },
      { data: { saved: true }, extra: true },
    ]) {
      expect(() => clientData(schema, value)).toThrow(CLIENT_READ_ERROR);
      expect(() => clientData(schema, value, true)).toThrow(CLIENT_WRITE_UNCONFIRMED);
    }
  });
  it.each(['GET', 'POST'])(
    'contains malformed JSON and network errors for %s without retry',
    async (method) => {
      const expected = method === 'POST' ? CLIENT_WRITE_UNCONFIRMED : CLIENT_READ_ERROR;
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('<private-marker>', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      await expect(requestClientData(schema, '/local', { method })).rejects.toThrow(expected);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch private-marker'));
      await expect(requestClientData(schema, '/local', { method })).rejects.toThrow(expected);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
  it('preserves a string server reason and ignores structured diagnostics', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: 'Сначала подтвердите email.' }, { status: 403 }),
      )
      .mockResolvedValueOnce(
        Response.json({ error: { internal: 'private-marker' } }, { status: 500 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestClientData(schema, '/local')).rejects.toThrow('Сначала подтвердите email.');
    await expect(requestClientData(schema, '/local', { method: 'POST' })).rejects.toThrow(
      CLIENT_WRITE_UNCONFIRMED,
    );
  });
  it('translates stable feedback while leaving unknown text intact', () => {
    expect(marketplaceCopy(CLIENT_READ_ERROR, 'kk')).toContain('Сервер жауабын');
    expect(marketplaceCopy(CLIENT_WRITE_UNCONFIRMED, 'kk')).toContain('растамайды');
    expect(marketplaceCopy('Unknown private-marker', 'kk')).toBe('Unknown private-marker');
  });
});
