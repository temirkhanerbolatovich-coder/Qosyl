import 'server-only';
import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { BlockList, isIP } from 'node:net';
import { domainToASCII } from 'node:url';

const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_RETRY_SECONDS = 86_400;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const xmlMediaTypes = new Set([
  'application/xml',
  'text/xml',
  'application/rss+xml',
  'application/atom+xml',
]);

const blockedV4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blockedV4.addSubnet(address, prefix, 'ipv4');
// Azure's platform virtual address is not globally routable application content.
blockedV4.addAddress('168.63.129.16', 'ipv4');

const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
for (const [address, prefix] of [
  ['2001::', 23], // Protocol assignments, Teredo, benchmarking, and ORCHID.
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const)
  blockedV6.addSubnet(address, prefix, 'ipv6');

/** Conservative global-unicast policy; mapped/translated IPv4 is never a bypass. */
export function isPublicFeedAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, 'ipv4');
  return (
    family === 6 &&
    !address.includes('%') &&
    globalV6.check(address, 'ipv6') &&
    !blockedV6.check(address, 'ipv6')
  );
}

export class ContentFetchError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = 'ContentFetchError';
  }
}

export interface FeedFetchOptions {
  format?: 'xml' | 'html';
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
}
export interface FeedFetchResult {
  status: number;
  body: string;
  retryAfterSeconds: number | null;
}
export interface FeedTransport {
  lookup: (hostname: string) => Promise<LookupAddress[]>;
  request: (
    options: RequestOptions,
    callback: (response: IncomingMessage) => void,
  ) => ClientRequest;
}

function hostName(value: string) {
  const trimmed = value.toLowerCase().replace(/\.$/, '');
  const unwrapped = trimmed.replace(/^\[|\]$/g, '');
  return isIP(unwrapped) ? unwrapped : domainToASCII(unwrapped);
}

/** Exact host, HTTPS only, standard TLS port, no credentials or fragment. */
export function validateFeedUrl(value: string, allowedHost: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ContentFetchError('INVALID_FEED_URL');
  }
  const host = hostName(url.hostname);
  const expected = hostName(allowedHost);
  if (
    url.protocol !== 'https:' ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password ||
    url.hash ||
    !host ||
    !expected ||
    host !== expected ||
    /[\s/?#@%]/.test(allowedHost) ||
    (allowedHost.includes(':') && !isIP(expected))
  )
    throw new ContentFetchError('DISALLOWED_FEED_URL');
  if (isIP(host) && !isPublicFeedAddress(host)) throw new ContentFetchError('NON_PUBLIC_ADDRESS');
  url.hostname = isIP(host) === 6 ? `[${host}]` : host;
  return url;
}

export function parseFeedRetryAfter(value: string | undefined, now = Date.now()) {
  if (!value) return null;
  const seconds = /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : (Date.parse(value) - now) / 1000;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(MAX_RETRY_SECONDS, Math.ceil(seconds));
}

function positiveBound(value: number | undefined, fallback: number, maximum: number) {
  const parsed = value ?? fallback;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum)
    throw new RangeError('Feed fetch limit is outside the allowed range.');
  return parsed;
}

async function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

type HttpResult = FeedFetchResult & { location?: string };

