import 'server-only';
import { threadsSearchDataSchema, type ThreadsCandidate } from '@/lib/threads-search';

export class ThreadsSearchError extends Error {
  constructor(
    public readonly kind: 'access' | 'rate' | 'unavailable' | 'invalid',
    public readonly retryAfterSeconds?: number,
  ) {
    super(
      kind === 'access'
        ? 'Threads: проверьте срок токена и разрешение приложения на поиск.'
        : kind === 'rate'
          ? 'Threads ограничил частоту. Повторите поиск после паузы.'
          : kind === 'invalid'
            ? 'Threads вернул неподдерживаемый ответ. Результат не сохранён.'
            : 'Threads временно недоступен. Повторите поиск позже.',
    );
  }
}

function retrySeconds(response: Response) {
  const value = response.headers.get('retry-after');
  if (!value) return 60;
  const seconds = /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - Date.now()) / 1000;
  return Number.isFinite(seconds) ? Math.max(1, Math.min(86400, Math.ceil(seconds))) : 60;
}

function normalize(raw: unknown): ThreadsCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.text !== 'string' ||
    typeof row.permalink !== 'string' ||
    typeof row.timestamp !== 'string' ||
    typeof row.username !== 'string' ||
    !/^[a-zA-Z0-9._]{1,60}$/.test(row.username)
  )
    return null;
  let source: URL;
  try {
    source = new URL(row.permalink);
  } catch {
    return null;
  }
  if (
    source.protocol !== 'https:' ||
    source.username ||
    source.password ||
    source.port ||
    !['threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'].includes(
      source.hostname,
    ) ||
    !/^\/@[a-zA-Z0-9._]{1,60}\/post\/[a-zA-Z0-9_-]{1,100}\/?$/.test(source.pathname)
  )
    return null;
  source.hostname = 'www.threads.com';
  source.search = '';
  source.hash = '';
  source.pathname = source.pathname
    .replace(/\/$/, '')
    .replace(/^\/@([^/]+)/, (_, name: string) => `/@${name.toLowerCase()}`);
  const summary = row.text
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, 2000);
  const timestamp = Date.parse(row.timestamp);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 300000) return null;
  const parsed = threadsSearchDataSchema.shape.items.element.safeParse({
    externalId: row.id,
    sourceUrl: source.toString(),
    sourceName: `Threads @${row.username}`,
    title: `Threads: ${summary.replace(/\s+/g, ' ')}`.slice(0, 140),
    summary,
    publishedAt: new Date(timestamp).toISOString(),
  });
  return parsed.success ? parsed.data : null;
}

/** One bounded official read. Never follows paging URLs or redirects carrying a token. */
export async function searchThreads(
  query: string,
  token: string,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
) {
  const url = new URL('https://graph.threads.net/keyword_search');
  url.search = new URLSearchParams({
    q: query,
    search_type: 'RECENT',
    limit: '25',
    fields: 'id,text,permalink,timestamp,username',
    access_token: token,
  }).toString();
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs ?? 10000),
    });
    if (response.status === 429) {
      await response.body?.cancel();
      throw new ThreadsSearchError('rate', retrySeconds(response));
    }
    if ([401, 403].includes(response.status)) {
      await response.body?.cancel();
      throw new ThreadsSearchError('access');
    }
    if (response.status >= 500) {
      await response.body?.cancel();
      throw new ThreadsSearchError('unavailable');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ThreadsSearchError('invalid');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 262144) {
        await reader.cancel();
        throw new ThreadsSearchError('invalid');
      }
      chunks.push(next.value);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new ThreadsSearchError('invalid');
    }
    if (!body || typeof body !== 'object') throw new ThreadsSearchError('invalid');
    const payload = body as { data?: unknown; error?: { code?: number } };
    if (payload.error)
      throw new ThreadsSearchError(
        payload.error.code === 190 || payload.error.code === 10 || payload.error.code === 200
          ? 'access'
          : [4, 17, 32, 613].includes(payload.error.code ?? 0)
            ? 'rate'
            : 'unavailable',
        [4, 17, 32, 613].includes(payload.error.code ?? 0) ? 60 : undefined,
      );
    if (!response.ok) throw new ThreadsSearchError('unavailable');
    if (!Array.isArray(payload.data) || payload.data.length > 100)
      throw new ThreadsSearchError('invalid');
    const items: ThreadsCandidate[] = [],
      seen = new Set<string>();
    let discarded = 0;
    for (const raw of payload.data) {
      const item = normalize(raw);
      if (!item || seen.has(item.externalId) || seen.has(item.sourceUrl) || items.length >= 25) {
        discarded++;
        continue;
      }
      seen.add(item.externalId);
      seen.add(item.sourceUrl);
      items.push(item);
    }
    return threadsSearchDataSchema.parse({ items, discarded, searchType: 'RECENT', limited: true });
  } catch (error) {
    if (error instanceof ThreadsSearchError) throw error;
    // Fetch errors may contain the credential-bearing URL; never expose/log them.
    throw new ThreadsSearchError('unavailable');
  }
}
