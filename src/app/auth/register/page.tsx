import { AuthForm } from '../auth-form';
import { config } from '@/lib/config';

export default function RegisterPage() {
  return (
    <AuthForm
      mode="register"
      localMode={config.localMode}
      googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
    />
  );
}