function requestOnce(
  transport: FeedTransport,
  url: URL,
  address: LookupAddress,
  signal: AbortSignal,
  maxBytes: number,
  format: 'xml' | 'html',
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const finishFailure = (error: unknown) =>
      reject(
        error instanceof ContentFetchError ? error : new ContentFetchError('FEED_NETWORK_ERROR'),
      );
    const request = transport.request(
      {
        protocol: 'https:',
        hostname: hostName(url.hostname),
        port: 443,
        method: 'GET',
        path: url.pathname + url.search,
        agent: false,
        signal,
        rejectUnauthorized: true,
        ...(isIP(hostName(url.hostname)) ? {} : { servername: hostName(url.hostname) }),
        // No second DNS resolution can replace the vetted address before connecting.
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
        headers: {
          Accept:
            format === 'html'
              ? 'text/html, application/xhtml+xml'
              : 'application/rss+xml, application/atom+xml, application/xml, text/xml',
          'Accept-Encoding': 'identity',
          'User-Agent': 'QosylContentIntake/0.1',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const retryAfterSeconds = parseFeedRetryAfter(response.headers['retry-after']);
        if (redirectStatuses.has(status)) {
          const location = response.headers.location;
          response.destroy();
          if (!location) return finishFailure(new ContentFetchError('INVALID_REDIRECT', status));
          resolve({ status, body: '', retryAfterSeconds, location });
          return;
        }
        if (status === 304) {
          response.destroy();
          resolve({ status, body: '', retryAfterSeconds });
          return;
        }
        if (status < 200 || status >= 300) {
          response.destroy();
          finishFailure(
            new ContentFetchError(
              status === 429
                ? 'FEED_RATE_LIMITED'
                : status >= 500
                  ? 'FEED_SERVER_ERROR'
                  : 'FEED_HTTP_ERROR',
              status,
              retryAfterSeconds ?? undefined,
            ),
          );
          return;
        }
        const mediaType = response.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
        const charset = /(?:^|;)\s*charset\s*=\s*"?([^;"\s]+)/i
          .exec(response.headers['content-type'] ?? '')?.[1]
          .toLowerCase();
        const encoding = response.headers['content-encoding']?.trim().toLowerCase();
        if (
          !mediaType ||
          !(format === 'html'
            ? ['text/html', 'application/xhtml+xml'].includes(mediaType)
            : xmlMediaTypes.has(mediaType))
        ) {
          response.destroy();
          finishFailure(new ContentFetchError('UNSUPPORTED_FEED_TYPE', status));
          return;
        }
        if (
          (encoding && encoding !== 'identity') ||
          (charset && !['utf-8', 'utf8', 'us-ascii'].includes(charset))
        ) {
          response.destroy();
          finishFailure(new ContentFetchError('UNSUPPORTED_FEED_ENCODING', status));
          return;
        }
        if (Number(response.headers['content-length']) > maxBytes) {
          response.destroy();
          finishFailure(new ContentFetchError('FEED_TOO_LARGE', status));
          return;
        }
        const chunks: Buffer[] = [];
        let received = 0;
        response.on('data', (chunk: Buffer) => {
          received += chunk.byteLength;
          if (received > maxBytes) {
            finishFailure(new ContentFetchError('FEED_TOO_LARGE', status));
            response.destroy();
          } else chunks.push(chunk);
        });
        response.once('error', finishFailure);
        response.once('aborted', () =>
          finishFailure(new ContentFetchError('FEED_TRUNCATED', status)),
        );
        response.once('end', () => {
          try {
            const body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
            resolve({ status, body, retryAfterSeconds });
          } catch {
            finishFailure(new ContentFetchError('INVALID_FEED_ENCODING', status));
          }
        });
      },
    );
    request.once('error', finishFailure);
    request.end();
  });
}

/** Injection is for fixture transport tests; production uses fixed DNS and Node TLS defaults below. */
export function createFeedFetcher(transport: FeedTransport) {
  return async function fetchFeed(
    urlValue: string,
    allowedHost: string,
    options: FeedFetchOptions = {},
  ): Promise<FeedFetchResult> {
    const timeoutMs = positiveBound(options.timeoutMs, MAX_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const maxBytes = positiveBound(options.maxBytes, MAX_RESPONSE_BYTES, MAX_RESPONSE_BYTES);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new ContentFetchError('FEED_TIMEOUT')),
      timeoutMs,
    );
    const aborted = () => controller.abort(new ContentFetchError('FEED_ABORTED'));
    options.signal?.addEventListener('abort', aborted, { once: true });
    if (options.signal?.aborted) aborted();
    try {
      if (controller.signal.aborted) throw controller.signal.reason;
      let url = validateFeedUrl(urlValue, allowedHost);
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
        const host = hostName(url.hostname);
        const addresses = isIP(host)
          ? [{ address: host, family: isIP(host) }]
          : await withAbort(transport.lookup(host), controller.signal);
        if (
          !addresses.length ||
          addresses.some(
            (entry) => !isPublicFeedAddress(entry.address) || isIP(entry.address) !== entry.family,
          )
        ) {
          throw new ContentFetchError('NON_PUBLIC_ADDRESS');
        }
        if (controller.signal.aborted) throw controller.signal.reason;
        const response = await withAbort(
          requestOnce(
            transport,
            url,
            addresses[0],
            controller.signal,
            maxBytes,
            options.format ?? 'xml',
          ),
          controller.signal,
        );
        if (!response.location)
          return {
            status: response.status,
            body: response.body,
            retryAfterSeconds: response.retryAfterSeconds,
          };
        if (redirects === MAX_REDIRECTS)
          throw new ContentFetchError('TOO_MANY_REDIRECTS', response.status);
        url = validateFeedUrl(new URL(response.location, url).toString(), allowedHost);
      }
      throw new ContentFetchError('TOO_MANY_REDIRECTS');
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error instanceof ContentFetchError || error instanceof RangeError) throw error;
      throw new ContentFetchError('FEED_NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', aborted);
    }
  };
}

export const fetchFeed = createFeedFetcher({
  lookup: (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
  request: (options, callback) => httpsRequest(options, callback),
});
