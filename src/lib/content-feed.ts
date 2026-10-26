import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

import { contentCategories } from './opportunity-search';
export { contentCategories } from './opportunity-search';
export type ContentCategory = (typeof contentCategories)[number];

export class ContentFeedError extends Error {
  constructor(
    public code:
      | 'INVALID_XML'
      | 'UNSAFE_XML'
      | 'UNSUPPORTED_FEED'
      | 'INVALID_CONTENT_URL'
      | 'INVALID_CONTENT_ITEM'
      | 'FEED_TOO_LARGE'
      | 'INVALID_ITEM_LIMIT',
  ) {
    super(code);
    this.name = 'ContentFeedError';
  }
}

export interface NormalizedContentItem {
  externalId: string | null;
  canonicalUrl: string;
  urlHash: string;
  title: string;
  summary: string;
  category: ContentCategory;
  geography: string;
  language: string;
  publishedAt: Date | null;
  publishedAtRaw: string | null;
  deadline: Date | null;
  eventDate: Date | null;
  score: number;
  contentHash: string;
}

interface ContentInput {
  externalId?: string | null;
  url: string;
  title: string;
  summary?: string;
  category?: ContentCategory;
  geography?: string;
  language?: string;
  publishedAt?: string | Date | null;
  publishedAtRaw?: string | null;
  deadline?: string | Date | null;
  eventDate?: string | Date | null;
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Only known marketing keys are removed; event IDs and other query values retain their meaning. */
export function canonicalizeContentUrl(input: string, baseUrl: string, allowedHost: string) {
  if (!input.trim()) throw new ContentFeedError('INVALID_CONTENT_URL');
  let url: URL;
  try {
    url = new URL(input, baseUrl);
  } catch {
    throw new ContentFeedError('INVALID_CONTENT_URL');
  }
  const hostname = url.hostname.toLowerCase();
  const expectedHost = allowedHost.trim().toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    hostname !== expectedHost ||
    !hostname.includes('.') ||
    hostname.endsWith('.') ||
    hostname === 'localhost' ||
    /\.(?:localhost|local|internal|test|invalid)$/.test(hostname) ||
    isIP(hostname.replace(/^\[|\]$/g, '')) ||
    url.href.length > 2000
  )
    throw new ContentFeedError('INVALID_CONTENT_URL');
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || ['gclid', 'fbclid'].includes(key.toLowerCase()))
      url.searchParams.delete(key);
  }
  url.hash = '';
  if (url.href.length > 2000) throw new ContentFeedError('INVALID_CONTENT_URL');
  return url.href;
}

function decodeText(value: string) {
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (original, entity: string) => {
      if (entity[0] !== '#')
        return (
          (
            { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<
              string,
              string
            >
          )[entity.toLowerCase()] ?? original
        );
      const number =
        entity[1].toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
        ? String.fromCodePoint(number)
        : '\ufffd';
    },
  );
}

function plainText(value: string, maximum: number) {
  // Decode before removing markup, so encoded script/style tags cannot become stored markup later.
  const decoded = decodeText(decodeText(value));
  return decoded
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum);
}

/** A publication timestamp is meaningful only with an explicit timezone; date-only stays unknown. */
function knownDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value) : null;
  if (!value) return null;
  const raw = value.trim();
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.exec(raw);
  if (iso) {
    if (Number(iso[4]) > 23 || Number(iso[5]) > 59 || Number(iso[6]) > 59) return null;
    const day = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    if (
      !Number.isFinite(day.getTime()) ||
      day.toISOString().slice(0, 10) !== `${iso[1]}-${iso[2]}-${iso[3]}`
    )
      return null;
  } else {
    const rfc =
      /^(?:[A-Za-z]{3},?\s+)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+\d{2}:\d{2}(?::\d{2})?\s+(?:GMT|UTC|UT|[+-]\d{4})$/i.exec(
        raw,
      );
    if (!rfc) return null;
    const month = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ].indexOf(rfc[2].toLowerCase());
    const day = new Date(Date.UTC(Number(rfc[3]), month, Number(rfc[1])));
    if (
      month < 0 ||
      day.getUTCDate() !== Number(rfc[1]) ||
      day.getUTCMonth() !== month ||
      day.getUTCFullYear() !== Number(rfc[3])
    )
      return null;
  }
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function classify(text: string): ContentCategory {
  if (
    /принял[аи]? участие|состоял(?:ся|ась|ось|ись)|прош(?:[её]л|л[аои])|итоги|поздравля|обладатели.{0,45}грант|завоевали/i.test(
      text,
    )
  )
    return 'news';
  if (/hackathon|хакатон/i.test(text)) return 'hackathon';
  if (/scholarship|стипенди|шәкіртақы/i.test(text)) return 'scholarship';
  if (/grant|грант/i.test(text)) return 'grant';
  if (/competition|contest|конкурс|соревнован|байқау/i.test(text)) return 'competition';
  if (
    /internship|стажиров|производственн[а-яё ]{0,15}практик|профессиональн[а-яё ]{0,15}практик|тағылымдама/i.test(
      text,
    )
  )
    return 'internship';
  if (
    /conference|workshop|webinar|event|конференц|мероприят|вебинар|воркшоп|семинар|лекци/i.test(
      text,
    )
  )
    return 'event';
  if (
    /course|training|bootcamp|обучени|курс|интенсив|оқыту|академическ.{0,6}мобильност/i.test(text)
  )
    return 'training';
  return 'other';
}

