import type { Locale } from './locale';
import { categoryLabels, modeLabels, statusLabels, paymentLabels, eventLabels } from './labels';

const categoryLabelsKk: Record<string, string> = {
  design: 'Дизайн',
  spreadsheets: 'Кестелер және Excel',
  analytics: 'Талдау',
  writing: 'Мәтіндер',
  it: 'IT және әзірлеу',
  admin: 'Әкімшілік көмек',
  smm: 'SMM және контент',
};
const modeLabelsKk: Record<string, string> = {
  remote: 'Қашықтан',
  onsite: 'Офлайн',
  hybrid: 'Аралас',
};
const statusLabelsKk: Record<string, string> = {
  draft: 'Жоба нұсқасы',
  pending_moderation: 'Модерацияда',
  published: 'Өтінімдер қабылданады',
  paused: 'Уақытша тоқтатылған',
  assigned: 'Шарттарды келісу',
  in_progress: 'Орындалып жатыр',
  submitted: 'Қабылдауды күтуде',
  changes_requested: 'Түзету қажет',
  accepted: 'Нәтиже қабылданды',
  completed: 'Аяқталған',
  cancelled: 'Бас тартылған',
  disputed: 'Дау ашылған',
  expired: 'Мерзімі өткен',
  pending: 'Шешімді күтуде',
  selected: 'Сіз таңдалдыңыз',
  not_selected: 'Таңдалмады',
  rejected: 'Таңдалмады',
  withdrawn: 'Өтінім қайтарылды',
  active: 'Белсенді',
};

/** UI labels vary by locale; persisted category/status values remain unchanged. */
export const localizedCategoryLabels = (locale: Locale) =>
  locale === 'kk' ? categoryLabelsKk : categoryLabels;
export const localizedModeLabels = (locale: Locale) =>
  locale === 'kk' ? modeLabelsKk : modeLabels;
export const localizedStatusLabels = (locale: Locale) =>
  locale === 'kk' ? statusLabelsKk : statusLabels;

const paymentLabelsKk: Record<string, string> = {
  not_reported: 'Төлем әлі белгіленбеген',
  reported_paid_by_client: 'Тапсырыс беруші төлем туралы хабарлады',
  confirmed_received_by_student: 'Орындаушы төлемді алғанын растады',
  disputed: 'Төлемге дау айтылған',
};
const eventLabelsKk: Record<string, string> = {
  project_expired: 'Жариялау мерзімі автоматты аяқталды',
  createProject: 'Жоба нұсқасы жасалды',
  updateProject: 'Тапсырыс өзгерді; қайта модерация қажет',
  submitForModeration: 'Тапсырыс модерацияға жіберілді',
  moderateProject: 'Модератор тапсырысты қарады',
  applyToProject: 'Өтінім алынды',
  updateApplication: 'Өтінім жаңартылды',
  withdrawApplication: 'Өтінім қайтарылды',
  selectApplicant: 'Орындаушы таңдалды',
  approveAgreement: 'Қатысушы шарт нұсқасын растады',
  proposeAgreement: 'Шарттардың жаңа нұсқасы ұсынылды',
  work_started: 'Екі тарап шарттарды растады; жұмыс басталды',
  toggleMilestone: 'Тексеру тізімі жаңартылды',
  submitDeliverable: 'Нәтиже қабылдауға жіберілді',
  requestChanges: 'Тапсырыс беруші түзетулер сұрады',
  acceptSubmission: 'Тапсырыс беруші нәтижені қабылдады',
  acknowledgePayment: 'Қатысушы төлем туралы мәлімдемесін жаңартты',
  closeProject: 'Тапсырысты жабу расталды',
  setPortfolio: 'Портфолионың жаңа нұсқасы дайындалды',
  consentPortfolio: 'Қатысушы портфолионың көрінуін келісті',
  createReview: 'Қатысушы пікір қалдырды',
  cancelProject: 'Тапсырыстан себебін көрсетіп бас тартылды',
  disputeProject: 'Тапсырыс бойынша дау ашылды',
  pauseProject: 'Жариялау тоқтатылды',
  fileComplaint: 'Модераторға өтініш жіберілді',
  project_created: 'Жоба нұсқасы жасалды',
  submitted_for_moderation: 'Тапсырыс модерацияға жіберілді',
  project_published: 'Тапсырыс жарияланды',
  project_approved: 'Тапсырыс мақұлданды',
  project_rejected: 'Тапсырыс түзетуге қайтарылды',
  applied: 'Өтінім алынды',
  applicant_selected: 'Орындаушы таңдалды',
  agreement_approved: 'Шарттар расталды',
  agreement_proposed: 'Шарттардың жаңа нұсқасы ұсынылды',
  project_started: 'Жұмыс басталды',
  deliverable_submitted: 'Нәтиже тексеруге жіберілді',
  changes_requested: 'Тапсырыс беруші түзетулер сұрады',
  submission_accepted: 'Нәтиже қабылданды',
  payment_acknowledged: 'Төлем туралы мәлімдеме жаңартылды',
  project_closed: 'Жабу расталды',
  project_completed: 'Екі тарап тапсырысты жапты',
  portfolio_updated: 'Портфолио жазбасы жаңартылды',
  portfolio_consented: 'Портфолионың көрінуі келісілді',
  review_created: 'Пікір қалдырылды',
  project_cancelled: 'Тапсырыстан бас тартылды',
  project_disputed: 'Дау ашылды',
  milestone_toggled: 'Тексеру тізімі жаңартылды',
  project_updated: 'Жоба нұсқасы өзгертілді',
  complaint_filed: 'Шағым жіберілді',
  project_paused: 'Жариялау тоқтатылды',
};
export const localizedPaymentLabels = (locale: Locale) =>
  locale === 'kk' ? paymentLabelsKk : paymentLabels;
export const localizedEventLabels = (locale: Locale) =>
  locale === 'kk' ? eventLabelsKk : eventLabels;
