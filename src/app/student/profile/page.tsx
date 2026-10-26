import { requireUser } from '@/lib/session';
import { ProfileForm } from './profile-form';

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <div className="container page-shell">
      <span className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span>
      <h1>Профиль и настройки</h1>
      <p className="muted">Расскажите о себе и выберите, какие данные будут видны другим.</p>
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
    </div>
  );
}
