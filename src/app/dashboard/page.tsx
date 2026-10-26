import { DashboardScreen } from '@/components/dashboard';
import { requireUser } from '@/lib/session';
export default async function DashboardPage() {
  await requireUser();
  return <DashboardScreen />;
}