export function normalizeContentItem(
  input: ContentInput,
  baseUrl: string,
  allowedHost: string,
): NormalizedContentItem {
  const canonicalUrl = canonicalizeContentUrl(input.url, baseUrl, allowedHost);
  const title = plainText(input.title, 200);
  if (title.length < 3) throw new ContentFeedError('INVALID_CONTENT_ITEM');
  const summary = plainText(input.summary ?? '', 600);
  const category = input.category ?? classify(`${title} ${summary}`);
  if (!contentCategories.includes(category)) throw new ContentFeedError('INVALID_CONTENT_ITEM');
  const geography = plainText(input.geography ?? '', 120);
  const language =
    /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(input.language ?? '') &&
    (input.language?.length ?? 0) <= 20
      ? input.language!.toLowerCase()
      : 'und';
  const publishedAtRaw =
    (input.publishedAtRaw ?? (typeof input.publishedAt === 'string' ? input.publishedAt : null))
      ?.trim()
      .slice(0, 300) || null;
  const publishedAt = knownDate(input.publishedAt);
  const deadline = knownDate(input.deadline);
  const eventDate = knownDate(input.eventDate);
  const score = Math.min(
    100,
    40 +
      (category === 'other' ? 0 : 35) +
      (/student|студент/i.test(`${title} ${summary}`) ? 15 : 0) +
      (/kazakhstan|қазақстан|казахстан/i.test(`${title} ${summary} ${geography}`) ? 15 : 0),
  );
  const semantic = {
    canonicalUrl,
    title,
    summary,
    category,
    geography,
    language,
    publishedAt: publishedAt?.toISOString() ?? null,
    publishedAtRaw,
    deadline: deadline?.toISOString() ?? null,
    eventDate: eventDate?.toISOString() ?? null,
  };
  return {
    ...semantic,
    publishedAt,
    deadline,
    eventDate,
    externalId: input.externalId?.trim().slice(0, 500) || null,
    urlHash: hash(canonicalUrl),
    score,
    contentHash: hash(JSON.stringify(semantic)),
  };
}

type XmlNode = Record<string, unknown>;
const object = (value: unknown): XmlNode =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as XmlNode) : {};
const list = (value: unknown): unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
function nodeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(nodeText).join(' ');
  return Object.entries(object(value))
    .filter(([key]) => !key.startsWith('@_') && !/^(?:script|style)$/i.test(key))
    .map(([, item]) => nodeText(item))
    .join(' ');
}

function checkXmlBounds(xml: string) {
  if (Buffer.byteLength(xml, 'utf8') > 1_048_576) throw new ContentFeedError('FEED_TOO_LARGE');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new ContentFeedError('UNSAFE_XML');
  let depth = 0;
  for (const match of xml.matchAll(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z_][^<>]*>/g,
  )) {
    const token = match[0];
    if (token.startsWith('<!') || token.startsWith('<?')) continue;
    if (token.startsWith('</')) depth -= 1;
    else if (!token.endsWith('/>')) depth += 1;
    if (depth > 64) throw new ContentFeedError('UNSAFE_XML');
  }
  if (XMLValidator.validate(xml) !== true) throw new ContentFeedError('INVALID_XML');
}

export function parseFeed(xml: string, feedUrl: string, allowedHost: string, maxItems = 50) {
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 200)
    throw new ContentFeedError('INVALID_ITEM_LIMIT');
  canonicalizeContentUrl(feedUrl, feedUrl, allowedHost);
  checkXmlBounds(xml);
  let document: XmlNode;
  try {
    document = object(
      new XMLParser({
        ignoreAttributes: false,
        removeNSPrefix: true,
        parseTagValue: false,
        parseAttributeValue: false,
        trimValues: true,
        processEntities: false,
        maxNestedTags: 64,
      }).parse(xml),
    );
  } catch {
    throw new ContentFeedError('INVALID_XML');
  }
  const atom = Object.hasOwn(document, 'feed');
  const root = atom ? object(document.feed) : object(object(document.rss).channel);
  if ((!atom && !Object.hasOwn(document, 'rss')) || !Object.keys(root).length)
    throw new ContentFeedError('UNSUPPORTED_FEED');
  const entries = list(root[atom ? 'entry' : 'item']);
  const language = nodeText(root.language) || String(root['@_lang'] ?? 'und');
  const items: NormalizedContentItem[] = [];
  let discarded = Math.max(0, entries.length - maxItems);
  for (const value of entries.slice(0, maxItems)) {
    const entry = object(value);
    const links = list(entry.link);
    const atomLink = links
      .map(object)
      .find((link) => !link['@_rel'] || link['@_rel'] === 'alternate');
    const url = atom ? String(atomLink?.['@_href'] ?? '') : nodeText(entry.link);
    const externalId = nodeText(entry[atom ? 'id' : 'guid']);
    const rawDate = nodeText(entry[atom ? 'published' : 'pubDate']) || nodeText(entry.updated);
    try {
      items.push(
        normalizeContentItem(
          {
            externalId: decodeText(externalId),
            url: decodeText(url),
            title: nodeText(entry.title),
            summary:
              nodeText(entry[atom ? 'summary' : 'description']) ||
              nodeText(entry.content) ||
              nodeText(entry.encoded),
            language: String(entry['@_lang'] ?? language),
            publishedAt: rawDate || null,
          },
          feedUrl,
          allowedHost,
        ),
      );
    } catch (error) {
      if (!(error instanceof ContentFeedError)) throw error;
      discarded += 1;
    }
  }
  return { items, found: entries.length, discarded };
}
