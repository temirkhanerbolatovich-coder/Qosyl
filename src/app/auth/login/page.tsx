import { AuthForm } from '../auth-form';
import { config } from '@/lib/config';

export default function LoginPage() {
  return <AuthForm mode="login" localMode={config.localMode} />;
}
