import { load } from 'cheerio';
import { canonicalizeContentUrl, ContentFeedError } from './content-feed';

const months: Record<string, number> = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
  қаңтар: 1,
  ақпан: 2,
  наурыз: 3,
  сәуір: 4,
  мамыр: 5,
  маусым: 6,
  шілде: 7,
  тамыз: 8,
  қыркүйек: 9,
  қазан: 10,
  қараша: 11,
  желтоқсан: 12,
};
function calendarDate(year: number, month: number, day: number) {
  if (year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date.toISOString().slice(0, 10);
}

/** A calendar date is evidence, not an invented timestamp or timezone. */
export function extractDeadlineDate(text: string) {
  // A shared-year Kazakh range needs manual review; its start is not the deadline.
  if (/мен.{0,45}аралығында/i.test(text)) return null;
  const candidates: { index: number; date: string | null }[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/g))
    candidates.push({ index: m.index!, date: calendarDate(+m[3], +m[2], +m[1]) });
  const names = Object.keys(months).join('|');
  for (const m of text
    .toLowerCase()
    .matchAll(new RegExp('(?:^|[^0-9])(\\d{1,2})\\s+(' + names + ')\\s+(20\\d{2})(?![0-9])', 'g')))
    candidates.push({ index: m.index!, date: calendarDate(+m[3], months[m[2]], +m[1]) });
  for (const m of text
    .toLowerCase()
    .matchAll(
      new RegExp(
        '(20\\d{2})\\s+(?:жылғы|жылдың)\\s+(\\d{1,2})\\s+(' + names + ')(?:ға|ге|на|не)?',
        'g',
      ),
    ))
    candidates.push({ index: m.index!, date: calendarDate(+m[1], months[m[3]], +m[2]) });
  candidates.sort((a, b) => a.index - b.index);
  if (candidates.length === 1) return candidates[0].date;
  // Only an explicit two-ended range permits choosing the second date.
  if (
    candidates.length === 2 &&
    /(?:с\s+\d|from\s+\d)/i.test(text) &&
    /[–—]|\sпо\s|\s-\s|\sto\s/i.test(text)
  )
    return candidates[1].date;
  return null;
}

