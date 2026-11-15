import { AuthForm } from '../auth-form';
import { config } from '@/lib/config';
import { parseNext } from '@/lib/safe-next';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      mode="register"
      localMode={config.localMode}
      googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
      next={parseNext(params.next) ?? undefined}
    />
  );
}
