'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { BriefcaseBusiness, GraduationCap, Plus, Save, Trash2 } from 'lucide-react';

type Work = { title: string; description: string; url: string };
type ProfileData = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  demo: boolean;
  studentProfile: {
    bio: string;
    city: string;
    institution: string;
    discipline: string;
    weeklyHours: number;
    skills: string[];
    formats: string[];
    isPublic: boolean;
  } | null;
  clientProfile: {
    name: string;
    industry: string;
    city: string;
    contact: string;
    description: string;
    verificationStatus: string;
    verificationReason: string | null;
  } | null;
  externalWorks: Work[];
};

export function ProfileForm({
  user,
  onboarding = false,
  preferredRole,
}: {
  user: ProfileData;
  onboarding?: boolean;
  preferredRole?: string;
}) {
  const router = useRouter();
  const [role, setRole] = useState<'student' | 'client'>(
    preferredRole === 'client' || (!user.roles.includes('student') && user.roles.includes('client'))
      ? 'client'
      : 'student',
  );
  const [works, setWorks] = useState<Work[]>(user.externalWorks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const student = user.studentProfile;
  const client = user.clientProfile;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setSuccess('');
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || '').trim();
    const body =
      role === 'student'
        ? {
            role,
            name: value('name'),
            city: value('city'),
            bio: value('bio'),
            institution: value('institution'),
            discipline: value('discipline'),
            weeklyHours: Number(value('weeklyHours')),
            skills: value('skills')
              .split(',')
              .map((skill) => skill.trim())
              .filter(Boolean),
            formats: form.getAll('formats'),
            isPublic: form.get('isPublic') === 'on',
            externalWorks: works,
          }
        : {
            role,
            name: value('name'),
            city: value('city'),
            organisationName: value('organisationName'),
            industry: value('industry'),
            contact: value('contact'),
            description: value('description'),
          };
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          typeof result?.error === 'string'
            ? result.error
            : 'Не удалось сохранить профиль. Повторите позже.',
        );
        return;
      }
      if (onboarding) router.push('/dashboard');
      else setSuccess('Профиль сохранён.');
      router.refresh();
    } catch {
      setError('Сервер недоступен или не ответил вовремя. Проверьте соединение и повторите.');
    } finally {
      setPending(false);
    }
  }

  function updateWork(index: number, field: keyof Work, value: string) {
    setWorks((current) =>
      current.map((work, at) => (at === index ? { ...work, [field]: value } : work)),
    );
  }

  return (
    <div className="profile-editor">
      <div className="profile-tabs" aria-label="Рабочая роль">
        <button
          type="button"
          className={`button ${role === 'student' ? '' : 'secondary'}`}
          aria-pressed={role === 'student'}
          onClick={() => {
            setRole('student');
            setError('');
            setSuccess('');
          }}
        >
          <GraduationCap size={18} /> Я исполнитель
        </button>
        <button
          type="button"
          className={`button ${role === 'client' ? '' : 'secondary'}`}
          aria-pressed={role === 'client'}
          onClick={() => {
            setRole('client');
            setError('');
            setSuccess('');
          }}
        >
          <BriefcaseBusiness size={18} /> Я заказчик
        </button>
      </div>
      <p className="muted">
        Можно использовать обе роли в одном аккаунте. Сохранение второй роли не удалит первую.
      </p>
      {user.demo && <p className="badge">ДЕМО-аккаунт</p>}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="alert success" role="status">
          {success}
        </div>
      )}
      <form onSubmit={save} className="panel form-grid" key={role}>
        <h2>{role === 'student' ? 'Профиль исполнителя' : 'Профиль заказчика'}</h2>
        <div className="form-grid columns">
          <label className="field">
            Отображаемое имя
            <input
              className="input"
              name="name"
              defaultValue={user.name}
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
            />
          </label>
          <label className="field">
            Город
            <input
              className="input"
              name="city"
              defaultValue={(role === 'student' ? student?.city : client?.city) || ''}
              required
              minLength={2}
              maxLength={100}
              placeholder="Например, Усть-Каменогорск"
              autoComplete="address-level2"
            />
          </label>
        </div>
        {role === 'student' ? (
          <>
            <div className="form-grid columns">
              <label className="field">
                Направление
                <input
                  className="input"
                  name="discipline"
                  defaultValue={student?.discipline || ''}
                  maxLength={100}
                  placeholder="Дизайн, IT, аналитика…"
                />
              </label>
              <label className="field">
                Учебное заведение <span className="muted">необязательно</span>
                <input
                  className="input"
                  name="institution"
                  defaultValue={student?.institution || ''}
                  maxLength={150}
                />
              </label>
            </div>
            <label className="field">
              О себе
              <textarea
                className="input"
                name="bio"
                rows={4}
                maxLength={1500}
                defaultValue={student?.bio || ''}
                placeholder="Что умеете и какие задачи хотите попробовать"
              />
            </label>
            <div className="form-grid columns">
              <label className="field">
                Навыки через запятую
                <input
                  className="input"
                  name="skills"
                  defaultValue={student?.skills.join(', ') || ''}
                  maxLength={750}
                  placeholder="Excel, аналитика, тексты"
                />
                <small className="muted">
                  До 15 навыков. Выполненные заказы для отклика не нужны.
                </small>
              </label>
              <label className="field">
                Доступность, часов в неделю
                <input
                  className="input"
                  name="weeklyHours"
                  type="number"
                  min={1}
                  max={40}
                  required
                  defaultValue={student?.weeklyHours || 5}
                />
              </label>
            </div>
            <fieldset className="form-section">
              <legend>Формат работы</legend>
              <div className="inline-actions">
                {[
                  ['remote', 'Удалённо'],
                  ['onsite', 'Очно'],
                  ['hybrid', 'Гибрид'],
                ].map(([format, label]) => (
                  <label className="check-row" key={format}>
                    <input
                      type="checkbox"
                      name="formats"
                      value={format}
                      defaultChecked={(student?.formats || ['remote']).includes(format)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <section className="form-section" aria-labelledby="external-work-heading">
              <h3 id="external-work-heading">Внешние работы</h3>
              <p className="muted">
                Учебные и личные проекты допустимы. Они получают метку «Добавлено автором» и не
                считаются подтверждёнными заказчиком.
              </p>
              {works.map((work, index) => (
                <fieldset className="panel form-grid" key={index}>
                  <legend>Работа {index + 1}</legend>
                  <label className="field">
                    Название работы
                    <input
                      className="input"
                      value={work.title}
                      onChange={(event) => updateWork(index, 'title', event.target.value)}
                      required
                      minLength={2}
                      maxLength={150}
                    />
                  </label>
                  <label className="field">
                    HTTPS-ссылка
                    <input
                      className="input"
                      type="url"
                      placeholder="https://…"
                      value={work.url}
                      onChange={(event) => updateWork(index, 'url', event.target.value)}
                      required
                      maxLength={2000}
                    />
                  </label>
                  <label className="field">
                    Описание работы
                    <textarea
                      className="input"
                      rows={2}
                      value={work.description}
                      onChange={(event) => updateWork(index, 'description', event.target.value)}
                      maxLength={1000}
                    />
                  </label>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setWorks((current) => current.filter((_, at) => at !== index))}
                  >
                    <Trash2 size={16} /> Удалить работу {index + 1}
                  </button>
                </fieldset>
              ))}
              {works.length < 10 && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    setWorks((current) => [...current, { title: '', url: '', description: '' }])
                  }
                >
                  <Plus size={16} /> Добавить работу
                </button>
              )}
            </section>
            <label className="check-row">
              <input type="checkbox" name="isPublic" defaultChecked={student?.isPublic || false} />
              <span>
                Показывать профиль и внешние работы публично. Email и приватные материалы не
                публикуются.
              </span>
            </label>
            {student?.isPublic && (
              <Link href={`/talent/${user.id}`}>Открыть публичный профиль</Link>
            )}
          </>
        ) : (
          <>
            <label className="field">
              Название организации или имя заказчика
              <input
                className="input"
                name="organisationName"
                defaultValue={client?.name || user.name}
                maxLength={150}
                required
              />
            </label>
            <label className="field">
              Сфера деятельности
              <input
                className="input"
                name="industry"
                defaultValue={client?.industry || ''}
                maxLength={100}
                placeholder="Образование, торговля, услуги…"
              />
            </label>
            <label className="field">
              О заказчике
              <textarea
                className="input"
                name="description"
                defaultValue={client?.description || ''}
                rows={4}
                maxLength={1500}
                placeholder="Чем занимаетесь и для чего ищете исполнителя"
              />
            </label>
            <label className="field">
              Контакт для назначенного исполнителя
              <input
                className="input"
                name="contact"
                defaultValue={client?.contact || ''}
                maxLength={300}
                placeholder="Рабочий email или другой контакт"
              />
              <small className="muted">В публичном профиле этот контакт не отображается.</small>
            </label>
            <div className="alert">
              Проверка заказчика:{' '}
              {client?.verificationStatus === 'verified'
                ? 'проверен модератором'
                : client?.verificationStatus === 'rejected'
                  ? 'требует уточнения'
                  : 'ожидает проверки'}
              . Изменённые данные отправятся на проверку повторно.
              {client?.verificationReason && <p>{client.verificationReason}</p>}
            </div>
          </>
        )}
        <div className="inline-actions">
          <button type="submit" className="button" disabled={pending}>
            <Save size={17} />
            {pending ? 'Сохраняем…' : onboarding ? 'Сохранить и продолжить' : 'Сохранить профиль'}
          </button>
          {!onboarding && (
            <Link href="/dashboard" className="button secondary">
              В кабинет
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
