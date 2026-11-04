import { requireUser } from '@/lib/session';
import { ProfileForm } from './profile-form';
import { ProfileHeading } from '@/components/profile-heading';
import { ProfileAvatarEditor } from '@/components/profile-avatar';
import { ProfileSections } from '@/components/profile-sections';
import { PortfolioEditor } from '@/components/portfolio-cases';
import { db } from '@/lib/db';

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
      />
    </div>
  );
}
