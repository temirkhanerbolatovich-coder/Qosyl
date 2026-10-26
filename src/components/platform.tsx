'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { categoryLabels, date, modeLabels, money, statusLabels } from '@/lib/labels';
import type { Project, Viewer } from './types';
import type { PlatformView, ViewData, CommandData } from '@/contracts/api-responses';
import type { Action } from '@/lib/validation';

const ViewerContext = createContext<Viewer | null>(null);
export function ViewerProvider({
  viewer,
  children,
}: {
  viewer: Viewer | null;
  children: React.ReactNode;
}) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}
export function useViewer() {
  return useContext(ViewerContext);
}
async function api<T>(
  query: string,
  options?: { action: string; [key: string]: unknown },
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`/api/platform${query ? `?${query}` : ''}`, {
      method: options ? 'POST' : 'GET',
      headers: options ? { 'Content-Type': 'application/json' } : undefined,
      body: options ? JSON.stringify(options) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as { data?: T; error?: string } | null;
    if (!res.ok || !body || !('data' in body))
      throw new Error(body?.error ?? 'Не удалось получить данные. Повторите попытку.');
    return body.data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error('Сервер не ответил вовремя. Проверьте соединение и повторите попытку.');
    if (error instanceof TypeError)
      throw new Error(
        'Нет соединения с сервером. Изменения не подтверждены. Повторите попытку после восстановления сети.',
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export function useData<V extends PlatformView>(
  view: V,
  params: Record<string, string> | URLSearchParams = {},
  enabled = true,
) {
  type T = ViewData<V>;
  const search = new URLSearchParams(params);
  search.set('view', view);
  const query = search.toString();
  const [state, setState] = useState<{
    query: string;
    data: T | null;
    error: string;
    loading: boolean;
  }>({ query, data: null, error: '', loading: true });
  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const result = await api<T>(query);
      setState({ query, data: result, error: '', loading: false });
    } catch (e) {
      setState((previous) => ({
        query,
        data: previous.query === query ? previous.data : null,
        error: e instanceof Error ? e.message : 'Произошла ошибка',
        loading: false,
      }));
    }
  }, [query, enabled]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void api<T>(query)
      .then((result) => {
        if (active) setState({ query, data: result, error: '', loading: false });
      })
      .catch((e: unknown) => {
        if (active)
          setState({
            query,
            data: null,
            error: e instanceof Error ? e.message : 'Произошла ошибка',
            loading: false,
          });
      });
    return () => {
      active = false;
    };
  }, [query, enabled]);
  return {
    data: state.query === query ? state.data : null,
    error: state.query === query ? state.error : '',
    loading: enabled && (state.query !== query || state.loading),
    refresh,
  };
}
export function useAction(refresh?: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function run<A extends Action>(
    action: A,
    payload: Record<string, unknown> = {},
    message = 'Изменения сохранены',
  ) {
    if (busy) return null;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const data = await api<CommandData<A>>('', { ...payload, action });
      setSuccess(message);
      await refresh?.();
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить действие');
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error, success };
}
export function ActionFeedback({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error && (
        <div className="alert error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert success" role="status">
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      )}
    </>
  );
}
export function LoadState({ error, retry }: { error?: string; retry?: () => void }) {
  return error ? (
    <div className="panel empty-state">
      <AlertCircle size={30} />
      <h2>Не удалось открыть страницу</h2>
      <p className="muted">{error}</p>
      <div className="button-row">
        {retry && (
          <button className="button secondary" onClick={retry}>
            <RefreshCw size={16} />
            Повторить
          </button>
        )}
        <Link className="text-link" href="/auth/login">
          Войти в аккаунт
        </Link>
      </div>
    </div>
  ) : (
    <div className="loading-skeleton" role="status" aria-label="Загрузка">
      <div />
      <div />
      <div />
    </div>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const StatusIcon = ['accepted', 'completed', 'published', 'active'].includes(status)
    ? CheckCircle2
    : ['cancelled', 'disputed', 'rejected'].includes(status)
      ? AlertCircle
      : Clock3;
  return (
    <span className={`badge status-${status}`}>
      <StatusIcon size={14} aria-hidden="true" />
      {statusLabels[status] ?? status}
    </span>
  );
}
export function DemoBadge() {
  return (
    <span className="badge demo">
      <Sparkles size={12} />
      ДЕМО
    </span>
  );
}
export function EmptyState({
  title,
  children,
  href,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <div className="panel empty-state">
      <div className="empty-icon">
        <Sparkles size={25} />
      </div>
      <h2>{title}</h2>
      <p className="muted">{children}</p>
      {href && (
        <Link className="button" href={href}>
          {action}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {children && <p className="lead">{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="project-card">
      <div className="card-top">
        <span className={`category-icon category-${project.category}`}>
          {(categoryLabels[project.category] ?? project.category).slice(0, 1)}
        </span>
        <div className="card-top-labels">
          <span className="category-name">
            {categoryLabels[project.category] ?? project.category}
          </span>
          {project.demo && <DemoBadge />}
        </div>
        <span className="budget">{money(project.budgetKzt)}</span>
      </div>
      <h2>
        <Link href={`/projects/${project.id}`}>{project.title.replace(/^ДЕМО:\s*/i, '')}</Link>
      </h2>
      <p className="card-description">{project.problem || project.description}</p>
      <div className="project-meta">
        <span>
          <Clock3 size={14} />
          {project.estimatedHours} ч. работы
        </span>
        <span>
          <MapPin size={14} />
          {modeLabels[project.mode]}
          {project.mode !== 'remote' && project.city ? ` · ${project.city}` : ''}
        </span>
      </div>
      <div className="tag-row">
        {project.skills.slice(0, 3).map((skill) => (
          <span className="tag" key={skill}>
            {skill}
          </span>
        ))}
        {project.difficulty === 'beginner_friendly' && (
          <span className="tag beginner">Можно без опыта</span>
        )}
      </div>
      <div className="card-bottom">
        <StatusBadge status={project.status} />
        <span>
          {project.client?.clientProfile?.verificationStatus === 'verified' ? (
            <>
              <ShieldCheck size={14} />
              Заказчик проверен
            </>
          ) : (
            'Заказ прошёл модерацию'
          )}
        </span>
        <span>До {date(project.dueAt)}</span>
      </div>
      <Link className="text-link card-open" href={`/projects/${project.id}`}>
        Подробнее о задаче <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </article>
  );
}
export function WorkspaceNav({ active }: { active: string }) {
  const viewer = useViewer();
  const items = [
    { href: '/dashboard', title: 'Обзор' },
    ...(viewer?.roles.includes('student')
      ? [
          { href: '/student/applications', title: 'Мои отклики' },
          { href: '/student/projects', title: 'Мои проекты' },
          { href: '/student/profile', title: 'Профиль и портфолио' },
        ]
      : []),
    ...(viewer?.roles.includes('client')
      ? [{ href: '/client/projects', title: 'Мои заказы' }]
      : []),
    ...(viewer?.roles.includes('admin') ? [{ href: '/admin', title: 'Модерация' }] : []),
  ];
  return (
    <nav className="workspace-nav" aria-label="Личный кабинет">
      {items.map((item) => (
        <Link
          aria-current={active === item.href ? 'page' : undefined}
          className={active === item.href ? 'active' : ''}
          href={item.href}
          key={item.href}
        >
          {item.title}
        </Link>
      ))}
    </nav>
  );
}