/** Extract review evidence from one article. No scripts, link following, or approval. */
export function inspectOpportunityHtml(
  html: string,
  url: string,
  allowedHost: string,
  checkedAt: Date,
) {
  canonicalizeContentUrl(url, url, allowedHost);
  if (!Number.isFinite(checkedAt.getTime())) throw Error('INVALID_CHECK_DATE');
  if (Buffer.byteLength(html, 'utf8') > 1_048_576) throw new ContentFeedError('FEED_TOO_LARGE');
  const $ = load(html);
  const title = (
    $('article h1').first().text() ||
    $('main h1').first().text() ||
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text() ||
    $('title').text()
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
  $('script,style,nav,header,footer,form,aside,noscript,.related-posts,.comments-area').remove();
  const selector = [
    '.news-show',
    '.news-detail__text',
    '.entry-content',
    '.kingster-single-article-content',
    '.newsmi-vnutr',
    'article',
    'main',
  ].find((s) => $(s).length);
  if (!selector || !title) throw new ContentFeedError('UNSUPPORTED_FEED');
  const root = $(selector).first();
  const blocks = [
    ...new Set(
      root
        .find('p,li,h2,h3')
        .toArray()
        .filter((el) => !$(el).find('p,li,h2,h3').length)
        .map((el) => $(el).text().replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    ),
  ];
  if (!blocks.length) throw new ContentFeedError('UNSUPPORTED_FEED');
  // Keep an adjacent event/publication sentence from supplying a missing deadline year.
  const deadlineLines = blocks
    .flatMap((block) =>
      block.split(
        /(?<=[.!?;])\s+|[,—]\s*(?=(?:сама\s+)?(?:конференция|мероприятие|событие|conference|event)\s+(?:состоится|пройд[её]т|starts?|takes? place)|(?:при[её]м|подача|заявки|документы|дедлайн)(?:\s|:))/iu,
      ),
    )
    .filter((s) =>
      /дедлайн|deadline|последний день|срок.{0,25}(подачи|при[её]ма)|при[её]м[а]?\s+заявок|работ[аы]\s+принима|для участия.{0,140}(?:по|до)\s+\d|(?:заяв|документ|өтінім|құжат).{0,120}(?:до\s+\d|дейін)|(?:до\s+\d).{0,100}(?:заяв|документ)/i.test(
        s,
      ),
    )
    .slice(0, 4);
  const deadlines = deadlineLines.map((raw) => ({
    raw: raw.slice(0, 450),
    calendarDate: extractDeadlineDate(raw.slice(0, 450)),
    instant: null,
    timezone: null,
  }));
  const dated = [...new Set(deadlines.flatMap((d) => (d.calendarDate ? [d.calendarDate] : [])))];
  const conflictingDeadlines = dated.length > 1;
  // Leave the adjacent calendar day uncertain: the source timezone may differ from UTC.
  const yesterday = new Date(checkedAt.getTime() - 86400000).toISOString().slice(0, 10);
  const explicitlyClosed = blocks.some((s) =>
    [
      ...s.matchAll(
        /(?:при[её]м|подача).{0,30}(?:заверш[её]н|закрыт)|applications? (?:are )?(?:not )?closed/gi,
      ),
    ].some(
      (match) =>
        !/(?:не|not)\s+(?:заверш[её]н|закрыт|closed)/i.test(match[0]) &&
        !/прошл(?:ый|ого|ом) год|last year/i.test(s),
    ),
  );
  const invitation = [title, ...blocks].some((s) =>
    /принимаются|при[её]м[а]? заявок|подач[аи] (?:документов|заявок)|конкурсный отбор|объяв(?:лен|ляет|ляется).{0,20}конкурс|өтінім(?:дер)?.{0,90}қабылда|к участию.{0,35}(допуска|приглаша)/i.test(
      s,
    ),
  );
  const status = explicitlyClosed
    ? 'closed'
    : !conflictingDeadlines && dated.length === 1 && dated[0] < yesterday
      ? 'past_deadline'
      : invitation
        ? 'invitation_unverified'
        : 'unknown';
  const requirementItems: string[] = [];
  root.find('p,h2,h3').each((_, element) => {
    const heading = $(element).text().trim();
    if (
      heading.length > 180 ||
      !/требования|условия участия|к участию|если ты|eligibility|requirements|қатысу.{0,20}талап/i.test(
        heading,
      )
    )
      return;
    const next = $(element).next();
    if (next.is('ul,ol'))
      next.find('li').each((_, item) => {
        requirementItems.push($(item).text().replace(/\s+/g, ' ').trim());
      });
  });
  let remaining = 1000;
  const conditions = [
    ...new Set([
      ...requirementItems,
      ...blocks.filter((s) =>
        /к участию|требован|студент|резидент|граждан|бакалавр|магист|gpa|ielts|toefl|қатыс|талап|азамат|қызметкер|возраст|публикаци/i.test(
          s,
        ),
      ),
    ]),
  ]
    .slice(0, 6)
    .flatMap((s) => {
      if (remaining <= 0) return [];
      const value = s.slice(0, Math.min(350, remaining));
      remaining -= value.length;
      return [value];
    });
  const registrationPattern =
    /регистрац|зарегистр|подать заяв|подач[аи] заяв|заполнить|заявку|заявки|application|\bapply\b|\bregister\b|sign up|тіркел|өтінім/i;
  const registrationInstructions = blocks
    .filter((block) => registrationPattern.test(block))
    .slice(0, 4)
    .map((block) => block.slice(0, 300));
  const applicationLinks: { url: string; label: string; external: boolean }[] = [];
  root.find('a[href]').each((_, element) => {
    if (applicationLinks.length >= 4) return;
    const anchor = $(element);
    const label = anchor.text().replace(/\s+/g, ' ').trim();
    const context = anchor.closest('p,li').text();
    const href = anchor.attr('href') || '';
    if (!registrationPattern.test(`${label} ${context}`) || href.startsWith('#')) return;
    try {
      const target = new URL(href, url);
      // These are unvisited references. The network loader still enforces its own host policy.
      const link = canonicalizeContentUrl(target.href, url, target.hostname);
      if (link === url || applicationLinks.some((existing) => existing.url === link)) return;
      applicationLinks.push({
        url: link,
        label: (label || 'Ссылка из инструкции подачи').slice(0, 100),
        external: target.hostname !== allowedHost,
      });
    } catch {
      /* Unsafe/non-HTTPS references are not evidence of an application form. */
    }
  });
  return {
    url,
    title,
    checkedAt: checkedAt.toISOString(),
    deadlines,
    conflictingDeadlines,
    conditions,
    registrationInstructions,
    applicationLinks,
    status,
    reviewRequired: true,
    limitations: [
      'Calendar dates have no assumed time or timezone.',
      'Invitation is not verified eligibility or an open application guarantee.',
      'Attachments and external application forms are not fetched.',
    ],
  };
}

/** ContentAudit has a 2,000-character CHECK; keep provenance and disclose omitted evidence. */
export function formatOpportunityInspection(
  evidence: ReturnType<typeof inspectOpportunityHtml>,
  revisionNumber: number,
) {
  const labels: Record<string, string> = {
    closed: 'Приём явно закрыт',
    past_deadline: 'Обнаружен прошедший срок',
    invitation_unverified: 'Найдено приглашение; участие не подтверждено',
    unknown: 'Недостаточно сведений',
  };
  let shortened = false;
  const fragment = (value: string, length: number) => {
    if (value.length <= length) return value;
    shortened = true;
    return value.slice(0, length - 1) + '…';
  };
  const lines = [
    `Проверена редакция № ${revisionNumber}. Источник: ${fragment(evidence.url, 300)}`,
    `Проверено: ${evidence.checkedAt}. ${labels[evidence.status]}.`,
    'Даты без предполагаемого времени/зоны. Эта запись относится только к указанной редакции.',
    ...(evidence.conflictingDeadlines ? ['Найдены разные сроки: требуется ручная проверка.'] : []),
  ];
  const footer =
    'Перед публикацией перепроверьте оригинал. Фрагменты не исчерпывают требований. Формы/вложения не проверены. Полная ссылка — в исходной редакции. Текст и статус публикации не изменены.';
  const notice = 'Часть сведений сокращена; подробности в оригинале.';
  const candidates = [
    ...evidence.deadlines.map(
      (d) => `Срок: ${d.calendarDate ?? 'не определён'}. Основание: ${fragment(d.raw, 140)}`,
    ),
    ...(!evidence.deadlines.length ? ['Срок подачи не найден.'] : []),
    ...evidence.conditions.slice(0, 4).map((c) => `Условие: ${fragment(c, 130)}`),
    ...evidence.applicationLinks.map(
      (link) => `Ссылка подачи (не проверена): ${fragment(link.url, 180)}`,
    ),
    ...evidence.registrationInstructions
      .slice(0, 2)
      .map((text) => `Подача: ${fragment(text, 130)}`),
  ];
  if (evidence.conditions.length > 4 || evidence.registrationInstructions.length > 2)
    shortened = true;
  const budget = 2000 - footer.length - notice.length - 3;
  for (const candidate of candidates) {
    if (lines.join('\n').length + candidate.length + 1 <= budget) lines.push(candidate);
    else shortened = true;
  }
  return [...lines, ...(shortened ? [notice] : []), footer].join('\n');
}
