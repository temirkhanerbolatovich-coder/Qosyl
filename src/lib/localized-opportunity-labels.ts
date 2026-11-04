import { opportunityCategoryLabels, specialtyLabels } from './opportunity-search';

const categoryLabelsKk: Record<string, string> = {
  hackathon: 'Хакатон',
  competition: 'Байқау',
  internship: 'Тағылымдама / практика',
  event: 'Іс-шара',
  grant: 'Грант',
  scholarship: 'Стипендия',
  training: 'Оқу',
  news: 'Жаңалық',
  article: 'Мақала',
  other: 'Жіктеуді қажет етеді',
};
const specialtyLabelsKk: Record<keyof typeof specialtyLabels, string> = {
  it: 'IT және цифрлық технологиялар',
  engineering: 'Инженерия және құрылыс',
  business: 'Экономика, бизнес және құқық',
  education: 'Педагогика',
  health: 'Медицина және денсаулық',
  humanities: 'Тілдер, мәдениет, дизайн және медиа',
  agriculture: 'Ауыл шаруашылығы',
  services: 'Туризм және сервис',
};
export const localizedOpportunityCategoryLabels = (locale: 'ru' | 'kk') =>
  locale === 'kk' ? categoryLabelsKk : opportunityCategoryLabels;
export const localizedSpecialtyLabels = (locale: 'ru' | 'kk') =>
  locale === 'kk' ? specialtyLabelsKk : specialtyLabels;

/** The interface language does not translate or infer the original publication language. */
export function opportunityContentLanguage(language: string) {
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language) ? language : 'und';
}
