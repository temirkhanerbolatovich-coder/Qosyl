import { DashboardScreen } from '@/components/dashboard';
import { requireUser } from '@/lib/session';
export default async function ClientProjectsPage() {
  await requireUser('client');
  return <DashboardScreen view="clientProjects" />;
}
