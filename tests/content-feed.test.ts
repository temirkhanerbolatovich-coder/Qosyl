import { describe, expect, it } from 'vitest';
import {
  canonicalizeContentUrl,
  ContentFeedError,
  normalizeContentItem,
  parseFeed,
} from '../src/lib/content-feed';
import { manualContentInput, sourceInput } from '../src/lib/content-validation';

const base = 'https://example.com/feed.xml';
const host = 'example.com';
const rss = (items: string, language = 'en') =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><language>${language}</language>${items}</channel></rss>`;
const item = (url = 'https://example.com/events/1', extra = '') =>
  `<item><guid>event:1</guid><title>Student hackathon</title><link>${url}</link>${extra}</item>`;

describe('RSS and Atom normalization', () => {
  it('parses RSS identity, description and publication while keeping unspecified dates unknown', () => {
    const result = parseFeed(
      rss(
        item(
          'https://example.com/events/1',
          '<description>Student competition in Kazakhstan</description><pubDate>Mon, 26 Oct 2026 10:30:00 +0500</pubDate>',
        ),
      ),
      base,
      host,
    );
    expect(result.found).toBe(1);
    expect(result.discarded).toBe(0);
    expect(result.items[0]).toMatchObject({
      externalId: 'event:1',
      title: 'Student hackathon',
      summary: 'Student competition in Kazakhstan',
      category: 'hackathon',
      language: 'en',
      deadline: null,
      eventDate: null,
      geography: '',
      score: 100,
    });
    expect(result.items[0].publishedAt?.toISOString()).toBe('2026-10-26T05:30:00.000Z');
    expect(result.items[0].publishedAtRaw).toBe('Mon, 26 Oct 2026 10:30:00 +0500');
  });

  it('parses namespaced Atom with an alternate link and relative URLs', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ru"><title>Лента</title><entry><id>tag:2026:42</id><title>Конкурс для студентов</title><link rel="self" href="/atom/42"/><link rel="alternate" href="/events/42?eventId=42&amp;utm_source=rss"/><summary type="html">&lt;p&gt;Описание &amp;amp; детали&lt;/p&gt;</summary><published>2026-10-26T12:30:00+05:00</published></entry></feed>`;
    const result = parseFeed(xml, base, host);
    expect(result.items[0]).toMatchObject({
      externalId: 'tag:2026:42',
      canonicalUrl: 'https://example.com/events/42?eventId=42',
      category: 'competition',
      summary: 'Описание & детали',
      language: 'ru',
    });
    expect(result.items[0].publishedAt?.toISOString()).toBe('2026-10-26T07:30:00.000Z');
  });

  it('strips raw, encoded and nested HTML without retaining script or style contents', () => {
    const xml = rss(
      item(
        'https://example.com/events/1',
        '<description><![CDATA[<p>Hello <b>student</b></p><script>privateToken()</script><style>secretCss</style> &lt;script&gt;encodedAttack()&lt;/script&gt; &amp; &#x41;]]></description>',
      ),
    );
    const parsed = parseFeed(xml, base, host).items[0];
    expect(parsed.summary).toBe('Hello student & A');
    expect(JSON.stringify(parsed)).not.toMatch(/privateToken|secretCss|encodedAttack|<script/i);
  });

  it('keeps numeric-looking IDs as strings and does not guess an external ID from a missing guid', () => {
    const xml = rss(
      '<item><guid>000042</guid><title>Valid internship</title><link>/first</link></item><item><title>Another internship</title><link>/second</link></item>',
    );
    const result = parseFeed(xml, base, host);
    expect(result.items.map((value) => value.externalId)).toEqual(['000042', null]);
  });

  it.each([
    '2026-10-26',
    '2026-10-26T12:00:00',
    '2026-02-31T12:00:00Z',
    '2026-10-26T24:00:00Z',
    '31 Apr 2026 10:00:00 GMT',
    'unknown',
  ])(
    'preserves an unknown or impossible publication date without fabricating time: %s',
    (value) => {
      const result = normalizeContentItem(
        { url: '/event', title: 'Valid event title', publishedAt: value },
        base,
        host,
      );
      expect(result.publishedAt).toBeNull();
      expect(result.publishedAtRaw).toBe(value);
      expect(result.deadline).toBeNull();
    },
  );

  it('preserves explicit manual deadlines and events, including historical dates', () => {
    const input = manualContentInput.parse({
      sourceId: 'source',
      url: 'https://example.com/event',
      title: 'Historical contest',
      category: 'competition',
      deadline: '2020-02-29T10:00:00Z',
      eventDate: '2020-03-02T10:00:00Z',
    });
    const result = normalizeContentItem(input, base, host);
    expect(result.deadline?.toISOString()).toBe('2020-02-29T10:00:00.000Z');
    expect(result.eventDate?.toISOString()).toBe('2020-03-02T10:00:00.000Z');
  });

  it('distinguishes URL identity from content edits and has deterministic hashes', () => {
    const first = normalizeContentItem(
      {
        externalId: 'one',
        url: '/event?id=42&utm_campaign=test#section',
        title: 'Event original title',
        summary: 'Summary',
      },
      base,
      host,
    );
    const repeated = normalizeContentItem(
      {
        externalId: 'another-provider-id',
        url: '/event?id=42',
        title: 'Event original title',
        summary: 'Summary',
      },
      base,
      host,
    );
    const changed = normalizeContentItem(
      { url: '/event?id=42', title: 'Event changed title', summary: 'Summary' },
      base,
      host,
    );
    expect(first.urlHash).toBe(repeated.urlHash);
    expect(first.contentHash).toBe(repeated.contentHash);
    expect(changed.urlHash).toBe(first.urlHash);
    expect(changed.contentHash).not.toBe(first.contentHash);
    expect(first.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('bounds item text and caps score within 0..100', () => {
    const result = normalizeContentItem(
      {
        url: '/event',
        title: `Student hackathon Kazakhstan ${'x'.repeat(1000)}`,
        summary: 'y'.repeat(2000),
        geography: 'Kazakhstan',
        language: 'not a language',
      },
      base,
      host,
    );
    expect(result.title.length).toBe(200);
    expect(result.summary.length).toBe(600);
    expect(result.score).toBe(100);
    expect(result.language).toBe('und');
  });

  it('counts discarded items and truncation explicitly instead of silently reporting success', () => {
    const xml = rss(
      item() +
        item('https://foreign.example.org/not-allowed') +
        '<item><title>Missing URL item</title></item>' +
        item('/fourth'),
    );
    const result = parseFeed(xml, base, host, 3);
    expect(result.found).toBe(4);
    expect(result.discarded).toBe(3);
    expect(result.items).toHaveLength(1);
  });

  it.each([
    '<rss><channel><item></channel></rss>',
    '<html><title>Not a feed</title></html>',
    '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///private">]><rss><channel/></rss>',
    '<!dOcTyPe rss><rss><channel/></rss>',
    '<!ENTITY a "text"><rss><channel/></rss>',
  ])('rejects malformed, unsupported, or entity-bearing XML', (xml) => {
    expect(() => parseFeed(xml, base, host)).toThrow(ContentFeedError);
  });

  it('bounds XML input, nesting, and requested item limit', () => {
    expect(() => parseFeed(' '.repeat(1_048_577), base, host)).toThrowError('FEED_TOO_LARGE');
    expect(() => parseFeed('<x>'.repeat(65) + '</x>'.repeat(65), base, host)).toThrowError(
      'UNSAFE_XML',
    );
    expect(() => parseFeed(rss(item()), base, host, 201)).toThrowError('INVALID_ITEM_LIMIT');
    expect(parseFeed(rss(''), base, host).items).toEqual([]);
  });
});

describe('content URL and source validation', () => {
  it('matches the database URL boundary in request validation and normalization', () => {
    const prefix = 'https://example.com/';
    const url = prefix + 'a'.repeat(2000 - prefix.length);
    const input = { sourceId: 'source', title: 'Student opportunity', url };
    expect(manualContentInput.safeParse(input).success).toBe(true);
    expect(canonicalizeContentUrl(url, base, host)).toHaveLength(2000);
    expect(manualContentInput.safeParse({ ...input, url: `${url}a` }).success).toBe(false);
    expect(() => canonicalizeContentUrl(`${url}a`, base, host)).toThrowError('INVALID_CONTENT_URL');
    const expandedQuery = `https://example.com/?value=${'~'.repeat(660)}&utm_source=test`;
    expect(expandedQuery.length).toBeLessThan(2000);
    expect(() => canonicalizeContentUrl(expandedQuery, base, host)).toThrowError(
      'INVALID_CONTENT_URL',
    );
  });
  it('removes tracking only while preserving the identity query and standard HTTPS port', () => {
    expect(
      canonicalizeContentUrl(
        'https://EXAMPLE.com:443/events?id=7&utm_source=x&GCLID=y&other=z#part',
        base,
        host,
      ),
    ).toBe('https://example.com/events?id=7&other=z');
  });
  it.each([
    '',
    'http://example.com/event',
    'javascript:alert(1)',
    'https://user:secret@example.com/event',
    'https://example.com:8443/event',
    'https://example.com.evil.org/event',
    'https://127.0.0.1/event',
    'https://[::1]/event',
    'https://example.com./event',
    'https://machine.local/event',
  ])('rejects unsafe or foreign content URLs: %s', (url) => {
    expect(() => canonicalizeContentUrl(url, base, host)).toThrowError('INVALID_CONTENT_URL');
  });
  it('requires source rights notes and an exact allowed feed domain', () => {
    const valid = {
      name: 'Organizer feed',
      type: 'rss',
      feedUrl: base,
      allowedHost: host,
      rightsNote: 'Public feed checked by editor.',
    };
    expect(sourceInput.safeParse(valid).success).toBe(true);
    expect(sourceInput.safeParse({ ...valid, rightsNote: '' }).success).toBe(false);
    expect(sourceInput.safeParse({ ...valid, allowedHost: 'other.example.com' }).success).toBe(
      false,
    );
    expect(sourceInput.safeParse({ ...valid, feedUrl: null }).success).toBe(false);
    expect(sourceInput.safeParse({ ...valid, type: 'manual' }).success).toBe(false);
    expect(sourceInput.parse({ ...valid, type: 'manual', feedUrl: null }).enabled).toBe(false);
  });
});
