import { describe, expect, it } from 'vitest';
import { localDemoSettings } from '../scripts/local-demo-config.mjs';

const local = {
  LOCAL_DEV_MODE: 'true',
  DEMO_ENABLED: 'true',
  DATABASE_URL: 'postgresql://demo:example-only-password@127.0.0.1:55432/student_marketplace',
  BETTER_AUTH_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'example-only-secret-with-at-least-32-characters',
};

describe('demo and backup isolation', () => {
  it('accepts only the dedicated local demo database', () => {
    expect(localDemoSettings(local).database.pathname).toBe('/student_marketplace');
  });
  it('rejects external hosts, system port, other databases and connection options', () => {
    for (const database of [
      local.DATABASE_URL.replace('127.0.0.1', 'example.com'),
      local.DATABASE_URL.replace('55432', '5432'),
      local.DATABASE_URL.replace('student_marketplace', 'postgres'),
      local.DATABASE_URL + '?host=example.com',
      local.DATABASE_URL.replace('postgresql:', 'https:'),
    ])
      expect(() => localDemoSettings({ ...local, DATABASE_URL: database })).toThrow();
  });
  it('rejects public demo URLs and production mode before touching data', () => {
    expect(() => localDemoSettings({ ...local, LOCAL_DEV_MODE: 'false' })).toThrow();
    expect(() => localDemoSettings({ ...local, DEMO_ENABLED: 'false' })).toThrow();
    expect(() => localDemoSettings({ ...local, BETTER_AUTH_URL: 'http://0.0.0.0:3000' })).toThrow();
    expect(() => localDemoSettings({ ...local, BETTER_AUTH_URL: 'https://example.com' })).toThrow();
  });
});
