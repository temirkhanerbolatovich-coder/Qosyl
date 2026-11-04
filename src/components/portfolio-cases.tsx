'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useI18n } from './locale-provider';
import {
  caseFields,
  caseListResponse,
  caseLink,
  type CaseFields,
  type PortfolioCase,
} from '@/lib/portfolio-case';

export function PortfolioCaseCard({
  item,
}: {
  item: Pick<
    PortfolioCase,
    | 'title'
    | 'description'
    | 'role'
    | 'problem'
    | 'contribution'
    | 'period'
    | 'tools'
    | 'result'
    | 'links'
    | 'url'
  >;
}) {
  const { t } = useI18n();
  return (
    <article className="panel stack" style={{ overflowWrap: 'anywhere' }}>
      <span className="badge">
        {t('Добавлено пользователем · self_reported', 'Пайдаланушы қосқан · self_reported')}
      </span>
      <h3 lang="und">{item.title}</h3>
      {item.role && <p lang="und">{item.role}</p>}
      {item.period && <p lang="und">{item.period}</p>}
      {[
        [t('Описание', 'Сипаттама'), item.description],
        [t('Проблема', 'Мәселе'), item.problem],
        [t('Мой вклад', 'Менің үлесім'), item.contribution],
        [t('Результат', 'Нәтиже'), item.result],
      ].map(
        ([label, value]) =>
          value && (
            <div key={label}>
              <strong>{label}</strong>
              <p lang="und" style={{ whiteSpace: 'pre-wrap' }}>
                {value}
              </p>
            </div>
          ),
      )}
      <div className="inline-actions">
        {item.tools.map((tool, index) => (
          <span className="badge" key={index} lang="und">
            {tool}
          </span>
        ))}
      </div>
      {[...new Set([item.url, ...item.links])]
        .filter((url) => caseLink.safeParse(url).success)
        .map((url, index) => (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer nofollow">
            {t('Посмотреть работу', 'Жұмысты көру')} {index + 1}
          </a>
        ))}
    </article>
  );
}
const emptyCase: CaseFields = {
  title: '',
  description: '',
  role: '',
  problem: '',
  contribution: '',
  period: '',
  tools: [],
  result: '',
  url: '',
  links: [],
  visibility: 'draft',
  publicationAllowed: false,
};

