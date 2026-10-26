import { WorkspaceScreen } from '@/components/workspace';
import { requireUser } from '@/lib/session';
export default async function WorkPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  return <WorkspaceScreen id={id} />;
}
