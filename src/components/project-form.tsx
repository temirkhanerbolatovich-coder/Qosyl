'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { projectTemplates } from '@/lib/project-templates';
import { categoryLabels, lines } from '@/lib/labels';
import { ActionFeedback, LoadState, PageHeading, useAction, useData } from './platform';
import type { Project } from './types';
import type { LeadHandoff } from '@/contracts/leads';
type ProjectLead = Pick<LeadHandoff, 'id' | 'version' | 'title' | 'summary'>;

function inputDate(date: string | undefined) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Qyzylorda',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}
export function ProjectForm({
  initial,
  proposal = false,
  afterSave,
  lead,
}: {
  initial?: Project;
  proposal?: boolean;
  afterSave?: () => Promise<void>;
  lead?: ProjectLead;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [templateMessage, setTemplateMessage] = useState('');
  const [leadBusy, setLeadBusy] = useState(false),
    [leadError, setLeadError] = useState('');
  function applyTemplate(template: (typeof projectTemplates)[number]) {
    const form = formRef.current;
    if (!form) return;
    for (const [name, value] of Object.entries(template.fields)) {
      const field = form.elements.namedItem(name);
      if (
        (field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement ||
          field instanceof HTMLSelectElement) &&
        !field.value.trim()
      )
        field.value = value;
    }
    setTemplateMessage(
      'Шаблон добавлен только в пустые поля. Проверьте объём и часы, укажите свой бюджет, срок и контакт.',
    );
  }
  const action = useAction(afterSave);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action.busy || leadBusy) return;
    const form = new FormData(event.currentTarget);
    const fields = {
      title: form.get('title'),
      category: form.get('category'),
      problem: form.get('problem'),
      description: form.get('description'),
      deliverables: form.get('deliverables'),
      acceptanceCriteria: lines(form.get('acceptanceCriteria')),
      skills: String(form.get('skills') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      difficulty: form.get('difficulty'),
      mode: form.get('mode'),
      city: form.get('city'),
      locationPrivate: form.get('locationPrivate'),
      contactPrivate: form.get('contactPrivate'),
      budgetKzt: Number(form.get('budgetKzt')),
      estimatedHours: Number(form.get('estimatedHours')),
      dueAt: new Date(`${form.get('dueAt')}T23:59:00+05:00`).toISOString(),
      preferredTime: form.get('preferredTime'),
    };
    if (lead) {
      setLeadBusy(true);
      setLeadError('');
      try {
        const response = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            leadId: lead.id,
            expectedVersion: lead.version,
            confirmation: form.get('leadConfirmation') === 'on',
            project: fields,
          }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Не удалось создать черновик.');
        router.push(`/projects/${body.data.projectId}`);
      } catch (error) {
        setLeadError(error instanceof Error ? error.message : 'Ошибка сохранения.');
      } finally {
        setLeadBusy(false);
      }
      return;
    }
    const result = await action.run(
      proposal ? 'proposeAgreement' : initial ? 'updateProject' : 'createProject',
      { ...(initial ? { projectId: initial.id } : {}), ...fields },
      proposal
        ? 'Новая версия условий создана. Обе стороны должны подтвердить её заново.'
        : 'Черновик сохранён. Следующий шаг — отправить его на модерацию.',
    );
    if (result && !proposal && 'id' in result) router.push(`/projects/${initial?.id ?? result.id}`);
  }
  return (
    <form ref={formRef} onSubmit={submit} className="stack">
      {!initial && !proposal && (
        <section className="panel form-section" aria-label="Шаблоны задач">
          <h2>Начните с небольшого результата</h2>
          <p>
            Шаблон заполняет только пустые поля. Бюджет и срок определяете вы; четыре часа — пример
            оценки вместе с согласованием и правками.
          </p>
          <div className="button-row">
            {projectTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="button secondary small"
                onClick={() => applyTemplate(template)}
              >
                {template.name}
              </button>
            ))}
          </div>
          {templateMessage && <p role="status">{templateMessage}</p>}
        </section>
      )}
      <section className="panel form-section">
        <h2>01 · Что нужно сделать</h2>
        <div className="form-grid">
          <label className="field wide">
            Название задачи
            <input
              name="title"
              required
              minLength={10}
              maxLength={140}
              defaultValue={initial?.title ?? lead?.title}
              placeholder="Например, подготовить таблицу учёта остатков"
            />
          </label>
          <label className="field">
            Категория
            <select name="category" required defaultValue={initial?.category ?? ''}>
              <option value="" disabled>
                Выберите категорию
              </option>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Уровень исполнителя
            <select name="difficulty" defaultValue={initial?.difficulty ?? 'beginner_friendly'}>
              <option value="beginner_friendly">Подходит для первого опыта</option>
              <option value="intermediate">Нужен базовый опыт</option>
            </select>
          </label>
          <label className="field wide">
            Какую проблему решаем?
            <textarea
              name="problem"
              required
              minLength={20}
              maxLength={500}
              rows={2}
              defaultValue={initial?.problem ?? lead?.summary.slice(0, 500)}
              placeholder="Коротко объясните, зачем нужна эта работа"
            />
          </label>
          <label className="field wide">
            Описание и границы задачи
            <textarea
              name="description"
              required
              minLength={30}
              maxLength={10000}
              defaultValue={initial?.description ?? lead?.summary}
              placeholder="Что уже есть, что входит в работу и что не входит?"
            />
            <small>
              Ограничьте объём. Не добавляйте персональные данные, пароли и выгрузки клиентских баз.
            </small>
          </label>
          <label className="field wide">
            Ожидаемый результат
            <textarea
              name="deliverables"
              required
              minLength={15}
              maxLength={3000}
              defaultValue={initial?.deliverables}
              placeholder="Какой конкретный результат вы хотите получить?"
            />
          </label>
          <label className="field wide">
            Критерии приёмки
            <textarea
              name="acceptanceCriteria"
              required
              maxLength={5000}
              defaultValue={initial?.acceptanceCriteria.join('\n')}
              placeholder={
                'Один проверяемый критерий на строку\nНапример: в таблице есть формулы расчёта остатков'
              }
            />
            <small>По этим пунктам вы будете принимать результат и запрашивать правки.</small>
          </label>
          <label className="field wide">
            Навыки, через запятую
            <input
              name="skills"
              required
              maxLength={500}
              defaultValue={initial?.skills.join(', ')}
              placeholder="Excel, работа с данными"
            />
          </label>
        </div>
      </section>
      <section className="panel form-section">
        <h2>02 · Время, место и бюджет</h2>
        <div className="form-grid">
          <label className="field">
            Бюджет за весь результат, ₸
            <input
              type="number"
              name="budgetKzt"
              min="1"
              max="10000000"
              step="1"
              required
              defaultValue={initial?.budgetKzt}
              placeholder="15000"
            />
            <small>Положительная фиксированная сумма. Платёж — вне платформы.</small>
          </label>
          <label className="field">
            Ожидаемая трудоёмкость, часов
            <input
              type="number"
              name="estimatedHours"
              min="1"
              max="160"
              required
              defaultValue={initial?.estimatedHours}
              placeholder="4"
            />
          </label>
          <label className="field">
            Дедлайн
            <input
              name="dueAt"
              type="date"
              required
              defaultValue={inputDate(initial?.dueAt)}
              min={new Date().toISOString().slice(0, 10)}
            />
            <small>Конец выбранного дня, время Казахстана (UTC+5).</small>
          </label>
          <label className="field">
            Предпочтительные дни и время
            <input
              name="preferredTime"
              maxLength={300}
              defaultValue={initial?.preferredTime}
              placeholder="Например, суббота, 10:00–14:00"
            />
          </label>
          <label className="field">
            Формат
            <select name="mode" defaultValue={initial?.mode ?? 'remote'}>
              <option value="remote">Удалённо</option>
              <option value="onsite">Очно</option>
              <option value="hybrid">Гибридно</option>
            </select>
          </label>
          <label className="field">
            Город
            <input
              name="city"
              maxLength={100}
              defaultValue={initial?.city}
              placeholder="Усть-Каменогорск"
            />
            <small>Для очного/гибридного формата обязателен.</small>
          </label>
          <label className="field wide">
            Точная локация (закрытая)
            <input
              name="locationPrivate"
              maxLength={500}
              defaultValue={initial?.locationPrivate ?? ''}
              placeholder="Адрес или инструкции, доступные после назначения"
            />
            <small>
              В каталоге точный адрес не показывается. Для очного формата укажите место встречи.
            </small>
          </label>
          <label className="field wide">
            Контакт после назначения
            <input
              name="contactPrivate"
              required={!proposal}
              maxLength={300}
              defaultValue={initial?.contactPrivate ?? ''}
              placeholder="Рабочий email или способ связи"
            />
            <small>Виден только участникам заказа после согласования.</small>
          </label>
        </div>
      </section>
      <div className="alert warning">
        Пилот для участников 18+. Не публикуйте неоплачиваемые коммерческие тестовые задания,
        опасные услуги и задачи с неограниченным объёмом.
      </div>
      {lead && (
        <label className="check-row">
          <input name="leadConfirmation" type="checkbox" required />Я являюсь заказчиком этой задачи
          и подтверждаю создание черновика с указанными мной бюджетом, результатом и критериями.
        </label>
      )}
      <ActionFeedback error={leadError || action.error} success={action.success} />
      <div className="button-row">
        <button className="button" type="submit" disabled={action.busy || leadBusy}>
          {action.busy || leadBusy
            ? 'Сохраняем…'
            : proposal
              ? 'Предложить новую версию условий'
              : 'Сохранить черновик'}
        </button>
        {!proposal && <span className="muted small-text">Публикация — только после модерации</span>}
      </div>
    </form>
  );
}
export function ProjectEditorScreen({ id, lead }: { id?: string; lead?: ProjectLead }) {
  const { data, error, loading, refresh } = useData('project', { id: id ?? '' }, Boolean(id));
  if (id && loading)
    return (
      <div className="page-shell narrow">
        <LoadState />
      </div>
    );
  if (id && (error || !data))
    return (
      <div className="page-shell narrow">
        <LoadState error={error} retry={refresh} />
      </div>
    );
  return (
    <div className="page-shell narrow">
      <PageHeading
        eyebrow="Кабинет заказчика"
        title={id ? 'Редактирование заказа' : 'Новая задача для студента'}
      >
        Опишите небольшой проект с конкретным результатом. Это поможет найти исполнителя и спокойно
        принять работу.
      </PageHeading>
      {lead && (
        <div className="alert">
          Запрос передан вам после ручного согласования. Проверьте и дополните описание; заказ ещё
          не создан.
        </div>
      )}
      <ProjectForm initial={id ? data?.project : undefined} lead={lead} />
    </div>
  );
}
