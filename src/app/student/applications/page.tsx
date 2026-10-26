import { DashboardScreen } from '@/components/dashboard';
import { requireUser } from '@/lib/session';
export default async function StudentApplicationsPage() {
  await requireUser('student');
  return <DashboardScreen view="applications" />;
}
