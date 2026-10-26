import { AdminScreen } from '@/components/admin';
import { requireUser } from '@/lib/session';
export default async function AdminPage() {
  await requireUser('admin');
  return <AdminScreen />;
}
