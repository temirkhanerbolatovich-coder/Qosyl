export const categoryLabels: Record<string, string> = {
  design: 'Дизайн',
  spreadsheets: 'Таблицы и Excel',
  analytics: 'Аналитика',
  writing: 'Тексты',
  it: 'IT и разработка',
  admin: 'Административная помощь',
  smm: 'SMM и контент',
};
export const modeLabels: Record<string, string> = {
  remote: 'Удалённо',
  onsite: 'Очно',
  hybrid: 'Гибридно',
};
export const statusLabels: Record<string, string> = {
  draft: 'Черновик',
  pending_moderation: 'На модерации',
  published: 'Открыт для откликов',
  paused: 'Приостановлен',
  assigned: 'Согласование условий',
  in_progress: 'В работе',
  submitted: 'На приёмке',
  changes_requested: 'Нужны правки',
  accepted: 'Результат принят',
  completed: 'Завершён',
  cancelled: 'Отменён',
  disputed: 'Открыт спор',
  expired: 'Срок истёк',
  pending: 'Ожидает решения',
  selected: 'Вы выбраны',
  not_selected: 'Не выбран',
  rejected: 'Не выбран',
  withdrawn: 'Отклик отозван',
  active: 'Активен',
};
export const paymentLabels: Record<string, string> = {
  not_reported: 'Оплата ещё не отмечена',
  reported_paid_by_client: 'Заказчик сообщил об оплате',
  confirmed_received_by_student: 'Исполнитель подтвердил получение',
  disputed: 'Оплата оспаривается',
};
export const eventLabels: Record<string, string> = {
  project_expired: 'Срок публикации истёк автоматически',
  createProject: 'Создан черновик',
  updateProject: 'Заказ изменён; нужна повторная модерация',
  submitForModeration: 'Заказ отправлен на модерацию',
  moderateProject: 'Модератор рассмотрел заказ',
  applyToProject: 'Получен отклик',
  updateApplication: 'Отклик обновлён',
  withdrawApplication: 'Отклик отозван',
  selectApplicant: 'Выбран исполнитель',
  approveAgreement: 'Участник подтвердил версию условий',
  proposeAgreement: 'Предложена новая версия условий',
  work_started: 'Обе стороны подтвердили условия; работа начата',
  toggleMilestone: 'Обновлён чек-лист',
  submitDeliverable: 'Результат передан на приёмку',
  requestChanges: 'Заказчик запросил правки',
  acceptSubmission: 'Заказчик принял результат',
  acknowledgePayment: 'Участник обновил заявление об оплате',
  closeProject: 'Подтверждено закрытие заказа',
  setPortfolio: 'Подготовлена новая версия портфолио',
  consentPortfolio: 'Участник согласовал видимость портфолио',
  createReview: 'Участник оставил отзыв',
  cancelProject: 'Заказ отменён с причиной',
  disputeProject: 'Открыт спор по заказу',
  pauseProject: 'Публикация приостановлена',
  fileComplaint: 'Модератору отправлено обращение',
  project_created: 'Создан черновик',
  submitted_for_moderation: 'Заказ отправлен на модерацию',
  project_published: 'Заказ опубликован',
  project_approved: 'Заказ одобрен',
  project_rejected: 'Заказ возвращён на доработку',
  applied: 'Получен отклик',
  applicant_selected: 'Выбран исполнитель',
  agreement_approved: 'Условия подтверждены',
  agreement_proposed: 'Предложена новая версия условий',
  project_started: 'Работа начата',
  deliverable_submitted: 'Результат передан на проверку',
  changes_requested: 'Заказчик запросил правки',
  submission_accepted: 'Результат принят',
  payment_acknowledged: 'Обновлено заявление об оплате',
  project_closed: 'Подтверждено закрытие',
  project_completed: 'Обе стороны закрыли заказ',
  portfolio_updated: 'Обновлена запись портфолио',
  portfolio_consented: 'Согласована видимость портфолио',
  review_created: 'Оставлен отзыв',
  project_cancelled: 'Заказ отменён',
  project_disputed: 'Открыт спор',
  milestone_toggled: 'Обновлён чек-лист',
  project_updated: 'Черновик изменён',
  complaint_filed: 'Отправлена жалоба',
  project_paused: 'Публикация приостановлена',
};
export function money(value: number) {
  return new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 0 }).format(value) + ' ₸';
}
export function date(value: string | Date | null | undefined, withTime = false) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-KZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Almaty',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(parsed);
}
export function lines(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);
}
