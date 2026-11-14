'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, SlidersHorizontal } from 'lucide-react';
import { localizedCategoryLabels } from '@/lib/localized-labels';
import { EmptyState, LoadState, PageHeading, ProjectCard, useData } from './platform';
import { Opportunities } from './opportunities';
import { useI18n } from './locale-provider';

export function HomeScreen({ localMode }: { localMode: boolean }) {
  const { locale, t } = useI18n();
  const categories = [
    ['internship', t('Стажировки', 'Тағылымдамалар')],
    ['grant', t('Гранты', 'Гранттар')],
    ['scholarship', t('Стипендии', 'Шәкіртақылар')],
    ['competition', t('Конкурсы', 'Байқаулар')],
    ['event', t('Мероприятия', 'Іс-шаралар')],
  ];
  return (
    <div lang={locale}>
      <section className="home-hero discovery-hero">
        <div className="container stack">
          <h1>
            {t(
              'Возможности для учёбы и первого опыта',
              'Оқуға және алғашқы тәжірибе жинауға арналған мүмкіндіктер',
            )}
          </h1>
          <form className="discovery-search" role="search" action="/opportunities" method="get">
            <label htmlFor="home-search">{t('Поиск возможностей', 'Мүмкіндіктерді іздеу')}</label>
            <div className="button-row">
              <input
                id="home-search"
                type="search"
                name="q"
                maxLength={100}
                placeholder={t(
                  'Например, разработка или дизайн',
                  'Мысалы, бағдарламалау немесе дизайн',
                )}
              />
              <button className="button" type="submit">
                <Search size={17} aria-hidden="true" />
                {t('Найти', 'Іздеу')}
              </button>
            </div>
          </form>
          <nav className="home-categories" aria-label={t('Тип возможности', 'Мүмкіндік түрі')}>
            {categories.map(([id, label]) => (
              <Link key={id} className="category-chip" href={`/opportunities?category=${id}`}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </section>
      <Opportunities />
      <section className="home-section">
        <div className="container stack">
          <h2>{t('Готовитесь к поступлению?', 'Оқуға түсуге дайындалып жүрсіз бе?')}</h2>
          <p className="muted">
            {t(
              'Разберитесь в требованиях, подготовьте документы и опишите свой опыт.',
              'Талаптарды анықтап, құжаттарыңызды дайындаңыз және тәжірибеңізді сипаттаңыз.',
            )}
          </p>
          <Link className="text-link" href="/admissions">
            {t('Гид по поступлению →', 'Оқуға түсу нұсқаулығы →')}
          </Link>
        </div>
      </section>
      <section className="home-section">
        <div className="container stack">
          <h2>{t('Проекты от заказчиков', 'Тапсырыс берушілердің жобалары')}</h2>
          <p className="muted">
            {t(
              'Пилот 18+. Выберите задачу или предложите свою. Расчёты проходят вне платформы: Qosyl не удерживает и не гарантирует оплату.',
              'Пилот 18+. Тапсырманы таңдаңыз немесе өз тапсырмаңызды ұсыныңыз. Есеп айырысу платформадан тыс жүргізіледі: Qosyl ақшаны ұстамайды және төлемге кепілдік бермейді.',
            )}
          </p>
          <p className="muted small-text">
            {localMode
              ? t(
                  'В локальном пилоте показаны учебные примеры с меткой «ДЕМО». Это не реальные предложения работы.',
                  'Жергілікті пилотта «ДЕМО» белгісі бар оқу мысалдары көрсетілген. Олар нақты жұмыс ұсыныстары емес.',
                )
              : t(
                  'Учебные примеры отмечены меткой «ДЕМО» и отделены от реальных заказов.',
                  'Оқу мысалдары «ДЕМО» белгісімен көрсетіліп, нақты тапсырыстардан бөлінген.',
                )}
          </p>
          <div className="button-row">
            <Link className="button secondary" href="/projects">
              {t('Найти проект', 'Жоба табу')}
            </Link>
            <Link className="text-link" href="/client/projects/new">
              {t('Разместить задачу', 'Тапсырма жариялау')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
export function CatalogScreen() {
  const { locale, t } = useI18n();
  const categoryLabels = localizedCategoryLabels(locale);
  const params = useSearchParams();
  const router = useRouter();
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const query = params.toString();
  useEffect(() => {
    if (!searchTimer.current) setSearch(new URLSearchParams(query).get('q') ?? '');
  }, [query]);
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );
  const { data, error, loading, refresh } = useData('catalog', new URLSearchParams(query));
  function searchProjects(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      const next = new URLSearchParams(query);
      if (value.trim()) next.set('q', value.trim());
      else next.delete('q');
      next.delete('page');
      router.replace(`/projects${next.size ? `?${next}` : ''}`, { scroll: false });
    }, 300);
  }
  function update(form: FormData, preserve = false) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = null;
    const next = preserve ? new URLSearchParams(query) : new URLSearchParams();
    if (search.trim()) next.set('q', search.trim());
    else next.delete('q');
    for (const [key, value] of form.entries()) {
      if (String(value).trim()) next.set(key, String(value).trim());
      else next.delete(key);
    }
    next.delete('page');
    router.push(`/projects?${next}`);
    setShowFilters(false);
  }
  return (
    <div className="page-shell" lang={locale}>
      <PageHeading
        eyebrow={t('Каталог проектов', 'Жобалар каталогы')}
        title={t('Найди задачу, с которой начнёшь', 'Алғашқы тапсырмаңды тап')}
      >
        {t(
          'Выбирай по навыкам и времени. У каждого заказа есть бюджет, результат и понятная приёмка.',
          'Дағдың мен уақытыңа қарай таңда. Әр тапсырыста бюджет, нәтиже және түсінікті қабылдау шарттары бар.',
        )}
      </PageHeading>
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (searchTimer.current) clearTimeout(searchTimer.current);
          update(new FormData(e.currentTarget), true);
        }}
      >
        <Search size={19} />
        <input
          aria-label={t('Поиск проектов', 'Жобаларды іздеу')}
          placeholder={t('Название, задача или навык', 'Атауы, тапсырма немесе дағды')}
          name="q"
          maxLength={100}
          value={search}
          onChange={(event) => searchProjects(event.target.value)}
        />
        <button className="button" type="submit">
          {t('Найти', 'Іздеу')}
        </button>
      </form>
      <div className="catalog-layout">
        <button
          className="button secondary mobile-filter-toggle"
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal size={16} />
          {t('Фильтры', 'Сүзгілер')}
          {showFilters ? t(' · скрыть', ' · жасыру') : ''}
        </button>
        <aside className={`filter-panel ${showFilters ? 'is-open' : ''}`}>
          <h2>{t('Подобрать проект', 'Жоба таңдау')}</h2>
          <form
            key={[
              'category',
              'skill',
              'mode',
              'city',
              'minBudget',
              'maxBudget',
              'difficulty',
              'maxHours',
              'dueBefore',
            ]
              .map((key) => `${key}=${params.get(key) ?? ''}`)
              .join('&')}
            onSubmit={(e) => {
              e.preventDefault();
              update(new FormData(e.currentTarget));
            }}
          >
            <label className="field">
              {t('Категория', 'Санат')}
              <select name="category" defaultValue={params.get('category') ?? ''}>
                <option value="">{t('Все категории', 'Барлық санаттар')}</option>
                {Object.entries(categoryLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('Навык', 'Дағды')}
              <input
                name="skill"
                placeholder={t('Например, Excel', 'Мысалы, Excel')}
                defaultValue={params.get('skill') ?? ''}
              />
            </label>
            <label className="field">
              {t('Формат', 'Формат')}
              <select name="mode" defaultValue={params.get('mode') ?? ''}>
                <option value="">{t('Любой формат', 'Кез келген формат')}</option>
                <option value="remote">{t('Удалённо', 'Қашықтан')}</option>
                <option value="onsite">{t('Очно', 'Офлайн')}</option>
                <option value="hybrid">{t('Гибридно', 'Аралас')}</option>
              </select>
            </label>
            <label className="field">
              {t('Город', 'Қала')}
              <input
                name="city"
                placeholder={t('Любой город', 'Кез келген қала')}
                defaultValue={params.get('city') ?? ''}
              />
            </label>
            <div className="field">
              <span>{t('Бюджет, ₸', 'Бюджет, ₸')}</span>
              <div className="filter-range">
                <input
                  type="number"
                  min="1"
                  name="minBudget"
                  aria-label={t('Минимальный бюджет', 'Ең аз бюджет')}
                  placeholder={t('От', 'Бастап')}
                  defaultValue={params.get('minBudget') ?? ''}
                />
                <input
                  type="number"
                  min="1"
                  name="maxBudget"
                  aria-label={t('Максимальный бюджет', 'Ең көп бюджет')}
                  placeholder={t('До', 'Дейін')}
                  defaultValue={params.get('maxBudget') ?? ''}
                />
              </div>
            </div>
            <label className="field">
              {t('Уровень', 'Деңгей')}
              <select name="difficulty" defaultValue={params.get('difficulty') ?? ''}>
                <option value="">{t('Любой опыт', 'Кез келген тәжірибе')}</option>
                <option value="beginner_friendly">
                  {t('Можно без опыта', 'Тәжірибесіз бастауға болады')}
                </option>
                <option value="intermediate">
                  {t('Есть базовый опыт', 'Негізгі тәжірибесі бар')}
                </option>
              </select>
            </label>
            <label className="field">
              {t('Не больше часов', 'Ең көп сағат саны')}
              <input
                type="number"
                min="1"
                max="500"
                name="maxHours"
                placeholder={t('Например, 5', 'Мысалы, 5')}
                defaultValue={params.get('maxHours') ?? ''}
              />
            </label>
            <label className="field">
              {t('Дедлайн до', 'Аяқтау мерзімі')}
              <input type="date" name="dueBefore" defaultValue={params.get('dueBefore') ?? ''} />
            </label>
            <div className="button-row">
              <button className="button full" type="submit">
                {t('Применить фильтры', 'Сүзгілерді қолдану')}
              </button>
              <Link className="text-link small-text" href="/projects">
                {t('Сбросить всё', 'Барлығын тазарту')}
              </Link>
            </div>
          </form>
        </aside>
        <section aria-label={t('Результаты поиска', 'Іздеу нәтижелері')}>
          <div className="catalog-toolbar">
            <span className="catalog-count">
              {loading
                ? t('Ищем проекты…', 'Жобаларды іздеп жатырмыз…')
                : t(
                    `${data?.total ?? 0} проектов по вашим условиям`,
                    `Шарттарыңызға сай жобалар: ${data?.total ?? 0}`,
                  )}
            </span>
            <select
              aria-label={t('Сортировка', 'Сұрыптау')}
              value={params.get('sort') ?? 'newest'}
              onChange={(e) => {
                const form = new FormData();
                form.set('sort', e.target.value);
                update(form, true);
              }}
            >
              <option value="newest">{t('Сначала новые', 'Алдымен жаңалары')}</option>
              <option value="relevance">
                {t('По совпадению навыков', 'Дағдылардың сәйкестігі бойынша')}
              </option>
            </select>
          </div>
          {params.get('sort') === 'relevance' && (
            <p className="muted small-text">
              {t(
                'Релевантность: совпадение с выбранным навыком или навыками вашего профиля. Опыт и число отзывов не влияют.',
                'Сәйкестік таңдалған дағдыға немесе профиліңіздегі дағдыларға қарай анықталады. Тәжірибе мен пікірлер саны әсер етпейді.',
              )}
            </p>
          )}
          {loading ? (
            <LoadState />
          ) : error ? (
            <LoadState error={error} retry={refresh} />
          ) : data?.projects.length ? (
            <div className="projects-grid">
              {data.projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <EmptyState
              title={t('Подходящих проектов пока нет', 'Әзірге сәйкес жобалар жоқ')}
              href="/projects"
              action={t('Сбросить фильтры', 'Сүзгілерді тазарту')}
            >
              {t(
                'Попробуйте другой навык, формат или более широкий бюджет.',
                'Басқа дағдыны, форматты немесе кеңірек бюджет ауқымын қолданып көріңіз.',
              )}
            </EmptyState>
          )}
          {data && data.total > 30 && (
            <nav
              className="button-row pagination"
              aria-label={t('Страницы каталога', 'Каталог беттері')}
            >
              {(data.page ?? 1) > 1 && (
                <Link
                  className="button secondary small"
                  href={`/projects?${new URLSearchParams({ ...Object.fromEntries(params), page: String((data.page ?? 1) - 1) })}`}
                >
                  {t('← Предыдущая', '← Алдыңғы')}
                </Link>
              )}
              <span className="muted small-text">
                {t(
                  `Страница ${data.page ?? 1} из ${Math.ceil(data.total / 30)}`,
                  `${data.page ?? 1}-бет, барлығы ${Math.ceil(data.total / 30)}`,
                )}
              </span>
              {(data.page ?? 1) * 30 < data.total && (
                <Link
                  className="button secondary small"
                  href={`/projects?${new URLSearchParams({ ...Object.fromEntries(params), page: String((data.page ?? 1) + 1) })}`}
                >
                  {t('Следующая →', 'Келесі →')}
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
