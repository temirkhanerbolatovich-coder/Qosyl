import { publicCaseWhere, caseOrder } from '@/lib/portfolio-case';
import { PortfolioCaseCard } from '@/components/portfolio-cases';
import {
  MarketplaceText,
  MarketplaceSurface,
  MarketplaceDate,
  MarketplaceWeeklyHours,
} from '@/components/marketplace-copy';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, Clock3, ExternalLink, MapPin, Star } from 'lucide-react';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { safePortfolioUrl } from '@/app/api/profile/schema';
import { publicExperiences } from '@/lib/profile-details';
import { ProfileExperience } from '@/components/profile-experience';
import { PublicProfileLinks } from '@/components/profile-links';
import { publicProfileLinks } from '@/lib/profile-links';
import { visibleStudentProfile } from '@/lib/profile-visibility';
import { ProfileAvatarImage } from '@/components/profile-avatar';
import { avatarUrl } from '@/lib/avatar';

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
      avatar: { select: { revision: true, isPublic: true } },
      externalWorks: {
        where: publicCaseWhere,
        orderBy: caseOrder,
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
  const profile = visibleStudentProfile(person.studentProfile);
  const confirmed = await db.portfolioRecord.findMany({
    where: {
      studentId: id,
      visibility: { in: ['public', 'redacted_public'] },
      clientConsentAt: { not: null },
      studentConsentAt: { not: null },
      project: {
        status: { in: ['accepted', 'completed'] },
        assignedStudentId: id,
        events: { some: { action: 'acceptSubmission' } },
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
    <MarketplaceSurface className="container page-shell public-profile">
      <Link href="/projects" className="muted">
        <MarketplaceText text={'← К каталогу заказов'} />
      </Link>
      <section className="panel">
        <span className="eyebrow">
          <MarketplaceText text={'ПРОФИЛЬ ИСПОЛНИТЕЛЯ'} />
        </span>
        <h1>
          <ProfileAvatarImage
            name={person.name}
            url={person.avatar?.isPublic ? avatarUrl(person.id, person.avatar.revision) : undefined}
          />
          <span lang="und">{person.name}</span>
        </h1>
        {profile.headline && <p lang="und">{profile.headline}</p>}
        {person.demo && (
          <p className="badge">
            <MarketplaceText text={'ДЕМО · Вымышленный профиль'} />
          </p>
        )}
        <div className="inline-actions muted">
          {profile.city && (
            <span>
              <MapPin size={16} aria-hidden="true" /> <span lang="und">{profile.city}</span>
            </span>
          )}
          <span>
            <Clock3 size={16} aria-hidden="true" />{' '}
            <MarketplaceWeeklyHours hours={profile.weeklyHours} />
          </span>
        </div>
        {profile.discipline && (
          <p>
            <span lang="und">{profile.discipline}</span>
            {profile.institution ? <span lang="und">{` · ${profile.institution}`}</span> : ''}
          </p>
        )}
        <p style={{ whiteSpace: 'pre-wrap' }}>
          {profile.bio ? (
            <span lang="und">{profile.bio}</span>
          ) : (
            <MarketplaceText text={'Исполнитель пока не добавил описание.'} />
          )}
        </p>
        <div className="inline-actions">
          {profile.skills.map((skill) => (
            <span className="badge" key={skill}>
              <span lang="und">{skill}</span>
            </span>
          ))}
        </div>
      </section>
      <ProfileExperience
        items={publicExperiences(profile.experiences, profile.isPublic)}
        studyYear={profile.studyYear}
        languages={profile.languages}
      />
      <section aria-labelledby="confirmed-work-heading">
        <PublicProfileLinks links={publicProfileLinks(profile.profileLinks, profile.isPublic)} />
        <h2 id="confirmed-work-heading" className="section-title">
          <MarketplaceText text={'Опыт, подтверждённый заказчиком'} />
        </h2>
        <p className="muted">
          <MarketplaceText
            text={
              'Результат принят на платформе. Публичные сведения согласованы обеими сторонами. Это не подтверждение фактической оплаты.'
            }
          />
        </p>
        {!confirmed.length && (
          <div className="panel">
            <p>
              <MarketplaceText text={'Подтверждённых публичных проектов пока нет.'} />
            </p>
            <p className="muted">
              <MarketplaceText text={'Отсутствие опыта не мешает откликаться на первые заказы.'} />
            </p>
          </div>
        )}
        {confirmed.map((record) => (
          <article key={record.id} className="panel">
            <span className="badge">
              <BadgeCheck size={15} aria-hidden="true" />{' '}
              <MarketplaceText text={'Выполнено на Qosyl · platform_verified'} />
            </span>
            {record.project.demo && (
              <span className="badge">
                <MarketplaceText text={'ДЕМО'} />
              </span>
            )}
            {record.visibility === 'redacted_public' && (
              <span className="badge">
                <MarketplaceText text={'Обезличенный результат'} />
              </span>
            )}
            <h3>
              <span lang="und">{record.title}</span>
            </h3>
            {record.role && (
              <p>
                <span lang="und">{record.role}</span>
              </p>
            )}
            <p style={{ whiteSpace: 'pre-wrap' }}>
              <span lang="und">{record.summary}</span>
            </p>
            <div className="inline-actions">
              {record.skills.map((skill) => (
                <span className="badge" key={skill}>
                  <span lang="und">{skill}</span>
                </span>
              ))}
            </div>
            <p className="muted">
              <MarketplaceDate value={record.createdAt.toISOString()} timeZone={config.timeZone} />
            </p>
            {record.visibility !== 'redacted_public' &&
              record.publicLinks
                .filter((url) => safePortfolioUrl.safeParse(url).success)
                .map((url, index) => (
                  <p key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer nofollow">
                      <MarketplaceText text={'Публичный материал'} /> {index + 1}{' '}
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  </p>
                ))}
            {reviews
              .filter((review) => review.projectId === record.projectId)
              .map((review) => (
                <blockquote key={review.id}>
                  <p>
                    <Star size={15} aria-hidden="true" /> {review.rating}
                    <MarketplaceText text={'/5 · Отзыв заказчика после приёмки'} />
                  </p>
                  <p>
                    <span lang="und">{review.body}</span>
                  </p>
                </blockquote>
              ))}
          </article>
        ))}
      </section>
      <section aria-labelledby="external-work-heading">
        <h2 id="external-work-heading" className="section-title">
          <MarketplaceText text={'Учебные и личные работы'} />
        </h2>
        <p className="muted">
          <MarketplaceText text={'Добавлены автором (self-reported), без проверки заказчиком.'} />
        </p>
        {!person.externalWorks.length && (
          <div className="panel">
            <MarketplaceText text={'Внешние работы пока не добавлены.'} />
          </div>
        )}
        {person.externalWorks.map((work) => (
          <PortfolioCaseCard key={work.id} item={work} />
        ))}
      </section>
    </MarketplaceSurface>
  );
}
