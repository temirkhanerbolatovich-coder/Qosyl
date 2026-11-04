const fieldNames: Readonly<Record<string, string>> = {
  title: 'Тапсырма атауы',
  problem: 'Мәселе',
  description: 'Сипаттама',
  deliverables: 'Нәтиже',
  acceptanceCriteria: 'Қабылдау өлшемдері',
  skills: 'Дағдылар',
  budgetKzt: 'Бюджет',
  estimatedHours: 'Еңбек көлемі',
  dueAt: 'Мерзім',
  city: 'Қала',
  contactPrivate: 'Байланыс',
  locationPrivate: 'Мекенжай',
  message: 'Хабарлама',
  reason: 'Себеп',
  notes: 'Ескертпе',
  links: 'Сілтемелер',
  category: 'Санат',
  difficulty: 'Деңгей',
  mode: 'Жұмыс форматы',
  attachmentIds: 'Файлдар',
  criteriaIndexes: 'Өлшемдер',
  publicLinks: 'Жария сілтемелер',
};

const enumMessages: Readonly<Record<string, string>> = {
  'category: Неверный вариант: ожидалось одно из "design"|"spreadsheets"|"analytics"|"writing"|"it"|"admin"|"smm"':
    'Санатты қолжетімді нұсқалардан таңдаңыз',
  'mode: Неверный вариант: ожидалось одно из "remote"|"onsite"|"hybrid"':
    'Жұмыс форматын қолжетімді нұсқалардан таңдаңыз',
  'difficulty: Неверный вариант: ожидалось одно из "beginner_friendly"|"intermediate"':
    'Деңгейді қолжетімді нұсқалардан таңдаңыз',
};
const arrayFields = new Set([
  'acceptanceCriteria',
  'skills',
  'links',
  'attachmentIds',
  'criteriaIndexes',
  'publicLinks',
]);

// Exact custom rules and paths from our schemas, including the project inside a lead handoff.
// Do not translate a matching phrase on another path or inside a user's explanation.
const specialMessages: Readonly<Record<string, string>> = {
  'dueAt: Срок должен быть в будущем.': 'Мерзім: Болашақ күнді көрсетіңіз.',
  'project.dueAt: Срок должен быть в будущем.': 'Тапсырма мерзімі: Болашақ күнді көрсетіңіз.',
  'city: Для очной работы укажите город.': 'Қала: Офлайн жұмыс үшін қаланы көрсетіңіз.',
  'project.city: Для очной работы укажите город.':
    'Тапсырма қаласы: Офлайн жұмыс үшін қаланы көрсетіңіз.',
  'links: Закрытые файлы выберите в списке вложений, чтобы сохранить их в истории сдачи.':
    'Сілтемелер: Жабық файлдар тапсыру тарихында сақталуы үшін оларды тіркемелер тізімінен таңдаңыз.',
  'attachmentIds: Добавьте от 1 до 5 результатов: HTTPS-ссылки или загруженные файлы.':
    'Файлдар: 1–5 нәтиже қосыңыз: HTTPS сілтемелері немесе жүктелген файлдар.',
  'attachmentIds: Не повторяйте файл в одной сдаче.':
    'Файлдар: Бір нәтижені тапсыру кезінде бір файлды қайталамаңыз.',
  'publicLinks: Закрытые вложения нельзя публиковать в портфолио.':
    'Жария сілтемелер: Жабық тіркемелерді портфолиода жариялауға болмайды.',
  ': Укажите объект жалобы.': 'Шағым нысанын көрсетіңіз.',
  'expiresAt: Срок актуальности должен быть в будущем, не дальше 90 дней.':
    'Өзектілік мерзімі: Алдағы 90 күн ішіндегі болашақ күнді көрсетіңіз.',
  'expiresAt: Укажите срок актуальности публикации.':
    'Өзектілік мерзімі: Жарияланымның өзектілік мерзімін көрсетіңіз.',
  'sourceUrl: Нужна HTTPS-ссылка без реквизитов и нестандартного порта.':
    'Дереккөз сілтемесі: Кіру деректерінсіз және стандартты емес портсыз HTTPS сілтемесі қажет.',
  'url: Нужна HTTPS-ссылка без реквизитов, фрагмента и нестандартного порта.':
    'Сілтеме: Кіру деректерінсіз, фрагментсіз және стандартты емес портсыз HTTPS сілтемесі қажет.',
  'feedUrl: Нужна HTTPS-ссылка без реквизитов, фрагмента и нестандартного порта.':
    'Жүктеу сілтемесі: Кіру деректерінсіз, фрагментсіз және стандартты емес портсыз HTTPS сілтемесі қажет.',
  'termsUrl: Нужна HTTPS-ссылка без реквизитов, фрагмента и нестандартного порта.':
    'Шарттар сілтемесі: Кіру деректерінсіз, фрагментсіз және стандартты емес портсыз HTTPS сілтемесі қажет.',
  'feedUrl: Для автоматического источника укажите URL ленты или страницы.':
    'Жүктеу сілтемесі: Автоматты дереккөз үшін лента немесе бет URL мекенжайын көрсетіңіз.',
  'feedUrl: Ручной источник не загружается из сети.':
    'Жүктеу сілтемесі: Қолмен енгізілетін дереккөз желіден жүктелмейді.',
  'allowedHost: Домен ленты должен точно совпадать с разрешённым доменом.':
    'Рұқсат етілген домен: Лента домені рұқсат етілген доменмен дәл сәйкес келуі керек.',
  'occurredAt: Дата расхода не может быть в будущем.':
    'Шығын күні: Шығын күні болашақта болмауы керек.',
  'amountKzt: Укажите время или денежный расход.':
    'Шығын: Жұмсалған уақытты немесе ақша шығынын көрсетіңіз.',
  'dueBefore: Укажите существующую дату YYYY-MM-DD или ISO datetime с часовым поясом.':
    'Мерзім сүзгісі: Нақты күнді YYYY-MM-DD пішімінде немесе уақыт белдеуі бар ISO datetime пішімінде көрсетіңіз.',
  'maxBudget: Максимальный бюджет меньше минимального.':
    'Ең жоғары бюджет: Ең төменгі бюджеттен кем болмауы керек.',
  'confirmation: Неверный ввод: ожидалось true':
    'Келісім: Тапсырманы орналастыру келісілгенін растаңыз.',
};

