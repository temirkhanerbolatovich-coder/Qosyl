export const contentCategories = [
  'hackathon',
  'competition',
  'internship',
  'event',
  'grant',
  'scholarship',
  'training',
  'news',
  'article',
  'other',
] as const;
export const specialtyLabels = {
  it: 'IT и цифровые технологии',
  engineering: 'Инженерия и строительство',
  business: 'Экономика, бизнес и право',
  education: 'Педагогика',
  health: 'Медицина и здоровье',
  humanities: 'Языки, культура, дизайн и медиа',
  agriculture: 'Сельское хозяйство',
  services: 'Туризм и сервис',
} as const;
export const specialtyTerms: Record<keyof typeof specialtyLabels, string[]> = {
  it: [
    'программир',
    'программист',
    'программное обеспеч',
    'искусственн',
    'разработ',
    'цифров',
    'coding',
    'digital',
    'хакатон',
    'бағдарламалау',
    'жасанды интеллект',
  ],
  engineering: [
    'инженер',
    'строител',
    'технолог',
    'energy',
    'industry',
    'physics',
    'өнеркәсіп',
    'инженерлік',
    'құрылыс',
    'техникалық',
    'technical',
    'энергетик',
  ],
  business: [
    'эконом',
    'бизнес',
    'право',
    'юрист',
    'финанс',
    'предприним',
    'business',
    'law',
    'юриспруден',
    'құқық',
    'заңгер',
    'қаржы',
  ],
  education: ['педагог', 'учител', 'образован', 'education', 'оқыт', 'мұғалім'],
  health: ['медицин', 'здоров', 'врач', 'health', 'medicine', 'денсаулық'],
  humanities: [
    'культур',
    'дизайн',
    'медиа',
    'язык',
    'искусство',
    'искусства',
    'искусств ',
    'журналист',
    'creative',
    'culture',
    'өнер',
    'театр',
    'музык',
    'хореограф',
    'шығармашыл',
  ],
  agriculture: ['аграр', 'сельск', 'агроном', 'биолог', 'эколог', 'agriculture', 'ауыл'],
  services: [
    'туризм',
    'турист',
    'гостеприим',
    'гостиниц',
    'мейрамхана',
    'қонақүй',
    'tourism',
    'hospitality',
  ],
};
/** Directions whose stems appear in the text; the same keyword heuristic as the catalogue filter. */
export function opportunitySpecialties(text: string) {
  const folded = text.toLowerCase();
  return (Object.keys(specialtyTerms) as (keyof typeof specialtyLabels)[]).filter((key) =>
    specialtyTerms[key].some((term) => folded.includes(term)),
  );
}
/**
 * Editor-maintained groups of equivalent stems in RU/KK/EN. Only the catalogue search expands
 * them; saved-search notifications keep matching the exact text so old subscriptions do not change.
 */
export const searchSynonymGroups: string[][] = [
  ['стажиров', 'практик', 'тағылымдам', 'internship'],
  ['стипенди', 'шәкіртақы', 'scholarship'],
  ['грант', 'grant'],
  ['конкурс', 'байқау', 'competition', 'contest'],
  ['хакатон', 'hackathon'],
  ['мероприят', 'іс-шара', 'event'],
  ['обучен', 'курс', 'оқыту', 'training', 'course'],
  ['разработ', 'программир', 'бағдарламалау', 'develop', 'software', 'coding'],
  ['дизайн', 'design', 'ui/ux'],
  ['медицин', 'денсаулық', 'здоров', 'medic', 'health'],
  ['волонт', 'еріктілер', 'volunteer'],
  ['удалённ', 'удаленн', 'қашықтан', 'remote'],
];
/** A query matches a stem when it is a prefix of it, or extends it by at most a short ending. */
export function matchesSearchTerm(query: string, term: string) {
  const q = query.trim().toLowerCase();
  return (
    (q.length >= 3 && term.startsWith(q)) || (q.startsWith(term) && q.length - term.length <= 4)
  );
}
/** The typed text first, then every stem of each synonym group it belongs to. */
export function expandSearchTerms(query: string) {
  const terms = new Set([query.trim().toLowerCase()]);
  for (const group of searchSynonymGroups)
    if (group.some((term) => matchesSearchTerm(query, term)))
      for (const term of group) terms.add(term);
  return [...terms].filter(Boolean);
}
/** Stems that make a type suggestion appear while typing. */
export const categorySearchTerms: Partial<Record<(typeof contentCategories)[number], string[]>> = {
  internship: searchSynonymGroups[0],
  scholarship: searchSynonymGroups[1],
  grant: searchSynonymGroups[2],
  competition: searchSynonymGroups[3],
  hackathon: searchSynonymGroups[4],
  event: searchSynonymGroups[5],
  training: searchSynonymGroups[6],
};
export const opportunityCategoryLabels: Record<string, string> = {
  hackathon: 'Хакатон',
  competition: 'Конкурс',
  internship: 'Стажировка / практика',
  event: 'Мероприятие',
  grant: 'Грант',
  scholarship: 'Стипендия',
  training: 'Обучение',
  news: 'Новость',
  article: 'Статья',
  other: 'Требует классификации',
};
