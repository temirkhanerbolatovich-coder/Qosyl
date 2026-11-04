'use client';
import { MarketplaceMessage, useMarketplaceCopy } from './marketplace-copy';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  getProjectTemplatePatch,
  localizedProjectTemplates,
  type ProjectTemplate,
  type ProjectTemplateField,
} from '@/lib/project-templates';
import { localizedSpecialtyLabels } from '@/lib/localized-opportunity-labels';
import { lines } from '@/lib/labels';
import { localizedCategoryLabels } from '@/lib/localized-labels';
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
  const { locale, copy } = useMarketplaceCopy();
  const categoryLabels = localizedCategoryLabels(locale);
  const specialtyLabels = localizedSpecialtyLabels(locale);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [templateId, setTemplateId] = useState('');
  const projectTemplates = localizedProjectTemplates(locale);
  const selectedTemplate = projectTemplates.find((template) => template.id === templateId);
  const [templateMessage, setTemplateMessage] = useState('');
  const [leadBusy, setLeadBusy] = useState(false),
    [leadError, setLeadError] = useState('');
  function applyTemplate(template: ProjectTemplate) {
    const form = formRef.current;
    if (!form) return;
    const current: Partial<Record<ProjectTemplateField, string>> = {};
    for (const name of Object.keys(template.fields)) {
      const field = form.elements.namedItem(name);
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      )
        current[name as ProjectTemplateField] = field.value;
    }
    const patch = getProjectTemplatePatch(template, current);
    for (const [name, value] of Object.entries(patch)) {
      const field = form.elements.namedItem(name);
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      )
        field.value = value;
    }
    setTemplateMessage(
      Object.keys(patch).length
        ? 'Шаблон добавлен только в пустые поля. Проверьте согласованность всех полей, объём и часы; укажите свой бюджет, срок и контакт.'
        : 'Пустых полей для шаблона нет. Ваши значения сохранены. При необходимости измените их вручную.',
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
    <form ref={formRef} onSubmit={submit} className="stack" lang={locale}>
      {!initial && !proposal && (
        <section className="panel form-section" aria-label={copy('Шаблоны задач')}>
          <h2>{copy('Начните с небольшого результата')}</h2>
          <p>
            {copy(
              'Выберите направление и проверьте пример перед применением. Шаблон заполняет только пустые поля. Бюджет и срок определяете вы; часы — пример оценки с согласованием и правками.',
            )}
          </p>
          <label className="field">
            {copy('Шаблон задачи')}{' '}
            <select
              value={templateId}
              disabled={action.busy || leadBusy}
              onChange={(event) => {
                setTemplateId(event.target.value);
                setTemplateMessage('');
              }}
            >
              <option value="">{copy('Выберите пример по направлению')}</option>
              {projectTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {specialtyLabels[template.specialty]} · {template.name}
                </option>
              ))}
            </select>
          </label>
          {selectedTemplate && (
            <section className="stack template-preview" aria-label={copy('Предпросмотр шаблона')}>
              <h3 lang={locale}>{selectedTemplate.name}</h3>
              <p lang={locale}>{selectedTemplate.fields.description}</p>
              <p>
                <strong>{copy('Результат:')}</strong>{' '}
                <span lang={locale}>{selectedTemplate.fields.deliverables}</span>
              </p>
              <div>
                <strong>{copy('Критерии приёмки')}</strong>
                <ul>
                  {selectedTemplate.fields.acceptanceCriteria.split('\n').map((criterion) => (
                    <li key={criterion} lang={locale}>
                      {criterion}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="muted small-text">
                {copy('Пример трудоёмкости:')} {selectedTemplate.fields.estimatedHours}{' '}
                {copy(
                  'ч. Пересчитайте под свою задачу. Выбор шаблона ещё не меняет форму и не создаёт заказ.',
                )}
              </p>
              <button
                type="button"
                className="button secondary small"
                disabled={action.busy || leadBusy}
                onClick={() => applyTemplate(selectedTemplate)}
              >
                {copy('Заполнить пустые поля')}
              </button>
            </section>
          )}
          {templateMessage && (
            <p role="status">
              <MarketplaceMessage text={templateMessage} />
            </p>
          )}
        </section>
      )}
      <section className="panel form-section">
        <h2>{copy('01 · Что нужно сделать')}</h2>
        <div className="form-grid">
          <label className="field wide">
            {copy('Название задачи')}{' '}
            <input
              name="title"
              required
              minLength={10}
              maxLength={140}
              defaultValue={initial?.title ?? lead?.title}
              placeholder={copy('Например, подготовить таблицу учёта остатков')}
            />
          </label>
          <label className="field">
            {copy('Категория')}{' '}
            <select name="category" required defaultValue={initial?.category ?? ''}>
              <option value="" disabled>
                {copy('Выберите категорию')}
              </option>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {copy('Уровень исполнителя')}{' '}
            <select name="difficulty" defaultValue={initial?.difficulty ?? 'beginner_friendly'}>
              <option value="beginner_friendly">{copy('Подходит для первого опыта')}</option>
              <option value="intermediate">{copy('Нужен базовый опыт')}</option>
            </select>
          </label>
          <label className="field wide">
            {copy('Какую проблему решаем?')}{' '}
            <textarea
              name="problem"
              required
              minLength={20}
              maxLength={500}
              rows={2}
              defaultValue={initial?.problem ?? lead?.summary.slice(0, 500)}
              placeholder={copy('Коротко объясните, зачем нужна эта работа')}
            />
          </label>
          <label className="field wide">
            {copy('Описание и границы задачи')}{' '}
            <textarea
              name="description"
              required
              minLength={30}
              maxLength={10000}
              defaultValue={initial?.description ?? lead?.summary}
              placeholder={copy('Что уже есть, что входит в работу и что не входит?')}
            />
            <small>
              {copy(
                'Ограничьте объём. Не добавляйте персональные данные, пароли и выгрузки клиентских баз.',
              )}
            </small>
          </label>
          <label className="field wide">
            {copy('Ожидаемый результат')}{' '}
            <textarea
              name="deliverables"
              required
              minLength={15}
              maxLength={3000}
              defaultValue={initial?.deliverables}
              placeholder={copy('Какой конкретный результат вы хотите получить?')}
            />
          </label>
          <label className="field wide">
            {copy('Критерии приёмки')}{' '}
            <textarea
              name="acceptanceCriteria"
              required
              maxLength={5000}
              defaultValue={initial?.acceptanceCriteria.join('\n')}
              placeholder={copy(
                'Один проверяемый критерий на строку\nНапример: в таблице есть формулы расчёта остатков',
              )}
            />
            <small>
              {copy('По этим пунктам вы будете принимать результат и запрашивать правки.')}
            </small>
          </label>
          <label className="field wide">
            {copy('Навыки, через запятую')}{' '}
            <input
              name="skills"
              required
              maxLength={500}
              defaultValue={initial?.skills.join(', ')}
              placeholder={copy('Excel, работа с данными')}
            />
          </label>
        </div>
      </section>
      <section className="panel form-section">
        <h2>{copy('02 · Время, место и бюджет')}</h2>
        <div className="form-grid">
          <label className="field">
            {copy('Бюджет за весь результат, ₸')}{' '}
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
            <small>{copy('Положительная фиксированная сумма. Платёж — вне платформы.')}</small>
          </label>
          <label className="field">
            {copy('Ожидаемая трудоёмкость, часов')}{' '}
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
            {copy('Дедлайн')}{' '}
            <input
              name="dueAt"
              type="date"
              required
              defaultValue={inputDate(initial?.dueAt)}
              min={new Date().toISOString().slice(0, 10)}
            />
            <small>{copy('Конец выбранного дня, время Казахстана (UTC+5).')}</small>
          </label>
          <label className="field">
            {copy('Предпочтительные дни и время')}{' '}
            <input
              name="preferredTime"
              maxLength={300}
              defaultValue={initial?.preferredTime}
              placeholder={copy('Например, суббота, 10:00–14:00')}
            />
          </label>
          <label className="field">
            {copy('Формат')}{' '}
            <select name="mode" defaultValue={initial?.mode ?? 'remote'}>
              <option value="remote">{copy('Удалённо')}</option>
              <option value="onsite">{copy('Очно')}</option>
              <option value="hybrid">{copy('Гибридно')}</option>
            </select>
          </label>
          <label className="field">
            {copy('Город')}{' '}
            <input
              name="city"
              maxLength={100}
              defaultValue={initial?.city}
              placeholder={copy('Усть-Каменогорск')}
            />
            <small>{copy('Для очного/гибридного формата обязателен.')}</small>
          </label>
          <label className="field wide">
            {copy('Точная локация (закрытая)')}{' '}
            <input
              name="locationPrivate"
              maxLength={500}
              defaultValue={initial?.locationPrivate ?? ''}
              placeholder={copy('Адрес или инструкции, доступные после назначения')}
            />
            <small>
              {copy(
                'В каталоге точный адрес не показывается. Для очного формата укажите место встречи.',
              )}
            </small>
          </label>
          <label className="field wide">
            {copy('Контакт после назначения')}{' '}
            <input
              name="contactPrivate"
              required={!proposal}
              maxLength={300}
              defaultValue={initial?.contactPrivate ?? ''}
              placeholder={copy('Рабочий email или способ связи')}
            />
            <small>{copy('Виден только участникам заказа после согласования.')}</small>
          </label>
        </div>
      </section>
      <div className="alert warning">
        {copy(
          'Пилот для участников 18+. Не публикуйте неоплачиваемые коммерческие тестовые задания, опасные услуги и задачи с неограниченным объёмом.',
        )}
      </div>
      {lead && (
        <label className="check-row">
          <input name="leadConfirmation" type="checkbox" required />
          {copy(
            'Я являюсь заказчиком этой задачи и подтверждаю создание черновика с указанными мной бюджетом, результатом и критериями.',
          )}
        </label>
      )}
      <ActionFeedback error={leadError || action.error} success={action.success} />
      <div className="button-row">
        <button className="button" type="submit" disabled={action.busy || leadBusy}>
          {action.busy || leadBusy
            ? copy('Сохраняем…')
            : proposal
              ? copy('Предложить новую версию условий')
              : copy('Сохранить черновик')}
        </button>
        {!proposal && (
          <span className="muted small-text">{copy('Публикация — только после модерации')}</span>
        )}
      </div>
    </form>
  );
}
export function ProjectEditorScreen({ id, lead }: { id?: string; lead?: ProjectLead }) {
  const { locale, copy } = useMarketplaceCopy();
  const { data, error, loading, refresh } = useData('project', { id: id ?? '' }, Boolean(id));
  if (id && loading)
    return (
      <div className="page-shell narrow" lang={locale}>
        <LoadState />
      </div>
    );
  if (id && (error || !data))
    return (
      <div className="page-shell narrow" lang={locale}>
        <LoadState error={error} retry={refresh} />
      </div>
    );
  return (
    <div className="page-shell narrow" lang={locale}>
      <PageHeading
        eyebrow={copy('Кабинет заказчика')}
        title={id ? copy('Редактирование заказа') : copy('Новая задача для студента')}
      >
        {copy(
          'Опишите небольшой проект с конкретным результатом. Это поможет найти исполнителя и спокойно принять работу.',
        )}
      </PageHeading>
      {lead && (
        <div className="alert">
          {copy(
            'Запрос передан вам после ручного согласования. Проверьте и дополните описание; заказ ещё не создан.',
          )}
        </div>
      )}
      <ProjectForm initial={id ? data?.project : undefined} lead={lead} />
    </div>
  );
}
