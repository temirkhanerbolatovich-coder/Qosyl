import { requireUser } from '@/lib/session';
import { ProfileForm } from '@/app/student/profile/profile-form';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const user = await requireUser();
  const { role } = await searchParams;
  return (
    <div className="container page-shell">
      <span className="eyebrow">ДОБРО ПОЖАЛОВАТЬ</span>
      <h1>Начнём с вашего профиля</h1>
      <p className="muted">
        Для первого отклика не требуется опыт работы. Достаточно навыков и времени на задачу.
      </p>
      <ProfileForm
        onboarding
        preferredRole={role}
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
    </div>
  );
}
