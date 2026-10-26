import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function main() {
  if (process.env.LOCAL_DEV_MODE !== 'true' || process.env.DEMO_ENABLED !== 'true')
    throw new Error('Seed разрешен только в явно включенной локальной демонстрации.');
  const url = new URL(process.env.DATABASE_URL!);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname))
    throw new Error('Seed запрещен для удаленной БД.');
  const file = path.join(process.cwd(), '.local', 'demo-accounts.json');
  mkdirSync(path.dirname(file), { recursive: true });
  const accounts = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as {
        password: string;
        student: string;
        client: string;
        admin: string;
        secondStudent: string;
      })
    : {
        password: `Demo-${randomBytes(12).toString('hex')}!`,
        student: 'student@demo.local',
        client: 'client@demo.local',
        admin: 'admin@demo.local',
        secondStudent: 'newcomer@demo.local',
      };
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  for (const [key, name, roles] of [
    ['student', 'ДЕМО · Алия', ['student']],
    ['secondStudent', 'ДЕМО · Данияр', ['student']],
    ['client', 'ДЕМО · Студия проектов', ['client']],
    ['admin', 'ДЕМО · Модератор', ['admin']],
  ] as const) {
    const email = accounts[key];
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) continue;
    const user = await db.user.create({
      data: {
        id: `demo-${key}`,
        email,
        name,
        emailVerified: true,
        demo: true,
        roles: [...roles],
        adultConfirmedAt: new Date(),
        termsAcceptedAt: new Date(),
      },
    });
    await db.account.create({
      data: {
        id: `demo-account-${key}`,
        accountId: user.id,
        providerId: 'credential',
        userId: user.id,
        password: await hashPassword(accounts.password),
      },
    });
    if (roles.includes('student' as never))
      await db.studentProfile.create({
        data: {
          userId: user.id,
          city: 'Усть-Каменогорск',
          discipline: 'Прикладные проекты',
          skills: ['Excel', 'Аналитика', 'Дизайн'],
          weeklyHours: 5,
          isPublic: true,
          bio: 'ДЕМО-профиль. Учусь и собираю опыт в небольших проектах.',
        },
      });
    if (key === 'client')
      await db.clientProfile.create({
        data: {
          userId: user.id,
          name: 'ДЕМО · Студия проектов',
          city: 'Усть-Каменогорск',
          industry: 'Демонстрационные задания',
          description: 'Все задания вымышлены для проверки платформы.',
          verificationStatus: 'pending',
        },
      });
  }
  const seeds = [
    {
      id: 'demo-design',
      title: 'Оформить меню для небольшой кофейни',
      category: 'design',
      skills: ['Figma', 'Типографика'],
      budgetKzt: 18000,
      estimatedHours: 5,
      mode: 'remote',
      problem: 'Нужно обновить понятное печатное меню.',
      deliverables: 'PDF меню на двух страницах и редактируемый исходник.',
    },
    {
      id: 'demo-excel',
      title: 'Собрать таблицу учета расходов студии',
      category: 'spreadsheets',
      skills: ['Excel', 'Формулы'],
      budgetKzt: 12000,
      estimatedHours: 4,
      mode: 'remote',
      problem: 'Расходы хранятся в разных таблицах.',
      deliverables: 'Обезличенный шаблон учета с формулами и инструкцией.',
    },
    {
      id: 'demo-analytics',
      title: 'Визуализировать открытые данные о городе',
      category: 'analytics',
      skills: ['Аналитика', 'Excel'],
      budgetKzt: 15000,
      estimatedHours: 5,
      mode: 'remote',
      problem: 'Нужна понятная сводка открытого набора данных.',
      deliverables: 'Три диаграммы, ссылки на открытые источники и краткие выводы.',
    },
    {
      id: 'demo-writing',
      title: 'Отредактировать тексты для каталога товаров',
      category: 'writing',
      skills: ['Редактура', 'Русский язык'],
      budgetKzt: 10000,
      estimatedHours: 3,
      mode: 'remote',
      problem: 'Пяти карточкам товаров не хватает ясных описаний.',
      deliverables: 'Пять отредактированных описаний по согласованному шаблону.',
    },
    {
      id: 'demo-it',
      title: 'Сверстать адаптивную страницу мероприятия',
      category: 'it',
      skills: ['HTML', 'CSS'],
      budgetKzt: 25000,
      estimatedHours: 8,
      mode: 'remote',
      problem: 'Для вымышленного события нужна доступная страница.',
      deliverables: 'Исходники HTML/CSS, инструкция запуска, работа на ширине 390 и1440px.',
    },
    {
      id: 'demo-smm',
      title: 'Подготовить пять публикаций для мастерской',
      category: 'smm',
      skills: ['SMM', 'Копирайтинг'],
      budgetKzt: 14000,
      estimatedHours: 5,
      mode: 'hybrid',
      problem: 'Мастерской нужен согласованный набор материалов.',
      deliverables: 'Пять текстов и простые визуальные заготовки без публикации в аккаунтах.',
    },
    {
      id: 'demo-admin',
      title: 'Составить опись материалов учебной мастерской',
      category: 'admin',
      skills: ['Таблицы', 'Внимательность'],
      budgetKzt: 9000,
      estimatedHours: 4,
      mode: 'onsite',
      problem: 'Нужно упорядочить материалы по согласованному списку.',
      deliverables: 'Опись без персональных данных и перечень отсутствующих материалов.',
    },
    {
      id: 'demo-oxford',
      title: 'Помощь администратору с обработкой CRM и подготовкой отчёта',
      category: 'admin',
      skills: ['Excel', 'Внимательность'],
      budgetKzt: 8000,
      estimatedHours: 4,
      mode: 'onsite',
      problem:
        'Oxford Team — предварительно обсужденная гипотеза, не подтвержденная сделка и не партнерство.',
      deliverables:
        'Обезличенный итоговый отчет: количество записей по категориям, необходимые действия, конфликты и вопросы администратору. Никаких фамилий и телефонов.',
    },
  ];
  for (const item of seeds) {
    const oxford = item.id === 'demo-oxford';
    const dueAt = new Date(Date.now() + 14 * 86400000);
    await db.project.upsert({
      where: { id: item.id },
      update: {},
      create: {
        ...item,
        title: `ДЕМО: ${item.title}`,
        clientId: 'demo-client',
        demo: true,
        demoApplicationsAllowed: !oxford,
        status: 'published',
        difficulty: 'beginner_friendly',
        city: item.mode === 'remote' ? '' : 'Усть-Каменогорск',
        description: oxford
          ? 'Работа в филиале вместе с уполномоченным администратором, 3–4 часа. Доступ к CRM только с разрешения организации и под контролем администратора. Данные остаются в системе заказчика. Запрещены выгрузки CRM, имена, телефоны, сведения о детях, фото экрана и личные копии. Никаких изменений расписания и рассылок без разрешения. Пример не подтверждает размещение реального заказа.'
          : 'Демонстрационный пример ограниченного по результату микропроекта. Уточните объем, подготовьте результат и проверьте его по заранее согласованным критериям. Это не реальный заказ.',
        acceptanceCriteria: oxford
          ? [
              'Согласованный объем обработан',
              'Статусы непротиворечивы',
              'Рекомендации понятны администратору',
              'Данные не вынесены за пределы системы',
            ]
          : [
              'Согласованный объем выполнен',
              'Результат соответствует описанию и доступен по ссылке',
              'Инструкция и исходники переданы без чужих персональных данных',
            ],
        preferredTime: oxford ? 'Суббота или воскресенье, 3–4 часа' : 'По договоренности',
        dueAt,
        expiresAt: dueAt,
        publishedAt: new Date(),
      },
    });
  }
  console.log(
    'Seed: 4 локальных ДЕМО-аккаунта, 8 ДЕМО-заказов. Oxford: отклики выключены. Учетные данные в .local/demo-accounts.json.',
  );
}
main().finally(() => db.$disconnect());
