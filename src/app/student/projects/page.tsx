import { DashboardScreen } from '@/components/dashboard';
import { requireUser } from '@/lib/session';
export default async function StudentProjectsPage() {
  await requireUser('student');
  return <DashboardScreen view="studentProjects" />;
}
