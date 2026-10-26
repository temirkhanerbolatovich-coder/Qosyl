import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, request, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { createFeedFetcher, type FeedTransport } from '../src/server/content/fetch-feed';

let directory: string;
let server: Server;
let transport: FeedTransport;
let requests = 0;
let lookups = 0;
let pinnedAddress = '';
const xml =
  '<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title></channel></rss>';

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'qosyl-content-tls-'));
  const openssl =
    process.env.OPENSSL_BINARY ??
    (process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe')
      ? 'C:/Program Files/Git/usr/bin/openssl.exe'
      : 'openssl');
  execFileSync(
    openssl,
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=feed.test',
      '-addext',
      'subjectAltName=DNS:feed.test',
      '-keyout',
      path.join(directory, 'key.pem'),
      '-out',
      path.join(directory, 'cert.pem'),
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  const key = await readFile(path.join(directory, 'key.pem'));
  const cert = await readFile(path.join(directory, 'cert.pem'));
  server = createServer({ key, cert }, (incoming, response) => {
    requests += 1;
    assert.equal(incoming.headers['accept-encoding'], 'identity');
    if (incoming.url === '/redirect') {
      response.writeHead(302, { Location: '/feed' });
      response.end();
      return;
    }
    if (incoming.url === '/private') {
      response.writeHead(302, { Location: 'https://127.0.0.1/feed' });
      response.end();
      return;
    }
    if (incoming.url === '/loop') {
      response.writeHead(302, { Location: '/loop' });
      response.end();
      return;
    }
    if (incoming.url === '/not-modified') {
      response.writeHead(304);
      response.end();
      return;
    }
    if (incoming.url === '/rate') {
      response.writeHead(429, { 'Retry-After': '60' });
      response.end('sensitive provider body');
      return;
    }
    if (incoming.url === '/error') {
      response.writeHead(503);
      response.end('<h1>Private infrastructure detail</h1>');
      return;
    }
    if (incoming.url === '/hang') return;
    if (incoming.url === '/html') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<html>error page</html>');
      return;
    }
    if (incoming.url === '/encoded') {
      response.writeHead(200, { 'Content-Type': 'application/xml', 'Content-Encoding': 'gzip' });
      response.end('not decoded');
      return;
    }
    if (incoming.url === '/large') {
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.write('x'.repeat(2048));
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
    response.end(xml);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  transport = {
    lookup: async () => {
      lookups += 1;
      return [{ address: '8.8.8.8', family: 4 }];
    },
    request: (options, callback) => {
      options.lookup!('feed.test', {}, (_error, address) => {
        pinnedAddress = String(address);
      });
      // Only this test adapter maps the already-validated virtual source to its fixture socket.
      // TLS verification stays on, and the certificate must identify feed.test.
      return request(
        {
          ...options,
          port,
          ca: cert,
          lookup: (_host, options, done) => {
            if (options.all) done(null, [{ address: '127.0.0.1', family: 4 }]);
            else done(null, '127.0.0.1', 4);
          },
        },
        callback,
      );
    },
  };
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  if (
    directory &&
    path.dirname(directory) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith('qosyl-content-tls-')
  )
    await rm(directory, { recursive: true, force: true });
});

test('loads XML using real verified TLS and pins the approved DNS address', async () => {
  const result = await createFeedFetcher(transport)('https://feed.test/feed', 'feed.test');
  assert.equal(result.status, 200);
  assert.equal(result.body, xml);
  assert.equal(pinnedAddress, '8.8.8.8');
});

test('each redirect is revalidated and DNS is resolved again before the next connection', async () => {
  const before = lookups;
  assert.equal(
    (await createFeedFetcher(transport)('https://feed.test/redirect', 'feed.test')).body,
    xml,
  );
  assert.equal(lookups - before, 2);
  const requestCount = requests;
  await assert.rejects(createFeedFetcher(transport)('https://feed.test/private', 'feed.test'), {
    code: 'DISALLOWED_FEED_URL',
  });
  assert.equal(requests - requestCount, 1);
});

test('DNS rebinding to a private address after a redirect never reaches a second socket', async () => {
  let count = 0;
  const rebound = createFeedFetcher({
    ...transport,
    lookup: async () => [{ address: count++ ? '127.0.0.1' : '8.8.8.8', family: 4 }],
  });
  const before = requests;
  await assert.rejects(rebound('https://feed.test/redirect', 'feed.test'), {
    code: 'NON_PUBLIC_ADDRESS',
  });
  assert.equal(requests - before, 1);
});

test('returns 304 without fabricating content and bounds redirect loops', async () => {
  assert.deepEqual(
    await createFeedFetcher(transport)('https://feed.test/not-modified', 'feed.test'),
    { status: 304, body: '', retryAfterSeconds: null },
  );
  await assert.rejects(createFeedFetcher(transport)('https://feed.test/loop', 'feed.test'), {
    code: 'TOO_MANY_REDIRECTS',
  });
});

test('rate limits and provider failures expose safe codes instead of upstream bodies', async () => {
  await assert.rejects(createFeedFetcher(transport)('https://feed.test/rate', 'feed.test'), {
    code: 'FEED_RATE_LIMITED',
    httpStatus: 429,
    retryAfterSeconds: 60,
    message: 'FEED_RATE_LIMITED',
  });
  await assert.rejects(createFeedFetcher(transport)('https://feed.test/error', 'feed.test'), {
    code: 'FEED_SERVER_ERROR',
    httpStatus: 503,
    message: 'FEED_SERVER_ERROR',
  });
});

test('rejects HTML, compressed responses, oversized streamed bodies and hanging sources', async () => {
  const fetch = createFeedFetcher(transport);
  await assert.rejects(fetch('https://feed.test/html', 'feed.test'), {
    code: 'UNSUPPORTED_FEED_TYPE',
  });
  await assert.rejects(fetch('https://feed.test/encoded', 'feed.test'), {
    code: 'UNSUPPORTED_FEED_ENCODING',
  });
  await assert.rejects(fetch('https://feed.test/large', 'feed.test', { maxBytes: 1024 }), {
    code: 'FEED_TOO_LARGE',
  });
  await assert.rejects(fetch('https://feed.test/hang', 'feed.test', { timeoutMs: 50 }), {
    code: 'FEED_TIMEOUT',
  });
});

test('HTML sources use explicit MIME mode with the same verified TLS and DNS policy', async () => {
  const response = await createFeedFetcher(transport)('https://feed.test/html', 'feed.test', {
    format: 'html',
  });
  assert.equal(response.status, 200);
  assert.equal(response.body, '<html>error page</html>');
  await assert.rejects(
    createFeedFetcher(transport)('https://feed.test/feed', 'feed.test', { format: 'html' }),
    { code: 'UNSUPPORTED_FEED_TYPE' },
  );
});
