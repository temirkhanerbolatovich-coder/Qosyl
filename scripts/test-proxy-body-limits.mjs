import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Supply a trusted local Caddy binary; this check never downloads or installs tools.
const binary = process.env.CADDY_BIN;
if (!binary || !path.isAbsolute(binary) || !(await stat(binary)).isFile())
  throw Error('Set CADDY_BIN to an absolute path to an installed Caddy binary.');
const output = path.resolve(
  '.local',
  'proxy-body-limits',
  new Date().toISOString().replaceAll(':', '-'),
);
await mkdir(output, { recursive: true });
const upstream = createServer(async (request, response) => {
  let received = 0;
  try {
    for await (const chunk of request) received += chunk.length;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ received }));
  } catch {
    // Caddy can abort the upstream stream when its actual byte limit is reached.
    response.destroy();
  }
});
await new Promise((resolve, reject) => {
  upstream.once('error', reject);
  upstream.listen(0, '127.0.0.1', resolve);
});
const upstreamPort = upstream.address().port;
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const proxyPort = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const environment = {
  ...process.env,
  PUBLIC_HOST: `http://127.0.0.1:${proxyPort}`,
  ACME_EMAIL: 'proxy-test@example.test',
  XDG_CONFIG_HOME: path.join(output, 'config-home'),
  XDG_DATA_HOME: path.join(output, 'data-home'),
};
const results = [];
let caddy;
let startupError;
let log = '';

function command(args) {
  const result = spawnSync(binary, args, {
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
  });
  if (result.status !== 0) throw Error(`Caddy ${args[0]} failed: ${result.stderr || result.error}`);
  return result.stdout;
}

function send({ method = 'POST', route, bytes = 0, streamed = false }) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/octet-stream', Connection: 'close' };
    if (!streamed) {
      headers['Content-Length'] = String(bytes);
      if (bytes) headers.Expect = '100-continue';
    }
    const request = httpRequest(
      `http://127.0.0.1:${proxyPort}${route}`,
      { method, headers },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > 65_536) response.destroy(Error('Unexpectedly large proxy test response.'));
          else chunks.push(chunk);
        });
        response.once('error', reject);
        response.once('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: response.statusCode,
            received: response.statusCode === 200 ? JSON.parse(body).received : undefined,
          });
        });
      },
    );
    request.once('error', reject);
    request.setTimeout(5_000, () => request.destroy(Error('Loopback proxy request timed out.')));
    if (streamed) {
      request.write(Buffer.alloc(bytes, 120));
      request.end();
    } else if (bytes) {
      // Avoid sending an oversized declared body after Caddy has already rejected its headers.
      request.once('continue', () => request.end(Buffer.alloc(bytes, 120)));
      request.flushHeaders();
    } else request.end();
  });
}

