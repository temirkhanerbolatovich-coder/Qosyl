import { load } from 'cheerio';
import { ContentFeedError, normalizeContentItem, type NormalizedContentItem } from './content-feed';

/** Parse public listing cards only; never executes page scripts or follows their URLs. */
export function parseHtmlOpportunities(
  html: string,
  pageUrl: string,
  allowedHost: string,
  maxItems = 50,
) {
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 100)
    throw new ContentFeedError('INVALID_ITEM_LIMIT');
  if (Buffer.byteLength(html, 'utf8') > 1_048_576) throw new ContentFeedError('FEED_TOO_LARGE');
  const $ = load(html);
  $('script,style,nav,header,footer,form,template,noscript').remove();
  const articlePage =
    $('meta[property="og:type"]').attr('content') === 'article' || $('article h1').length > 0;
  const pageTitle = $('article h1,main h1,h1').first().text().trim();
  const pageSummary = $('article,main,#content,.content')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  const pageDescription = $('meta[name="description"]').attr('content') || '';
  const language = $('html').attr('lang') || 'und';

  const candidates: {
    url: string;
    title: string;
    summary: string;
    publishedAt?: string;
    publishedAtRaw?: string;
  }[] = [];
  // Astana Hub publishes real event cards using a literal Alpine navigation attribute.
  // Only extract its quoted URL; evaluating the attribute would execute untrusted code.
  if (allowedHost === 'astanahub.com') {
    $('article.card-item').each((_, element) => {
      const card = $(element);
      const url = /window\.location\.href\s*=\s*['"]([^'"]+)['"]/.exec(
        card.attr('@click') || '',
      )?.[1];
      const title = card.find('h2,h3,h4').first().text().trim();
      if (url && title)
        candidates.push({
          url,
          title,
          summary: card.find('p').text(),
          publishedAt: card.find('time[datetime]').attr('datetime'),
        });
    });
  }
  $('a[href]').each((_, element) => {
    const anchor = $(element);
    const container = anchor.closest('article,.flownews,.news-item,.post');
    let withinListing = false;
    try {
      const link = new URL(anchor.attr('href') || '', pageUrl);
      const listing = new URL(pageUrl);
      withinListing =
        link.hostname === allowedHost &&
        link.pathname.startsWith(listing.pathname) &&
        link.pathname !== listing.pathname;
    } catch {
      /* Invalid links are discarded below. */
    }
    const linkText = anchor.text().replace(/\s+/g, ' ').trim();
    const abaiTitle = allowedHost === 'abai.university' ? anchor.find('.cnews__title').text() : '';
    const opportunityLink =
      linkText.length >= 35 &&
      /студент|грант|конкурс|стипенд|стажиров|семинар|лекци|конференц|олимпиад|медицин|педагог|академич|scholarship|internship/i.test(
        linkText,
      );
    if (
      !container.length &&
      !anchor.find('h2,h3,h4').length &&
      !anchor.parent().is('h2,h3,h4') &&
      !abaiTitle &&
      !(opportunityLink && withinListing)
    )
      return;
    const title = (anchor.find('h2,h3,h4').first().text() || abaiTitle || anchor.text())
      .replace(/\s+/g, ' ')
      .trim();
    const url = anchor.attr('href') || '';
    if (title.length < 10 || /^(подробнее|читать|read more|more|все новости|назад)$/i.test(title))
      return;
    if (/[?&](?:preview|replytocom|share)=/i.test(url)) return;
    candidates.push({
      url,
      title,
      summary:
        container.find('p').first().text() || (abaiTitle ? '' : anchor.find('p').first().text()),
      publishedAt: container.find('time[datetime]').attr('datetime'),
      publishedAtRaw:
        container.find('time').first().text() ||
        (abaiTitle ? anchor.find('.cnews-date').text() : ''),
    });
  });
  if (!candidates.length && articlePage && pageTitle.length >= 10 && pageSummary.length >= 100) {
    candidates.push({
      url: pageUrl,
      title: pageTitle,
      summary: pageDescription || pageSummary.slice(pageTitle.length).trim(),
    });
  }
  const items: NormalizedContentItem[] = [],
    seen = new Set<string>();
  let discarded = 0,
    found = 0;
  for (const candidate of candidates.slice(0, 500)) {
    try {
      let item = normalizeContentItem({ ...candidate, language }, pageUrl, allowedHost);
      if (allowedHost === 'astanahub.com' && item.category === 'other')
        item = normalizeContentItem(
          { ...candidate, language, category: 'event' },
          pageUrl,
          allowedHost,
        );
      if (seen.has(item.canonicalUrl)) continue;
      seen.add(item.canonicalUrl);
      found++;
      if (items.length >= maxItems) {
        discarded++;
        continue;
      }
      items.push(item);
    } catch (error) {
      if (!(error instanceof ContentFeedError)) throw error;
      discarded++;
      found++;
    }
  }
  // A JS shell or redesigned layout is a visible failure, not a successful empty import.
  if (!items.length) throw new ContentFeedError('UNSUPPORTED_FEED');
  return { items, found, discarded };
}
