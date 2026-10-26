'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  FileCheck2,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { categoryLabels } from '@/lib/labels';
import { EmptyState, LoadState, PageHeading, ProjectCard, useData } from './platform';
import { Opportunities } from './opportunities';

export function HomeScreen({ localMode }: { localMode: boolean }) {
  const { data, error, loading, refresh } = useData('catalog');
  return (
    <>
      <section className="home-hero">
        <div className="container hero-grid">
          <div>
            <h1>
              Первый опыт —<br />в реальном проекте
            </h1>
            <p className="hero-description">
              Находи понятные задачи от бизнеса, работай в удобном формате и собирай портфолио с
              подтверждением заказчика.
            </p>
            <div className="button-row">
              <Link className="button" href="/projects">
                Найти проект
                <ArrowRight size={17} />
              </Link>
              <Link className="button secondary" href="/client/projects/new">
                Разместить задачу
              </Link>
            </div>
            <div className="hero-note">
              <span>
                <Check size={13} />
                Бесплатные отклики
              </span>
              <span>
                <Check size={13} />
                Можно без опыта
              </span>
              <span>
                <Check size={13} />
                Пилот 18+
              </span>
            </div>
          </div>
          <div className="hero-journey">
            <div className="journey-heading">
              <span>От задачи до записи в портфолио</span>
              <FileCheck2 size={17} />
            </div>
            {[
              { title: 'Найди свою задачу', text: 'Бюджет, часы и результат видны заранее.' },
              {
                title: 'Договорись об условиях',
                text: 'Работа начинается после двух подтверждений.',
              },
              {
                title: 'Сдай и получи подтверждение',
                text: 'Заказчик принимает результат. Оплата — отдельно.',
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
              <p className="eyebrow">С чего начнём?</p>
              <h2>Проекты под твои навыки</h2>
            </div>
            <Link className="text-link" href="/projects">
              Все проекты →
            </Link>
          </div>
          <p className="muted small-text">
            {localMode
              ? 'В локальном пилоте показаны учебные примеры с меткой «ДЕМО». Это не реальные предложения работы.'
              : 'Учебные примеры отмечены меткой «ДЕМО» и отделены от реальных заказов.'}
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
            <EmptyState title="Пока нет открытых проектов">
              Новые задачи появятся здесь после проверки модератором.
            </EmptyState>
          )}
          <div className="home-trust">
            <div className="trust-item">
              <ShieldCheck size={22} />
              <div>
                <h3>Понятные условия</h3>
                <p>Модерация до публикации. Результат и критерии приёмки — до начала работы.</p>
              </div>
            </div>
            <div className="trust-item">
              <FileCheck2 size={22} />
              <div>
                <h3>Подтверждаемый опыт</h3>
                <p>Принятые проекты отделены от самостоятельно добавленных работ.</p>
              </div>
            </div>
            <div className="trust-item">
              <Check size={22} />
              <div>
                <h3>Без скрытых обещаний</h3>
                <p>Расчёты проходят вне платформы. Сервис не удерживает и не гарантирует оплату.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <Opportunities />
      <section className="home-section faq-section" aria-label="Вопросы о платформе">
        <div className="container">
          <h2>Перед первым проектом</h2>
          <details>
            <summary>Можно откликаться без опыта?</summary>
            <p>
              Да. Добавьте свои навыки и объясните, как подойдёте к задаче. Для первого отклика не
              нужны отзывы или завершённые проекты.
            </p>
          </details>
          <details>
            <summary>Как проходит оплата?</summary>
            <p>
              Студент и заказчик рассчитываются вне платформы. Qosyl фиксирует заявления сторон, не
              хранит деньги и не гарантирует выплату.
            </p>
          </details>
          <details>
            <summary>Что попадёт в портфолио?</summary>
            <p>
              Принятую работу можно показать с согласия обеих сторон. Самостоятельно добавленные
              учебные работы обозначаются отдельно.
            </p>
          </details>
          <Link className="text-link" href="/help">
            Подробнее о работе платформы
          </Link>
        </div>
      </section>
    </>
  );
}
export function CatalogScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const [showFilters, setShowFilters] = useState(false);
  const query = params.toString();
  const { data, error, loading, refresh } = useData('catalog', new URLSearchParams(query));
  function update(form: FormData, preserve = false) {
    const next = preserve ? new URLSearchParams(query) : new URLSearchParams();
    if (!preserve && params.get('q')) next.set('q', params.get('q')!);
    for (const [key, value] of form.entries()) {
      if (String(value).trim()) next.set(key, String(value).trim());
      else next.delete(key);
    }
    next.delete('page');
    router.push(`/projects?${next}`);
    setShowFilters(false);
  }
  return (
    <div className="page-shell">
      <PageHeading eyebrow="Каталог проектов" title="Найди задачу, с которой начнёшь">
        Выбирай по навыкам и времени. У каждого заказа есть бюджет, результат и понятная приёмка.
      </PageHeading>
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          update(new FormData(e.currentTarget), true);
        }}
      >
        <Search size={19} />
        <input
          aria-label="Поиск проектов"
          placeholder="Название, задача или навык"
          name="q"
          defaultValue={params.get('q') ?? ''}
        />
        <button className="button" type="submit">
          Найти
        </button>
      </form>
      <div className="catalog-layout">
        <button
          className="button secondary mobile-filter-toggle"
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal size={16} />
          Фильтры{showFilters ? ' · скрыть' : ''}
        </button>
        <aside className={`filter-panel ${showFilters ? 'is-open' : ''}`}>
          <h2>Подобрать проект</h2>
          <form
            key={query}
            onSubmit={(e) => {
              e.preventDefault();
              update(new FormData(e.currentTarget));
            }}
          >
            <label className="field">
              Категория
              <select name="category" defaultValue={params.get('category') ?? ''}>
                <option value="">Все категории</option>
                {Object.entries(categoryLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Навык
              <input
                name="skill"
                placeholder="Например, Excel"
                defaultValue={params.get('skill') ?? ''}
              />
            </label>
            <label className="field">
              Формат
              <select name="mode" defaultValue={params.get('mode') ?? ''}>
                <option value="">Любой формат</option>
                <option value="remote">Удалённо</option>
                <option value="onsite">Очно</option>
                <option value="hybrid">Гибридно</option>
              </select>
            </label>
            <label className="field">
              Город
              <input
                name="city"
                placeholder="Любой город"
                defaultValue={params.get('city') ?? ''}
              />
            </label>
            <div className="field">
              <span>Бюджет, ₸</span>
              <div className="filter-range">
                <input
                  type="number"
                  min="1"
                  name="minBudget"
                  aria-label="Минимальный бюджет"
                  placeholder="От"
                  defaultValue={params.get('minBudget') ?? ''}
                />
                <input
                  type="number"
                  min="1"
                  name="maxBudget"
                  aria-label="Максимальный бюджет"
                  placeholder="До"
                  defaultValue={params.get('maxBudget') ?? ''}
                />
              </div>
            </div>
            <label className="field">
              Уровень
              <select name="difficulty" defaultValue={params.get('difficulty') ?? ''}>
                <option value="">Любой опыт</option>
                <option value="beginner_friendly">Можно без опыта</option>
                <option value="intermediate">Есть базовый опыт</option>
              </select>
            </label>
            <label className="field">
              Не больше часов
              <input
                type="number"
                min="1"
                max="500"
                name="maxHours"
                placeholder="Например, 5"
                defaultValue={params.get('maxHours') ?? ''}
              />
            </label>
            <label className="field">
              Дедлайн до
              <input type="date" name="dueBefore" defaultValue={params.get('dueBefore') ?? ''} />
            </label>
            <div className="button-row">
              <button className="button full" type="submit">
                Применить фильтры
              </button>
              <Link className="text-link small-text" href="/projects">
                Сбросить всё
              </Link>
            </div>
          </form>
        </aside>
        <section aria-label="Результаты поиска">
          <div className="catalog-toolbar">
            <span className="catalog-count">
              {loading ? 'Ищем проекты…' : `${data?.total ?? 0} проектов по вашим условиям`}
            </span>
            <select
              aria-label="Сортировка"
              value={params.get('sort') ?? 'newest'}
              onChange={(e) => {
                const form = new FormData();
                form.set('sort', e.target.value);
                update(form, true);
              }}
            >
              <option value="newest">Сначала новые</option>
              <option value="relevance">По совпадению навыков</option>
            </select>
          </div>
          {params.get('sort') === 'relevance' && (
            <p className="muted small-text">
              Релевантность: совпадение с выбранным навыком или навыками вашего профиля. Опыт и
              число отзывов не влияют.
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
              title="Подходящих проектов пока нет"
              href="/projects"
              action="Сбросить фильтры"
            >
              Попробуйте другой навык, формат или более широкий бюджет.
            </EmptyState>
          )}
          {data && data.total > 30 && (
            <nav className="button-row pagination" aria-label="Страницы каталога">
              {(data.page ?? 1) > 1 && (
                <Link
                  className="button secondary small"
                  href={`/projects?${new URLSearchParams({ ...Object.fromEntries(params), page: String((data.page ?? 1) - 1) })}`}
                >
                  ← Предыдущая
                </Link>
              )}
              <span className="muted small-text">
                Страница {data.page ?? 1} из {Math.ceil(data.total / 30)}
              </span>
              {(data.page ?? 1) * 30 < data.total && (
                <Link
                  className="button secondary small"
                  href={`/projects?${new URLSearchParams({ ...Object.fromEntries(params), page: String((data.page ?? 1) + 1) })}`}
                >
                  Следующая →
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