try {
  const version = command(['version']).trim();
  // Adapt the repository's complete config, then replace only listener/upstream addresses.
  // https://caddyserver.com/docs/command-line#caddy-adapt
  const configuration = JSON.parse(
    command(['adapt', '--adapter', 'caddyfile', '--config', 'deploy/oracle/Caddyfile']),
  );
  let upstreams = 0;
  function redirectUpstream(value) {
    if (!value || typeof value !== 'object') return;
    if (value.handler === 'reverse_proxy') {
      assert.deepEqual(
        value.upstreams,
        [{ dial: 'app:3000' }],
        'Unexpected production proxy target.',
      );
      value.upstreams = [{ dial: `127.0.0.1:${upstreamPort}` }];
      upstreams++;
    }
    for (const child of Object.values(value)) redirectUpstream(child);
  }
  redirectUpstream(configuration);
  assert.equal(upstreams, 1);
  for (const server of Object.values(configuration.apps.http.servers)) {
    assert.equal(server.listen.length, 1, 'Unexpected proxy listener count.');
    assert.ok([`:${proxyPort}`, `127.0.0.1:${proxyPort}`].includes(server.listen[0]));
    server.listen = [`127.0.0.1:${proxyPort}`];
  }
  const configFile = path.join(output, 'config.json');
  await writeFile(configFile, JSON.stringify(configuration, null, 2));
  command(['validate', '--config', configFile]);
  caddy = spawn(binary, ['run', '--config', configFile], {
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  caddy.stdout.on('data', (chunk) => {
    log += chunk;
  });
  caddy.stderr.on('data', (chunk) => {
    log += chunk;
  });
  caddy.once('error', (error) => {
    startupError = error;
  });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (startupError) throw startupError;
    if (caddy.exitCode !== null) throw Error('Local Caddy stopped before becoming ready.');
    try {
      ready = (await send({ method: 'GET', route: '/proxy-ready' })).status === 200;
    } catch {
      // The child process has not bound its listener yet.
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, 'Local Caddy did not become ready.');
  const jsonLimit = 128_000;
  const avatarLimit = 2 * 1024 * 1024;
  const attachmentLimit = 5 * 1024 * 1024;
  const cases = [
    { name: 'ordinary JSON at limit', route: '/api/profile', bytes: jsonLimit, expected: 200 },
    {
      name: 'ordinary JSON above limit',
      route: '/api/profile',
      bytes: jsonLimit + 1,
      expected: 413,
    },
    {
      name: 'avatar exceeds ordinary limit',
      route: '/api/profile/avatar',
      bytes: 256_000,
      expected: 200,
    },
    { name: 'avatar at 2 MiB', route: '/api/profile/avatar', bytes: avatarLimit, expected: 200 },
    {
      name: 'avatar above 2 MiB',
      route: '/api/profile/avatar',
      bytes: avatarLimit + 1,
      expected: 413,
    },
    {
      name: 'avatar query at 2 MiB',
      route: '/api/profile/avatar?revision=synthetic',
      bytes: avatarLimit,
      expected: 200,
    },
    {
      name: 'avatar PATCH at ordinary limit',
      method: 'PATCH',
      route: '/api/profile/avatar',
      bytes: jsonLimit,
      expected: 200,
    },
    {
      name: 'avatar PATCH above ordinary limit',
      method: 'PATCH',
      route: '/api/profile/avatar',
      bytes: jsonLimit + 1,
      expected: 413,
    },
    {
      name: 'avatar DELETE above ordinary limit',
      method: 'DELETE',
      route: '/api/profile/avatar',
      bytes: jsonLimit + 1,
      expected: 413,
    },
    {
      name: 'avatar neighboring path',
      route: '/api/profile/avatar-extra',
      bytes: jsonLimit + 1,
      expected: 413,
    },
    {
      name: 'avatar nested path',
      route: '/api/profile/avatar/extra',
      bytes: jsonLimit + 1,
      expected: 413,
    },
    {
      name: 'attachment at 5 MiB',
      route: '/api/projects/synthetic/attachments',
      bytes: attachmentLimit,
      expected: 200,
    },
    {
      name: 'attachment above 5 MiB',
      route: '/api/projects/synthetic/attachments',
      bytes: attachmentLimit + 1,
      expected: 413,
    },
    {
      name: 'attachment neighboring path',
      route: '/api/projects/synthetic/attachments-extra',
      bytes: jsonLimit + 1,
      expected: 413,
    },
    {
      name: 'chunked ordinary body at limit',
      route: '/api/profile',
      bytes: jsonLimit,
      streamed: true,
      expected: 200,
    },
    {
      name: 'chunked ordinary body above limit',
      route: '/api/profile',
      bytes: jsonLimit + 1,
      streamed: true,
      expected: 413,
    },
    {
      name: 'chunked avatar at 2 MiB',
      route: '/api/profile/avatar',
      bytes: avatarLimit,
      streamed: true,
      expected: 200,
    },
    {
      name: 'chunked avatar above 2 MiB',
      route: '/api/profile/avatar',
      bytes: avatarLimit + 1,
      streamed: true,
      expected: 413,
    },
    {
      name: 'chunked attachment above 5 MiB',
      route: '/api/projects/synthetic/attachments',
      bytes: attachmentLimit + 1,
      streamed: true,
      expected: 413,
    },
  ];
  for (const item of cases) {
    const result = await send(item);
    results.push({ ...item, ...result });
    assert.equal(result.status, item.expected, item.name);
    if (item.expected === 200) assert.equal(result.received, item.bytes, item.name);
    console.log(`PASS ${item.name}`);
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ version, results }, null, 2));
  console.log(`Proxy body limits verified: ${results.length} checks; evidence: ${output}`);
} finally {
  if (caddy?.pid && caddy.exitCode === null) {
    const stopped = once(caddy, 'exit');
    caddy.kill();
    const forceStop = setTimeout(() => caddy.kill('SIGKILL'), 5_000);
    try {
      await stopped;
    } finally {
      clearTimeout(forceStop);
    }
  }
  upstream.closeAllConnections();
  await new Promise((resolve) => upstream.close(resolve));
  await writeFile(path.join(output, 'caddy.log'), log);
  if (results.length)
    await writeFile(path.join(output, 'observed-results.json'), JSON.stringify(results, null, 2));
}
