import { AuthForm } from '../auth-form';
import { config } from '@/lib/config';

export default function ForgotPasswordPage() {
  return <AuthForm mode="forgot" localMode={config.localMode} />;
}
