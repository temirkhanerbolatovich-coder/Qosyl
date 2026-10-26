import { describe, it, expect } from 'vitest';
import { duckDnsRequest, checkDuckDnsResponse } from '../deploy/oracle/duckdns-update.mjs';

const values = {
  DUCKDNS_SUBDOMAIN: 'student-project-kz',
  DUCKDNS_TOKEN: 'unit-test-token-not-a-real-credential',
  DUCKDNS_IPV4: '8.8.8.8',
};
describe('DuckDNS request contract, no network requests', () => {
  it('uses the fixed official HTTPS endpoint and explicit VM address', () => {
    const url = duckDnsRequest(values);
    expect(url.origin).toBe('https://www.duckdns.org');
    expect(url.pathname).toBe('/update');
    expect(url.searchParams.get('domains')).toBe(values.DUCKDNS_SUBDOMAIN);
    expect(url.searchParams.get('ip')).toBe('8.8.8.8');
  });
  it('rejects extra domains, shell fragments and local addresses', () => {
    for (const domain of ['a,b', 'a.duckdns.org', '../a', 'a;curl'])
      expect(() => duckDnsRequest({ ...values, DUCKDNS_SUBDOMAIN: domain })).toThrow();
    for (const ip of ['127.0.0.1', '10.0.0.2', '192.168.1.1', '169.254.169.254'])
      expect(() => duckDnsRequest({ ...values, DUCKDNS_IPV4: ip })).toThrow();
  });
  it('does not treat HTTP200 KO or an HTML error as success', () => {
    expect(() => checkDuckDnsResponse(200, 'OK\n')).not.toThrow();
    for (const [status, text] of [
      [200, 'KO'],
      [200, '<html>error</html>'],
      [503, 'OK'],
    ] as const)
      expect(() => checkDuckDnsResponse(status, text)).toThrow();
  });
});
