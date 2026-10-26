import { describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { $queryRaw: mocks.query } }));
import { GET } from '../src/app/api/health/route';

describe('Operational health response', () => {
  it('reports readiness without internal connection details', async () => {
    mocks.query.mockResolvedValueOnce([{ value: 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('reports503 and hides exception details when a query fails (simulated failure)', async () => {
    mocks.query.mockRejectedValueOnce(new Error('sensitive-internal-connection-data'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });
});
