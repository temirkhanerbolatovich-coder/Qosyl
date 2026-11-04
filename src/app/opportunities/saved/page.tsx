import { requireUser } from '@/lib/session';
import { OpportunitySavedScreen } from '@/components/opportunity-saved-screen';
export default async function SavedOpportunitiesPage() {
  await requireUser();
  return <OpportunitySavedScreen />;
}
