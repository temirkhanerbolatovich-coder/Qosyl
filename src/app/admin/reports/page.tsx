import { AdminScreen } from '@/components/admin';
import { requireUser } from '@/lib/session';
export default async function AdminReportsPage() {
  await requireUser('admin');
  return <AdminScreen initialTab="reports" />;
}
