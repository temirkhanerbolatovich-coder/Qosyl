import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, Clock3, ExternalLink, MapPin, Star } from 'lucide-react';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { safePortfolioUrl } from '@/app/api/profile/schema';

export const dynamic = 'force-dynamic';

export default async function TalentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      demo: true,
      studentProfile: true,
      externalWorks: {
        select: { id: true, title: true, description: true, url: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (
    !person ||
    person.status !== 'active' ||
    !person.studentProfile?.isPublic ||
    (person.demo && !config.demoEnabled)
  )
    notFound();
  const profile = person.studentProfile;
  const confirmed = await db.portfolioRecord.findMany({
    where: {
      studentId: id,
      visibility: { in: ['public', 'redacted_public'] },
      clientConsentAt: { not: null },
      studentConsentAt: { not: null },
      project: {
        status: { in: ['accepted', 'completed'] },
        ...(config.demoEnabled ? {} : { demo: false }),
      },
    },
    select: {
      id: true,
      projectId: true,
      title: true,
      summary: true,
      role: true,
      skills: true,
      publicLinks: true,
      visibility: true,
      createdAt: true,
      project: { select: { demo: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const reviews = confirmed.length
    ? await db.review.findMany({
        where: { recipientId: id, projectId: { in: confirmed.map((record) => record.projectId) } },
        select: { id: true, projectId: true, rating: true, body: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  return (
    <div className="container page-shell public-profile">
      <Link href="/projects" className="muted">
        ← К каталогу заказов
      </Link>
      <section className="panel">
        <span className="eyebrow">ПРОФИЛЬ ИСПОЛНИТЕЛЯ</span>
        <h1>{person.name}</h1>
        {person.demo && <p className="badge">ДЕМО · Вымышленный профиль</p>}
        <div className="inline-actions muted">
          <span>
            <MapPin size={16} aria-hidden="true" /> {profile.city}
          </span>
          <span>
            <Clock3 size={16} aria-hidden="true" /> До {profile.weeklyHours} ч в неделю
          </span>
        </div>
        {profile.discipline && (
          <p>
            {profile.discipline}
            {profile.institution ? ` · ${profile.institution}` : ''}
          </p>
        )}
        <p style={{ whiteSpace: 'pre-wrap' }}>
          {profile.bio || 'Исполнитель пока не добавил описание.'}
        </p>
        <div className="inline-actions">
          {profile.skills.map((skill) => (
            <span className="badge" key={skill}>
              {skill}
            </span>
          ))}
        </div>
      </section>
      <section aria-labelledby="confirmed-work-heading">
        <h2 id="confirmed-work-heading" className="section-title">
          Опыт, подтверждённый заказчиком
        </h2>
        <p className="muted">
          Результат принят на платформе. Публичные сведения согласованы обеими сторонами. Это не
          подтверждение фактической оплаты.
        </p>
        {!confirmed.length && (
          <div className="panel">
            <p>Подтверждённых публичных проектов пока нет.</p>
            <p className="muted">Отсутствие опыта не мешает откликаться на первые заказы.</p>
          </div>
        )}
        {confirmed.map((record) => (
          <article key={record.id} className="panel">
            <span className="badge">
              <BadgeCheck size={15} aria-hidden="true" /> Подтверждено заказчиком · client-confirmed
            </span>
            {record.project.demo && <span className="badge">ДЕМО</span>}
            {record.visibility === 'redacted_public' && (
              <span className="badge">Обезличенный результат</span>
            )}
            <h3>{record.title}</h3>
            {record.role && <p>{record.role}</p>}
            <p style={{ whiteSpace: 'pre-wrap' }}>{record.summary}</p>
            <div className="inline-actions">
              {record.skills.map((skill) => (
                <span className="badge" key={skill}>
                  {skill}
                </span>
              ))}
            </div>
            <p className="muted">
              {new Intl.DateTimeFormat('ru-KZ', {
                timeZone: config.timeZone,
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }).format(record.createdAt)}
            </p>
            {record.visibility !== 'redacted_public' &&
              record.publicLinks
                .filter((url) => safePortfolioUrl.safeParse(url).success)
                .map((url, index) => (
                  <p key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer nofollow">
                      Публичный материал {index + 1} <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  </p>
                ))}
            {reviews
              .filter((review) => review.projectId === record.projectId)
              .map((review) => (
                <blockquote key={review.id}>
                  <p>
                    <Star size={15} aria-hidden="true" /> {review.rating}/5 · Отзыв заказчика после
                    приёмки
                  </p>
                  <p>{review.body}</p>
                </blockquote>
              ))}
          </article>
        ))}
      </section>
      <section aria-labelledby="external-work-heading">
        <h2 id="external-work-heading" className="section-title">
          Учебные и личные работы
        </h2>
        <p className="muted">Добавлены автором (self-reported), без проверки заказчиком.</p>
        {!person.externalWorks.length && (
          <div className="panel">Внешние работы пока не добавлены.</div>
        )}
        {person.externalWorks.map((work) => (
          <article className="panel" key={work.id}>
            <span className="badge">Добавлено автором</span>
            <h3>{work.title}</h3>
            <p>{work.description}</p>
            {safePortfolioUrl.safeParse(work.url).success && (
              <a href={work.url} target="_blank" rel="noopener noreferrer nofollow">
                Посмотреть работу <ExternalLink size={14} aria-hidden="true" />
              </a>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
