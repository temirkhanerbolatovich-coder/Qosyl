import { requireUser } from '@/lib/session';
import { ProfileForm } from './profile-form';
import { ProfileHeading } from '@/components/profile-heading';
import { ProfileAvatarEditor } from '@/components/profile-avatar';
import { ProfileSections } from '@/components/profile-sections';
import { PortfolioEditor } from '@/components/portfolio-cases';
import { db } from '@/lib/db';
import { ResumeBuilder } from '@/components/resume-builder';
import { readExperiences } from '@/lib/profile-details';
import { readProfileLinks } from '@/lib/profile-links';

export default async function ProfilePage() {
  const user = await requireUser();
  const confirmed = user.roles.includes('student')
    ? await db.portfolioRecord.findMany({
        where: {
          studentId: user.id,
          project: {
            assignedStudentId: user.id,
            status: { in: ['accepted', 'completed'] },
            events: { some: { action: 'acceptSubmission' } },
          },
        },
        select: {
          id: true,
          projectId: true,
          title: true,
          visibility: true,
          clientConsentAt: true,
          studentConsentAt: true,
          project: { select: { demo: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  return (
    <div className="container page-shell">
      <ProfileHeading />
      <ProfileSections
        profile={
          <>
            {user.roles.includes('student') && (
              <ProfileAvatarEditor userId={user.id} name={user.name} />
            )}
            <ProfileForm
              user={{
                id: user.id,
                name: user.name,
                email: user.email,
                roles: user.roles,
                demo: user.demo,
                studentProfile: user.studentProfile,
                clientProfile: user.clientProfile,
                externalWorks: user.externalWorks.map(({ title, description, url }) => ({
                  title,
                  description,
                  url,
                })),
              }}
            />
          </>
        }
        portfolio={
          user.roles.includes('student') ? (
            <PortfolioEditor
              userId={user.id}
              confirmed={confirmed.map((record) => ({
                id: record.id,
                projectId: record.projectId,
                title: record.title,
                demo: record.project.demo,
                published:
                  record.visibility !== 'private' &&
                  !!record.clientConsentAt &&
                  !!record.studentConsentAt,
              }))}
            />
          ) : (
            <p>Сначала сохраните профиль исполнителя.</p>
          )
        }
        resume={
          user.roles.includes('student') ? (
            <ResumeBuilder
              initial={{
                name: user.name,
                email: user.email,
                headline: user.studentProfile?.headline ?? '',
                city: user.studentProfile?.city ?? '',
                education: [user.studentProfile?.institution, user.studentProfile?.discipline]
                  .filter(Boolean)
                  .join(' — '),
                skills: (user.studentProfile?.skills ?? []).join(', '),
                languages: (user.studentProfile?.languages ?? []).join(', '),
                experience: readExperiences(user.studentProfile?.experiences)
                  .map((item) =>
                    [
                      `${item.role} — ${item.organisation}`,
                      [item.startMonth, item.endMonth].filter(Boolean).join(' — '),
                      item.tasks,
                      item.results,
                    ]
                      .filter(Boolean)
                      .join('\n'),
                  )
                  .join('\n\n'),
                projects: [
                  ...user.externalWorks.map((work) =>
                    [work.title, work.role, work.contribution || work.description, work.result]
                      .filter(Boolean)
                      .join('\n'),
                  ),
                  ...confirmed
                    .filter(
                      (work) =>
                        !work.project.demo &&
                        work.visibility !== 'private' &&
                        work.clientConsentAt &&
                        work.studentConsentAt,
                    )
                    .map((work) => work.title),
                ].join('\n\n'),
                links: readProfileLinks(user.studentProfile?.profileLinks)
                  .map((link) => link.url)
                  .join('\n'),
              }}
            />
          ) : undefined
        }
      />
    </div>
  );
}
