import { AuthForm } from '../auth-form';
import { config } from '@/lib/config';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ googleError?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      mode="login"
      localMode={config.localMode}
      googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
      googleError={Boolean(params.googleError)}
    />
  );
}
