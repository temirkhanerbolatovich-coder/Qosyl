import { AuthForm } from '../auth-form';
import { config } from '@/lib/config';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const query = await searchParams;
  return (
    <AuthForm
      mode="reset"
      localMode={config.localMode}
      token={query.error ? undefined : query.token}
    />
  );
}
