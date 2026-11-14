'use client';

import { useState } from 'react';
import { useI18n } from './locale-provider';

type ResumeData = {
  name: string;
  email: string;
  headline: string;
  city: string;
  education: string;
  skills: string;
  languages: string;
  experience: string;
  projects: string;
  links: string;
};
type Section = 'education' | 'experience' | 'projects' | 'skills' | 'languages' | 'links';
const sectionKeys: Section[] = [
  'education',
  'experience',
  'projects',
  'skills',
  'languages',
  'links',
];
const sectionTextLimit = 12000;

export function ResumeBuilder({ initial }: { initial: ResumeData }) {
  const { locale, t } = useI18n();
  const [edits, setEdits] = useState<Partial<ResumeData>>({});
  const data = { ...initial, ...edits };
  const [order, setOrder] = useState(sectionKeys);
  const [included, setIncluded] = useState<Record<Section, boolean>>({
    education: true,
    experience: true,
    projects: true,
    skills: true,
    languages: true,
    links: false,
  });
  const [includeEmail, setIncludeEmail] = useState(false);
  const [documentLanguage, setDocumentLanguage] = useState<'ru' | 'kk' | 'en'>(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titles = {
    ru: {
      education: 'Образование',
      experience: 'Опыт и активности',
      projects: 'Проекты',
      skills: 'Навыки',
      languages: 'Языки',
      links: 'Ссылки',
    },
    kk: {
      education: 'Білім',
      experience: 'Тәжірибе және белсенділік',
      projects: 'Жобалар',
      skills: 'Дағдылар',
      languages: 'Тілдер',
      links: 'Сілтемелер',
    },
    en: {
      education: 'Education',
      experience: 'Experience and activities',
      projects: 'Projects',
      skills: 'Skills',
      languages: 'Languages',
      links: 'Links',
    },
  };
  const labels = titles[documentLanguage];
  const sections = order
    .filter((key) => included[key] && data[key].trim())
    .map((key) => ({ title: labels[key], text: data[key].trim(), links: key === 'links' }));
  const heading = [
    data.headline.trim(),
    data.city.trim(),
    includeEmail ? data.email.trim() : '',
  ].filter(Boolean);
  function moveSection(index: number, offset: number) {
    const updated = [...order];
    [updated[index], updated[index + offset]] = [updated[index + offset], updated[index]];
    setOrder(updated);
  }
  async function download() {
    setError('');
    if (!data.name.trim()) {
      setError(t('Укажите имя для резюме.', 'Түйіндеме үшін атыңызды көрсетіңіз.'));
      return;
    }
    setBusy(true);
    try {
      const { createResumePdf } = await import('@/lib/resume-pdf');
      const bytes = await createResumePdf({
        name: data.name.trim(),
        language: documentLanguage,
        heading,
        sections,
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'qosyl-resume.pdf';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError(
        t(
          'Не удалось создать PDF. Повторите попытку.',
          'PDF жасау мүмкін болмады. Қайталап көріңіз.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack" aria-label={t('Конструктор резюме', 'Түйіндеме құрастыру')}>
      <h2>{t('Резюме', 'Түйіндеме')}</h2>
      <p>
        {t(
          'Черновик заполнен из вашего профиля. Изменения в резюме действуют только до обновления страницы. Выберите данные для файла.',
          'Жоба профиліңіздегі деректермен толтырылды. Түйіндемедегі өзгерістер бетті жаңартқанға дейін сақталады. Файлға арналған деректерді таңдаңыз.',
        )}
      </p>
      <div className="panel stack">
        <label className="field">
          {t('Язык заголовков', 'Тақырыптар тілі')}
          <select
            value={documentLanguage}
            onChange={(event) => setDocumentLanguage(event.target.value as 'ru' | 'kk' | 'en')}
          >
            <option value="ru">Русский</option>
            <option value="kk">Қазақша</option>
            <option value="en">English</option>
          </select>
        </label>
        <p className="muted small-text">
          {t(
            'Текст опыта и проектов можно отредактировать для выбранной заявки.',
            'Тәжірибе мен жоба мәтінін таңдалған өтінімге сай өзгертуге болады.',
          )}
        </p>
        <div className="form-grid">
          {(['name', 'headline', 'city'] as const).map((key) => (
            <label className="field" key={key}>
              {key === 'name'
                ? t('Имя', 'Аты')
                : key === 'headline'
                  ? t('Заголовок', 'Тақырып')
                  : t('Город', 'Қала')}
              <input
                value={data[key]}
                maxLength={200}
                onChange={(event) => setEdits({ ...edits, [key]: event.target.value })}
              />
            </label>
          ))}
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={includeEmail}
            onChange={(event) => setIncludeEmail(event.target.checked)}
          />
          {t('Добавить адрес электронной почты', 'Электрондық пошта мекенжайын қосу')} ({data.email}
          )
        </label>
        {order.map((key, index) => (
          <div className="stack" key={key}>
            <div className="button-row">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={included[key]}
                  onChange={(event) => setIncluded({ ...included, [key]: event.target.checked })}
                />
                {labels[key]}
              </label>
              <button
                type="button"
                className="icon-button"
                disabled={index === 0}
                aria-label={t(`Выше: ${labels[key]}`, `Жоғары: ${labels[key]}`)}
                onClick={() => moveSection(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={index === order.length - 1}
                aria-label={t(`Ниже: ${labels[key]}`, `Төмен: ${labels[key]}`)}
                onClick={() => moveSection(index, 1)}
              >
                ↓
              </button>
            </div>
            {included[key] && (
              <label className="field">
                {labels[key]}
                <textarea
                  value={data[key]}
                  maxLength={Math.max(sectionTextLimit, initial[key].length)}
                  onChange={(event) => setEdits({ ...edits, [key]: event.target.value })}
                />
              </label>
            )}
          </div>
        ))}
      </div>
      <section
        className="panel stack"
        aria-label={t('Предпросмотр резюме', 'Түйіндемені алдын ала қарау')}
      >
        <h2>{t('Предпросмотр', 'Алдын ала қарау')}</h2>
        <div className="resume-preview" lang={documentLanguage}>
          <h3>{data.name.trim() || t('Имя', 'Аты')}</h3>
          {heading.length > 0 && <p>{heading.join(' · ')}</p>}
          {sections.map((section) => (
            <section key={section.title}>
              <h4>{section.title}</h4>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{section.text}</p>
            </section>
          ))}
        </div>
      </section>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <div>
        <button type="button" className="button" disabled={busy} onClick={() => void download()}>
          {busy ? t('Создаём PDF…', 'PDF жасалуда…') : t('Скачать PDF', 'PDF жүктеу')}
        </button>
      </div>
    </section>
  );
}