export function PortfolioEditor({
  userId,
  confirmed = [],
}: {
  userId: string;
  confirmed?: { id: string; projectId: string; title: string; published: boolean; demo: boolean }[];
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<PortfolioCase[]>([]);
  const [editing, setEditing] = useState<PortfolioCase | null>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/profile/portfolio', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return caseListResponse.parse(await response.json());
      })
      .then((result) => {
        if (!controller.signal.aborted) setItems(result.data.items);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(503);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  async function send(command: unknown) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/profile/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        setError(response.status);
        return;
      }
      const result = caseListResponse.parse(await response.json());
      setItems(result.data.items);
      setSaved(true);
      if ((command as { action: string }).action !== 'reorder') {
        setOpen(false);
        setEditing(null);
      }
    } catch {
      setError(503);
    } finally {
      setBusy(false);
    }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    const data = caseFields.safeParse({
      ...Object.fromEntries(
        [
          'title',
          'description',
          'role',
          'problem',
          'contribution',
          'period',
          'result',
          'url',
          'visibility',
        ].map((key) => [key, value(key)]),
      ),
      tools: value('tools')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      links: value('links')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      publicationAllowed: form.get('publicationAllowed') === 'on',
    });
    if (!data.success) {
      setError(400);
      return;
    }
    void send(
      editing
        ? { action: 'update', id: editing.id, revision: editing.revision, data: data.data }
        : { action: 'create', data: data.data },
    );
  }
  function move(index: number, offset: number) {
    const order = [...items];
    [order[index], order[index + offset]] = [order[index + offset], order[index]];
    void send({ action: 'reorder', items: order.map(({ id, revision }) => ({ id, revision })) });
  }
  const initial = editing ?? emptyCase;
  return (
    <section className="stack" aria-labelledby="portfolio-heading">
      <h2 id="portfolio-heading">{t('Портфолио', 'Портфолио')}</h2>
      <p className="muted">
        {t(
          'Самостоятельные кейсы не подтверждают выполнение заказа на Qosyl. Публичные кейсы видны только при публичном профиле. Изменения сохраняются отдельно от профиля.',
          'Жеке кейстер Qosyl тапсырысының орындалуын растамайды. Жария кейстер тек ашық профильде көрінеді. Өзгерістер профильден бөлек сақталады.',
        )}
      </p>
      <div className="inline-actions">
        <button
          type="button"
          className="button"
          disabled={busy || loading || open || items.length >= 30}
          onClick={() => {
            setEditing(null);
            setOpen(true);
            setSaved(false);
            setError(null);
          }}
        >
          {t('Добавить кейс', 'Кейс қосу')}
        </button>
        <button type="button" className="button secondary" onClick={() => setPreview(!preview)}>
          {preview
            ? t('Закрыть предпросмотр', 'Алдын ала қарауды жабу')
            : t('Предпросмотр опубликованных кейсов', 'Жария кейстерді алдын ала қарау')}
        </button>
        <a
          className="button secondary"
          href={`/talent/${userId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('Открыть публичный профиль', 'Ашық профильді ашу')}
        </a>
      </div>
      {loading && <p role="status">{t('Загружаем кейсы…', 'Кейстер жүктелуде…')}</p>}
      {saved && <p role="status">{t('Портфолио сохранено.', 'Портфолио сақталды.')}</p>}
      {error && (
        <div className="alert error" role="alert">
          {error === 400
            ? t(
                'Проверьте поля, HTTPS-ссылки и разрешение публикации.',
                'Өрістерді, HTTPS сілтемелерін және жариялау рұқсатын тексеріңіз.',
              )
            : error === 409
              ? t(
                  'Кейс или порядок изменился. Обновите список; введённый текст сохранён в форме.',
                  'Кейс немесе рет өзгерді. Тізімді жаңартыңыз; енгізілген мәтін формада сақталды.',
                )
              : error === 429
                ? t(
                    'Слишком много действий. Подождите минуту.',
                    'Әрекет тым көп. Бір минут күтіңіз.',
                  )
                : t(
                    'Не удалось сохранить или загрузить портфолио. Проверьте соединение и доступ.',
                    'Портфолионы сақтау немесе жүктеу мүмкін болмады. Байланыс пен қолжетімділікті тексеріңіз.',
                  )}
          <button
            type="button"
            className="button secondary"
            disabled={busy || loading}
            onClick={() => {
              setLoading(true);
              setError(null);
              setRetry((v) => v + 1);
            }}
          >
            {t('Обновить список', 'Тізімді жаңарту')}
          </button>
        </div>
      )}
      {open && (
        <form
          key={editing?.id ?? 'new'}
          className="panel stack"
          onSubmit={save}
          aria-label={t('Редактор кейса', 'Кейс редакторы')}
        >
          <fieldset disabled={busy} className="stack">
            <legend>
              {editing ? t('Редактировать кейс', 'Кейсті өңдеу') : t('Новый кейс', 'Жаңа кейс')}
            </legend>
            {(
              [
                ['title', 'Название кейса', 'Кейс атауы', 150],
                ['role', 'Ваша роль в кейсе', 'Кейстегі рөліңіз', 150],
                ['period', 'Год или период', 'Жыл немесе кезең', 100],
                ['description', 'Описание кейса', 'Кейс сипаттамасы', 1000],
                ['problem', 'Проблема', 'Мәселе', 1500],
                ['contribution', 'Мой вклад', 'Менің үлесім', 1500],
                ['result', 'Результат', 'Нәтиже', 1500],
                ['url', 'Основная HTTPS-ссылка', 'Негізгі HTTPS сілтеме', 2000],
              ] as const
            ).map(([key, ru, kk, max]) => (
              <label className="field" key={key}>
                {t(ru, kk)}
                {max > 150 && key !== 'url' ? (
                  <textarea
                    className="input"
                    name={key}
                    defaultValue={initial[key]}
                    maxLength={max}
                    rows={3}
                  />
                ) : (
                  <input
                    className="input"
                    name={key}
                    defaultValue={initial[key]}
                    maxLength={max}
                    required={key === 'title'}
                    minLength={key === 'title' ? 2 : undefined}
                  />
                )}
              </label>
            ))}
            <label className="field">
              {t('Инструменты через запятую', 'Құралдар үтірмен')}
              <input
                className="input"
                name="tools"
                defaultValue={initial.tools.join(', ')}
                maxLength={920}
              />
            </label>
            <label className="field">
              {t(
                'Дополнительные HTTPS-ссылки, по одной на строку',
                'Қосымша HTTPS сілтемелер, әр жолға біреу',
              )}
              <textarea
                className="input"
                name="links"
                defaultValue={initial.links.join('\n')}
                maxLength={10004}
              />
            </label>
            <label className="field">
              {t('Видимость кейса', 'Кейстің көрінуі')}
              <select className="input" name="visibility" defaultValue={initial.visibility}>
                <option value="draft">{t('Черновик', 'Жоба')}</option>
                <option value="private">{t('Приватный', 'Жеке')}</option>
                <option value="public">{t('Публичный', 'Жария')}</option>
              </select>
            </label>
            <label className="check-row">
              <input
                name="publicationAllowed"
                type="checkbox"
                defaultChecked={initial.publicationAllowed}
              />
              {t(
                'У меня есть разрешение на публикацию описания и материалов; закрытые сведения удалены или обезличены.',
                'Сипаттама мен материалдарды жариялауға рұқсатым бар; жабық деректер жойылды немесе иесіздендірілді.',
              )}
            </label>
            <div className="inline-actions">
              <button className="button" type="submit">
                {busy ? t('Сохраняем…', 'Сақталуда…') : t('Сохранить кейс', 'Кейсті сақтау')}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setOpen(false);
                  setEditing(null);
                  setError(null);
                }}
              >
                {t('Отмена', 'Бас тарту')}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {preview ? (
        <div className="stack" aria-label={t('Предпросмотр кейсов', 'Кейстерді алдын ала қарау')}>
          <p>
            {t(
              'Показаны сохранённые публичные кейсы. Приватный профиль скрывает их от посетителей.',
              'Сақталған жария кейстер көрсетілген. Жеке профиль оларды келушілерден жасырады.',
            )}
          </p>
          {items
            .filter((item) => item.visibility === 'public' && item.publicationAllowed)
            .map((item) => (
              <PortfolioCaseCard key={item.id} item={item} />
            ))}
        </div>
      ) : (
        <div className="stack">
          {!loading && !items.length && (
            <p>
              {t(
                'Кейсов пока нет. Учебный или личный проект подойдёт.',
                'Кейстер әлі жоқ. Оқу немесе жеке жоба жарайды.',
              )}
            </p>
          )}
          {items.map((item, index) => (
            <article
              key={item.id}
              className="panel stack"
              aria-label={item.title}
              style={{ overflowWrap: 'anywhere' }}
            >
              <h3 lang="und">{item.title}</h3>
              <p>
                {t('Добавлено пользователем', 'Пайдаланушы қосқан')} ·{' '}
                {item.visibility === 'public'
                  ? t('Публичный', 'Жария')
                  : item.visibility === 'private'
                    ? t('Приватный', 'Жеке')
                    : t('Черновик', 'Жоба')}
              </p>
              <div className="inline-actions">
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy || open}
                  onClick={() => {
                    setEditing(item);
                    setOpen(true);
                    setSaved(false);
                    setError(null);
                  }}
                >
                  {t('Редактировать', 'Өңдеу')}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy || open || index === 0}
                  onClick={() => move(index, -1)}
                >
                  {t('Выше', 'Жоғары')}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy || open || index === items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  {t('Ниже', 'Төмен')}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy || open}
                  onClick={() => {
                    if (
                      window.confirm(
                        t('Удалить этот самостоятельный кейс?', 'Осы жеке кейсті жою керек пе?'),
                      )
                    )
                      void send({ action: 'delete', id: item.id, revision: item.revision });
                  }}
                >
                  {t('Удалить кейс', 'Кейсті жою')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <h3>{t('Выполнено на Qosyl', 'Qosyl платформасында орындалған')}</h3>
      {!confirmed.length && (
        <p>
          {t(
            'Подтверждённых проектов пока нет. Это не мешает откликаться.',
            'Расталған жобалар әлі жоқ. Бұл өтінім беруге кедергі емес.',
          )}
        </p>
      )}
      {confirmed.map((record) => (
        <article key={record.id} className="panel stack">
          <span className="badge">platform_verified</span>
          {record.demo && <span className="badge">{t('ДЕМО', 'ДЕМО')}</span>}
          <h4 lang="und">{record.title}</h4>
          <p>
            {record.published
              ? t(
                  'Публикация согласована обеими сторонами; требуется публичный профиль.',
                  'Жариялауға екі тарап келіскен; ашық профиль қажет.',
                )
              : t(
                  'Не опубликован: проверьте видимость и согласия в проекте.',
                  'Жарияланбаған: жобаның көрінуі мен келісімдерін тексеріңіз.',
                )}
          </p>
          <a className="button secondary" href={`/work/${record.projectId}`}>
            {t('Открыть проект и согласия', 'Жоба мен келісімдерді ашу')}
          </a>
        </article>
      ))}
      <p>
        {t(
          'Проекты Qosyl и согласия редактируются в рабочей области соответствующего проекта. Их статус, отзывы и условия здесь не меняются.',
          'Qosyl жобалары мен келісімдер тиісті жобаның жұмыс аймағында өңделеді. Олардың мәртебесі, пікірлері мен шарттары мұнда өзгермейді.',
        )}
      </p>
    </section>
  );
}