/** Translate only whole, known Zod messages and paths. Anything else stays original. */
export function kazakhValidationMessage(text: string): string | null {
  if (!text || text.length > 4000) return null;
  const parts = text.split('; ');
  if (parts.length > 30) return null;
  const translated: string[] = [];
  for (const part of parts) {
    if (Object.hasOwn(specialMessages, part)) {
      translated.push(specialMessages[part]);
      continue;
    }
    if (Object.hasOwn(enumMessages, part)) {
      translated.push(enumMessages[part]);
      continue;
    }
    const match = /^([A-Za-z]+)(?:\.(\d{1,3}))?: (.+)$/u.exec(part);
    if (!match || !Object.hasOwn(fieldNames, match[1])) return null;
    const [, field, index, detail] = match;
    if (index !== undefined && (!arrayFields.has(field) || Number(index) > 999)) return null;
    let result: string | undefined;
    const chars =
      /^Слишком маленькое значение: ожидалось, что string будет иметь >=(\d+) символ(?:а|ов)?$/u.exec(
        detail,
      );
    const maxChars =
      /^Слишком большое значение: ожидалось, что string будет иметь <=(\d+) символ(?:а|ов)?$/u.exec(
        detail,
      );
    const min = /^Слишком маленькое значение: ожидалось, что number будет >=(\d+)$/u.exec(detail);
    const max = /^Слишком большое значение: ожидалось, что number будет <=(\d+)$/u.exec(detail);
    const arrayMin =
      /^Слишком маленькое значение: ожидалось, что array будет иметь >=(\d+) элемент(?:а|ов)?$/u.exec(
        detail,
      );
    const arrayMax =
      /^Слишком большое значение: ожидалось, что array будет иметь <=(\d+) элемент(?:а|ов)?$/u.exec(
        detail,
      );
    if (
      (field === 'links' || field === 'publicLinks') &&
      detail === 'Используйте HTTPS-ссылку без логина и пароля.'
    )
      result = 'Логин мен құпиясөзсіз HTTPS сілтемесін пайдаланыңыз.';
    else if (chars) result = `Кемінде ${chars[1]} таңба енгізіңіз`;
    else if (maxChars) result = `Ең көбі ${maxChars[1]} таңба енгізіңіз`;
    else if (min) result = `Мән кемінде ${min[1]} болуы керек`;
    else if (max) result = `Мән ең көбі ${max[1]} болуы керек`;
    else if (arrayMin && index === undefined && arrayFields.has(field))
      result = `Кемінде ${arrayMin[1]} элемент қосыңыз`;
    else if (arrayMax && index === undefined && arrayFields.has(field))
      result = `Ең көбі ${arrayMax[1]} элемент қосыңыз`;
    else if (
      /^Неверный ввод: ожидалось (?:string|число|number|массив|array|date), получено (?:undefined|NaN|null)$/u.test(
        detail,
      )
    )
      result = 'Өрістің мәнін тексеріңіз';
    if (!result) return null;
    translated.push(
      `${fieldNames[field]}${index === undefined ? '' : ` (${Number(index) + 1})`}: ${result}`,
    );
  }
  return translated.join('; ');
}
