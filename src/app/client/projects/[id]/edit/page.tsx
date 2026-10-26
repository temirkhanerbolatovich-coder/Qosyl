import { ProjectEditorScreen } from '@/components/project-form';
import { requireUser } from '@/lib/session';
export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser('client');
  const { id } = await params;
  return <ProjectEditorScreen id={id} />;
}
