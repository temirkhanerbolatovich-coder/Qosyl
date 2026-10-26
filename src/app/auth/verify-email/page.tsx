import { AuthForm } from '../auth-form';
import { config } from '@/lib/config';

export default function VerifyEmailPage() {
  return <AuthForm mode="verify" localMode={config.localMode} />;
}
