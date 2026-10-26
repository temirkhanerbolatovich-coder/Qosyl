import { AuthForm } from '../auth-form';
import { config } from '@/lib/config';

export default function RegisterPage() {
  return <AuthForm mode="register" localMode={config.localMode} />;
}
