'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  FileCheck2,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { localizedCategoryLabels } from '@/lib/localized-labels';
import { EmptyState, LoadState, PageHeading, ProjectCard, useData } from './platform';
import { Opportunities } from './opportunities';
import { useI18n } from './locale-provider';

export function HomeScreen({ localMode }: { localMode: boolean }) {
  const { locale, t } = useI18n();
  const categoryLabels = localizedCategoryLabels(locale);
  const { data, error, loading, refresh } = useData('catalog');
  return (
    <div lang={locale}>
      <section className="home-hero">
        <div className="container hero-grid">
          <div>
            <h1>
              {t('Первый опыт —', 'Алғашқы тәжірибе —')}
              <br />
              {t('в реальном проекте', 'нақты жобада')}
            </h1>
            <p className="hero-description">
              {t(
                'Находи понятные задачи от бизнеса, работай в удобном формате и собирай портфолио с подтверждением заказчика.',
                'Бизнестің нақты тапсырмаларын тауып, ыңғайлы форматта жұмыс істе және тапсырыс беруші растаған жұмыстардан портфолио жина.',
              )}
            </p>
            <div className="button-row">
              <Link className="button" href="/projects">
                {t('Найти проект', 'Жоба табу')}
                <ArrowRight size={17} />
              </Link>
              <Link className="button secondary" href="/client/projects/new">
                {t('Разместить задачу', 'Тапсырма жариялау')}
              </Link>
            </div>
            <div className="hero-note">
              <span>
                <Check size={13} />
                {t('Бесплатные отклики', 'Тегін өтінімдер')}
              </span>
              <span>
                <Check size={13} />
                {t('Можно без опыта', 'Тәжірибесіз бастауға болады')}
              </span>
              <span>
                <Check size={13} />
                {t('Пилот 18+', 'Пилот 18+')}
              </span>
            </div>
          </div>
          <div className="hero-journey" aria-label={t('Как устроена работа', 'Жұмыс қалай жүреді')}>
            <div className="journey-heading">
              <span>
                {t('От задачи до записи в портфолио', 'Тапсырмадан портфолиодағы жұмысқа дейін')}
              </span>
              <FileCheck2 size={17} />
            </div>
            {[
              {
                title: t('Найди свою задачу', 'Өзіңе сай тапсырманы тап'),
                text: t(
                  'Бюджет, часы и результат видны заранее.',
                  'Бюджет, уақыт пен нәтиже алдын ала көрсетіледі.',
                ),
              },
              {
                title: t('Договорись об условиях', 'Шарттарды келіс'),
                text: t(
                  'Работа начинается после двух подтверждений.',
                  'Жұмыс екі тарап та растағаннан кейін басталады.',
                ),
              },
              {
                title: t('Сдай и получи подтверждение', 'Нәтижені тапсырып, растау ал'),
                text: t(
                  'Заказчик принимает результат. Оплата — отдельно.',
                  'Тапсырыс беруші нәтижені қабылдайды. Төлем бөлек жүргізіледі.',
                ),
              },
            ].map((item, index) => (
              <div className="journey-step" key={item.title}>
                <span className="step-number">0{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="home-section">
        <div className="container">
          <div className="section-title">
            <div>
              <p className="eyebrow">{t('С чего начнём?', 'Неден бастаймыз?')}</p>
              <h2>{t('Проекты под твои навыки', 'Дағдыларыңа сай жобалар')}</h2>
            </div>
            <Link className="text-link" href="/projects">
              {t('Все проекты →', 'Барлық жобалар →')}
            </Link>
          </div>
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
          <div className="home-categories">
            {Object.entries(categoryLabels)
              .slice(0, 6)
              .map(([id, label]) => (
                <Link className="category-chip" href={`/projects?category=${id}`} key={id}>
                  {label}
                </Link>
              ))}
          </div>
          {loading ? (
            <LoadState />
          ) : error ? (
            <LoadState error={error} retry={refresh} />
          ) : data?.projects.length ? (
            <div className="projects-grid">
              {data.projects.slice(0, 6).map((p) => (
                <ProjectCard project={p} key={p.id} />
              ))}
            </div>
          ) : (
            <EmptyState title={t('Пока нет открытых проектов', 'Әзірге ашық жобалар жоқ')}>
              {t(
                'Новые задачи появятся здесь после проверки модератором.',
                'Жаңа тапсырмалар модератор тексергеннен кейін осында пайда болады.',
              )}
            </EmptyState>
          )}
          <div className="home-trust">
            <div className="trust-item">
              <ShieldCheck size={22} />
              <div>
                <h3>{t('Понятные условия', 'Түсінікті шарттар')}</h3>
                <p>
                  {t(
                    'Модерация до публикации. Результат и критерии приёмки — до начала работы.',
                    'Жариялауға дейін модерациядан өтеді. Нәтиже мен қабылдау өлшемдері жұмыс басталғанша келісіледі.',
                  )}
                </p>
              </div>
            </div>
            <div className="trust-item">
              <FileCheck2 size={22} />
              <div>
                <h3>{t('Подтверждаемый опыт', 'Расталатын тәжірибе')}</h3>
                <p>
                  {t(
                    'Принятые проекты отделены от самостоятельно добавленных работ.',
                    'Қабылданған жобалар өзің қосқан жұмыстардан бөлек көрсетіледі.',
                  )}
                </p>
              </div>
            </div>
            <div className="trust-item">
              <Check size={22} />
              <div>
                <h3>{t('Без скрытых обещаний', 'Жасырын уәделерсіз')}</h3>
                <p>
                  {t(
                    'Расчёты проходят вне платформы. Сервис не удерживает и не гарантирует оплату.',
                    'Есеп айырысу платформадан тыс жүргізіледі. Сервис ақшаны ұстамайды және төлемге кепілдік бермейді.',
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <Opportunities />
      <section
        className="home-section faq-section"
        aria-label={t('Вопросы о платформе', 'Платформа туралы сұрақтар')}
      >
        <div className="container">
          <h2>{t('Перед первым проектом', 'Алғашқы жоба алдында')}</h2>
          <details>
            <summary>
              {t('Можно откликаться без опыта?', 'Тәжірибесіз өтінім беруге бола ма?')}
            </summary>
            <p>
              {t(
                'Да. Добавьте свои навыки и объясните, как подойдёте к задаче. Для первого отклика не нужны отзывы или завершённые проекты.',
                'Иә. Дағдыларыңызды қосып, тапсырманы қалай орындайтыныңызды түсіндіріңіз. Алғашқы өтінімге пікірлер немесе аяқталған жобалар қажет емес.',
              )}
            </p>
          </details>
          <details>
            <summary>{t('Как проходит оплата?', 'Төлем қалай жүргізіледі?')}</summary>
            <p>
              {t(
                'Студент и заказчик рассчитываются вне платформы. Qosyl фиксирует заявления сторон, не хранит деньги и не гарантирует выплату.',
                'Студент пен тапсырыс беруші платформадан тыс есеп айырысады. Qosyl тараптардың мәлімдемелерін тіркейді, ақшаны сақтамайды және төлемге кепілдік бермейді.',
              )}
            </p>
          </details>
          <details>
            <summary>{t('Что попадёт в портфолио?', 'Портфолиоға не кіреді?')}</summary>
            <p>
              {t(
                'Принятую работу можно показать с согласия обеих сторон. Самостоятельно добавленные учебные работы обозначаются отдельно.',
                'Қабылданған жұмысты екі тараптың келісімімен көрсетуге болады. Өз бетінше қосылған оқу жұмыстары бөлек белгіленеді.',
              )}
            </p>
          </details>
          <Link className="text-link" href="/help">
            {t('Подробнее о работе платформы', 'Платформа жұмысы туралы толығырақ')}
          </Link>
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
