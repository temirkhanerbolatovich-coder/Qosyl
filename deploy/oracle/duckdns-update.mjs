import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';

export function duckDnsRequest(environment) {
  const domain = environment.DUCKDNS_SUBDOMAIN || '';
  const token = environment.DUCKDNS_TOKEN || '';
  const ip = environment.DUCKDNS_IPV4 || '';
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain))
    throw new Error('Set one valid DUCKDNS_SUBDOMAIN without .duckdns.org.');
  if (!/^[a-zA-Z0-9-]{20,100}$/.test(token))
    throw new Error('Set DUCKDNS_TOKEN in the protected environment file.');
  const parts = ip.split('.').map(Number);
  if (
    isIP(ip) !== 4 ||
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] >= 224 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  )
    throw new Error('DUCKDNS_IPV4 must be the public IPv4 of the selected Oracle VM.');
  const url = new URL('https://www.duckdns.org/update');
  url.searchParams.set('domains', domain);
  url.searchParams.set('token', token);
  url.searchParams.set('ip', ip);
  return url;
}
export function checkDuckDnsResponse(status, text) {
  if (status !== 200 || text.trim() !== 'OK')
    throw new Error(
      'DuckDNS did not acknowledge the update. Check domain ownership, token and connectivity.',
    );
}
async function main() {
  const url = duckDnsRequest(process.env);
  if (!process.argv.includes('--apply')) {
    console.log('DuckDNS configuration validated. No network request or DNS change was made.');
    return;
  }
  const loop = process.argv.includes('--loop');
  do {
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      checkDuckDnsResponse(response.status, await response.text());
      console.log('DuckDNS acknowledged the configured VM address.');
    } catch {
      // Never log the request URL or fetch exception: the provider puts its token in the query.
      console.error('DuckDNS update failed; request details and credentials were not logged.');
      if (!loop) {
        process.exitCode = 1;
        return;
      }
    }
    if (loop) await new Promise((resolve) => setTimeout(resolve, 300000));
  } while (loop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Invalid DNS updater configuration.');
    process.exitCode = 1;
  });
}
