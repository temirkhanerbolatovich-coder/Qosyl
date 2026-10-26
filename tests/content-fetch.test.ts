import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  ContentFetchError,
  createFeedFetcher,
  isPublicFeedAddress,
  parseFeedRetryAfter,
  validateFeedUrl,
  type FeedTransport,
} from '../src/server/content/fetch-feed';

describe('content fetch SSRF boundary', () => {
  it.each([
    '0.0.0.0',
    '0.1.2.3',
    '10.1.2.3',
    '100.64.1.2',
    '100.127.255.255',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.1',
    '192.88.99.1',
    '192.168.1.1',
    '198.18.1.1',
    '198.51.100.1',
    '203.0.113.10',
    '224.0.0.1',
    '239.255.1.1',
    '240.1.2.3',
    '255.255.255.255',
    '168.63.129.16',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:8.8.8.8',
    'fe80::1',
    'fc00::1',
    'fd00::1',
    'ff02::1',
    '64:ff9b::7f00:1',
    '2001::1',
    '2001:2::1',
    '2001:10::1',
    '2001:db8::1',
    '2002:7f00:1::1',
    '3fff::1',
    'fe80::1%12',
    'not-an-address',
  ])('rejects non-public/reserved address %s', (address) => {
    expect(isPublicFeedAddress(address)).toBe(false);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '192.9.1.1',
    '2001:4860:4860::8888',
    '2606:4700:4700::1111',
    '2a00:1450:4001::1',
  ])('allows global unicast %s', (address) => {
    expect(isPublicFeedAddress(address)).toBe(true);
  });

  it.each([
    'http://feed.example/rss',
    'https://feed.example:8443/rss',
    'https://user:secret@feed.example/rss',
    'https://other.example/rss',
    'https://feed.example.attacker.test/rss',
    'https://feed.example/rss#anchor',
    'file:///etc/passwd',
    'https://127.1/rss',
    'https://0x7f000001/rss',
    'https://2130706433/rss',
  ])('rejects URLs outside the exact HTTPS source: %s', (value) => {
    expect(() => validateFeedUrl(value, 'feed.example')).toThrow(ContentFetchError);
  });

  it('normalizes a host while retaining its identity query parameters', () => {
    expect(validateFeedUrl('https://FEED.EXAMPLE.:443/rss?id=42', 'feed.example').toString()).toBe(
      'https://feed.example/rss?id=42',
    );
    expect(() => validateFeedUrl('https://feed.example/rss', '*.example')).toThrow();
    expect(() => validateFeedUrl('https://feed.example/rss', 'feed.example/path')).toThrow();
  });

  it('rejects a mixed public/private DNS result before starting any connection', async () => {
    const request = vi.fn();
    const fetch = createFeedFetcher({
      lookup: async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
      request,
    } as FeedTransport);
    await expect(fetch('https://feed.example/rss', 'feed.example')).rejects.toMatchObject({
      code: 'NON_PUBLIC_ADDRESS',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a DNS family mismatch and an empty lookup', async () => {
    for (const records of [[], [{ address: '8.8.8.8', family: 6 }]]) {
      const request = vi.fn();
      const fetch = createFeedFetcher({ lookup: async () => records, request } as FeedTransport);
      await expect(fetch('https://feed.example/rss', 'feed.example')).rejects.toMatchObject({
        code: 'NON_PUBLIC_ADDRESS',
      });
      expect(request).not.toHaveBeenCalled();
    }
  });

  it('bounds DNS time and honors caller cancellation before connecting', async () => {
    const request = vi.fn();
    const fetch = createFeedFetcher({
      lookup: () => new Promise(() => {}),
      request,
    } as FeedTransport);
    await expect(
      fetch('https://feed.example/rss', 'feed.example', { timeoutMs: 20 }),
    ).rejects.toMatchObject({ code: 'FEED_TIMEOUT' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetch('https://feed.example/rss', 'feed.example', { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'FEED_ABORTED' });
    expect(request).not.toHaveBeenCalled();
  });

  it('does not allow callers to expand hard safety limits', async () => {
    const fetch = createFeedFetcher({ lookup: vi.fn(), request: vi.fn() } as FeedTransport);
    await expect(
      fetch('https://feed.example/rss', 'feed.example', { timeoutMs: 10_001 }),
    ).rejects.toThrow(RangeError);
    await expect(
      fetch('https://feed.example/rss', 'feed.example', { maxBytes: 1_048_577 }),
    ).rejects.toThrow(RangeError);
  });
});

describe('feed retry headers', () => {
  it('bounds server delay and handles valid dates without accepting negative/invalid waits', () => {
    const now = Date.parse('2026-10-26T10:00:00Z');
    expect(parseFeedRetryAfter('60', now)).toBe(60);
    expect(parseFeedRetryAfter('999999', now)).toBe(86400);
    expect(parseFeedRetryAfter('Mon, 26 Oct 2026 10:01:00 GMT', now)).toBe(60);
    expect(parseFeedRetryAfter('Mon, 26 Oct 2026 09:00:00 GMT', now)).toBeNull();
    expect(parseFeedRetryAfter('-1', now)).toBeNull();
    expect(parseFeedRetryAfter('not a date', now)).toBeNull();
    expect(parseFeedRetryAfter(undefined, now)).toBeNull();
  });
});
