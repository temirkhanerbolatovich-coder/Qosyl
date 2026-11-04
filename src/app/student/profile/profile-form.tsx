'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { BriefcaseBusiness, GraduationCap, Save } from 'lucide-react';
import { useI18n } from '@/components/locale-provider';
import { ExperienceEditor } from '@/components/experience-editor';
import { ProfileVisibility } from '@/components/profile-visibility';
import { hiddenProfileFieldsSchema } from '@/lib/profile-visibility';
import { ProfileLinksEditor } from '@/components/profile-links';
import { readProfileLinks } from '@/lib/profile-links';
import { readExperiences } from '@/lib/profile-details';
import {
  profileFailureCopy,
  profileFailureFromResponse,
  type ProfileFailure,
} from '@/lib/profile-localization';

type Work = { title: string; description: string; url: string };
type ProfileData = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  demo: boolean;
  studentProfile: {
    bio: string;
    headline: string;
    studyYear: number | null;
    languages: string[];
    experiences: unknown;
    profileLinks: unknown;
    hiddenFields: string[];
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
  const { locale, t } = useI18n();
  const router = useRouter();
  const [role, setRole] = useState<'student' | 'client'>(
    preferredRole === 'client' || (!user.roles.includes('student') && user.roles.includes('client'))
      ? 'client'
      : 'student',
  );
  const [hiddenFields, setHiddenFields] = useState(() =>
    hiddenProfileFieldsSchema.parse(user.studentProfile?.hiddenFields ?? []),
  );
  const [profileLinks, setProfileLinks] = useState(() =>
    readProfileLinks(user.studentProfile?.profileLinks),
  );
  const [experiences, setExperiences] = useState(() =>
    readExperiences(user.studentProfile?.experiences),
  );
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ProfileFailure | null>(null);
  const [saved, setSaved] = useState(false);
  const error = failure ? profileFailureCopy(failure, locale) : null;
  const student = user.studentProfile;
  const client = user.clientProfile;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFailure(null);
    setSaved(false);
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || '').trim();
    const body =
      role === 'student'
        ? {
            role,
            name: value('name'),
            city: value('city'),
            bio: value('bio'),
            headline: value('headline'),
            studyYear: value('studyYear') ? Number(value('studyYear')) : null,
            languages: value('languages')
              .split(',')
              .map((language) => language.trim())
              .filter(Boolean),
            experiences,
            profileLinks,
            hiddenFields,
            institution: value('institution'),
            discipline: value('discipline'),
            weeklyHours: Number(value('weeklyHours')),
            skills: value('skills')
              .split(',')
              .map((skill) => skill.trim())
              .filter(Boolean),
            formats: form.getAll('formats'),
            isPublic: form.get('isPublic') === 'on',
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
        setFailure(profileFailureFromResponse(response.status, result));
        return;
      }
      if (onboarding) router.push('/dashboard');
      else setSaved(true);
      router.refresh();
    } catch {
      setFailure({ kind: 'network' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="profile-editor" lang={locale}>
      <div className="profile-tabs" aria-label={t('Рабочая роль', 'Жұмыс рөлі')}>
        <button
          type="button"
          className={`button ${role === 'student' ? '' : 'secondary'}`}
          aria-pressed={role === 'student'}
          onClick={() => {
            setRole('student');
            setFailure(null);
            setSaved(false);
          }}
        >
          <GraduationCap size={18} /> {t('Я исполнитель', 'Мен орындаушымын')}
        </button>
        <button
          type="button"
          className={`button ${role === 'client' ? '' : 'secondary'}`}
          aria-pressed={role === 'client'}
          onClick={() => {
            setRole('client');
            setFailure(null);
            setSaved(false);
          }}
        >
          <BriefcaseBusiness size={18} /> {t('Я заказчик', 'Мен тапсырыс берушімін')}
        </button>
      </div>
      <p className="muted">
        {t(
          'Можно использовать обе роли в одном аккаунте. Сохранение второй роли не удалит первую.',
          'Бір аккаунтта екі рөлді де пайдалануға болады. Екінші рөлді сақтау біріншісін жоймайды.',
        )}
      </p>
      {user.demo && <p className="badge">{t('ДЕМО-аккаунт', 'ДЕМО-аккаунт')}</p>}
      {error && (
        <div className="alert error" role="alert">
          <p>{error.summary}</p>
          {error.original && (
            <p>
              {t('Исходное сообщение сервера:', 'Сервердің бастапқы хабарламасы:')}{' '}
              <span lang="und">{error.original}</span>
            </p>
          )}
        </div>
      )}
      {saved && (
        <div className="alert success" role="status">
          {t('Профиль сохранён.', 'Профиль сақталды.')}
        </div>
      )}
      <form onSubmit={save} className="panel form-grid" key={role}>
        <h2>
          {role === 'student'
            ? t('Профиль исполнителя', 'Орындаушы профилі')
            : t('Профиль заказчика', 'Тапсырыс беруші профилі')}
        </h2>
        <div className="form-grid columns">
          <label className="field">
            {t('Отображаемое имя', 'Көрсетілетін аты-жөніңіз')}
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
            {t('Город', 'Қала')}
            <input
              className="input"
              name="city"
              defaultValue={(role === 'student' ? student?.city : client?.city) || ''}
              required
              minLength={2}
              maxLength={100}
              placeholder={t('Например, Усть-Каменогорск', 'Мысалы, Өскемен')}
              autoComplete="address-level2"
            />
          </label>
        </div>
        {role === 'student' ? (
          <>
            <label className="field">
              {t('Профессиональный заголовок (необязательно)', 'Кәсіби тақырып (міндетті емес)')}
              <input
                className="input"
                name="headline"
                defaultValue={student?.headline || ''}
                maxLength={120}
                placeholder={t('Например, начинающий дизайнер', 'Мысалы, бастаушы дизайнер')}
              />
            </label>
            <div className="form-grid columns">
              <label className="field">
                {t('Направление', 'Бағыт')}
                <input
                  className="input"
                  name="discipline"
                  defaultValue={student?.discipline || ''}
                  maxLength={100}
                  placeholder={t('Дизайн, IT, аналитика…', 'Дизайн, IT, талдау…')}
                />
              </label>
              <label className="field">
                {t('Учебное заведение', 'Оқу орны')}{' '}
                <span className="muted">{t('необязательно', 'міндетті емес')}</span>
                <input
                  className="input"
                  name="institution"
                  defaultValue={student?.institution || ''}
                  maxLength={150}
                />
              </label>
            </div>
            <div className="form-grid columns">
              <label className="field">
                {t('Курс (необязательно)', 'Курс (міндетті емес)')}
                <input
                  className="input"
                  name="studyYear"
                  type="number"
                  min={1}
                  max={8}
                  defaultValue={student?.studyYear ?? ''}
                />
              </label>
              <label className="field">
                {t(
                  'Языки через запятую (необязательно)',
                  'Тілдерді үтірмен бөліңіз (міндетті емес)',
                )}
                <input
                  className="input"
                  name="languages"
                  maxLength={600}
                  defaultValue={student?.languages.join(', ') || ''}
                />
              </label>
            </div>
            <label className="field">
              {t('О себе', 'Өзіңіз туралы')}
              <textarea
                className="input"
                name="bio"
                rows={4}
                maxLength={1500}
                defaultValue={student?.bio || ''}
                placeholder={t(
                  'Что умеете и какие задачи хотите попробовать',
                  'Не істей аласыз және қандай тапсырмаларды орындап көргіңіз келеді',
                )}
              />
            </label>
            <div className="form-grid columns">
              <label className="field">
                {t('Навыки через запятую', 'Дағдыларды үтірмен бөліп жазыңыз')}
                <input
                  className="input"
                  name="skills"
                  defaultValue={student?.skills.join(', ') || ''}
                  maxLength={750}
                  placeholder={t('Excel, аналитика, тексты', 'Excel, талдау, мәтіндер')}
                />
                <small className="muted">
                  {t(
                    'До 15 навыков. Выполненные заказы для отклика не нужны.',
                    '15 дағдыға дейін. Өтінім беру үшін аяқталған тапсырыстар қажет емес.',
                  )}
                </small>
              </label>
              <label className="field">
                {t('Доступность, часов в неделю', 'Аптасына бөле алатын уақыт, сағат')}
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
              <legend>{t('Формат работы', 'Жұмыс форматы')}</legend>
              <div className="inline-actions">
                {[
                  ['remote', t('Удалённо', 'Қашықтан')],
                  ['onsite', t('Очно', 'Офлайн')],
                  ['hybrid', t('Гибрид', 'Аралас')],
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
            <ExperienceEditor values={experiences} onChange={setExperiences} />
            <ProfileVisibility hidden={hiddenFields} onChange={setHiddenFields} />
            <ProfileLinksEditor values={profileLinks} onChange={setProfileLinks} />
            {!onboarding && (
              <p className="muted">
                {t(
                  'Самостоятельные работы редактируются на вкладке «Портфолио».',
                  'Жеке жұмыстар «Портфолио» қойындысында өңделеді.',
                )}
              </p>
            )}
            <label className="check-row">
              <input type="checkbox" name="isPublic" defaultChecked={student?.isPublic || false} />
              <span>
                {t(
                  'Показывать профиль и внешние работы публично. Email и приватные материалы не публикуются.',
                  'Профиль мен сыртқы жұмыстарды ашық көрсету. Email мен жеке материалдар жарияланбайды.',
                )}
              </span>
            </label>
            {student?.isPublic && (
              <Link href={`/talent/${user.id}`}>
                {t('Открыть публичный профиль', 'Ашық профильді көру')}
              </Link>
            )}
          </>
        ) : (
          <>
            <label className="field">
              {t(
                'Название организации или имя заказчика',
                'Ұйым атауы немесе тапсырыс берушінің аты',
              )}
              <input
                className="input"
                name="organisationName"
                defaultValue={client?.name || user.name}
                maxLength={150}
                required
              />
            </label>
            <label className="field">
              {t('Сфера деятельности', 'Қызмет саласы')}
              <input
                className="input"
                name="industry"
                defaultValue={client?.industry || ''}
                maxLength={100}
                placeholder={t('Образование, торговля, услуги…', 'Білім беру, сауда, қызметтер…')}
              />
            </label>
            <label className="field">
              {t('О заказчике', 'Тапсырыс беруші туралы')}
              <textarea
                className="input"
                name="description"
                defaultValue={client?.description || ''}
                rows={4}
                maxLength={1500}
                placeholder={t(
                  'Чем занимаетесь и для чего ищете исполнителя',
                  'Немен айналысасыз және орындаушыны не үшін іздейсіз',
                )}
              />
            </label>
            <label className="field">
              {t(
                'Контакт для назначенного исполнителя',
                'Тағайындалған орындаушыға арналған байланыс',
              )}
              <input
                className="input"
                name="contact"
                defaultValue={client?.contact || ''}
                maxLength={300}
                placeholder={t(
                  'Рабочий email или другой контакт',
                  'Жұмыс email-і немесе басқа байланыс',
                )}
              />
              <small className="muted">
                {t(
                  'В публичном профиле этот контакт не отображается.',
                  'Бұл байланыс ашық профильде көрсетілмейді.',
                )}
              </small>
            </label>
            <div className="alert">
              {t('Проверка заказчика:', 'Тапсырыс берушіні тексеру:')}{' '}
              {client?.verificationStatus === 'verified'
                ? t('проверен модератором', 'модератор тексерген')
                : client?.verificationStatus === 'rejected'
                  ? t('требует уточнения', 'нақтылау қажет')
                  : t('ожидает проверки', 'тексеруді күтуде')}
              {t(
                '. Изменённые данные отправятся на проверку повторно.',
                '. Өзгертілген деректер қайта тексеруге жіберіледі.',
              )}
              {client?.verificationReason && <p lang="und">{client.verificationReason}</p>}
            </div>
          </>
        )}
        <div className="inline-actions">
          <button type="submit" className="button" disabled={pending}>
            <Save size={17} />
            {pending
              ? t('Сохраняем…', 'Сақталуда…')
              : onboarding
                ? t('Сохранить и продолжить', 'Сақтап, жалғастыру')
                : t('Сохранить профиль', 'Профильді сақтау')}
          </button>
          {!onboarding && (
            <Link href="/dashboard" className="button secondary">
              {t('В кабинет', 'Кабинетке өту')}
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
