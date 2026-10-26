import { ApplicantsScreen } from '@/components/applicants';
import { requireUser } from '@/lib/session';
export default async function ApplicantsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser('client');
  const { id } = await params;
  return <ApplicantsScreen id={id} />;
}
