import { requireUser } from '@/lib/session';
import { ProfileForm } from '@/app/student/profile/profile-form';
import { ProfileHeading } from '@/components/profile-heading';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const user = await requireUser();
  const { role } = await searchParams;
  return (
    <div className="container page-shell">
      <ProfileHeading onboarding />
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
