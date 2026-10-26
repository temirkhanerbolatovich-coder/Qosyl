import { ProjectEditorScreen } from '@/components/project-form';
import { requireUser } from '@/lib/session';
import { notFound } from 'next/navigation';
import { queryLeadHandoff } from '@/server/leads/service';
import { AppError } from '@/lib/permissions';
export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string | string[] }>;
}) {
  const user = await requireUser('client');
  const { leadId } = await searchParams;
  if (leadId) {
    if (typeof leadId !== 'string' || leadId.length > 100) notFound();
    let lead: Awaited<ReturnType<typeof queryLeadHandoff>>;
    try {
      lead = await queryLeadHandoff(leadId, user);
    } catch (error) {
      if (error instanceof AppError && error.status === 404) notFound();
      throw error;
    }
    return (
      <ProjectEditorScreen
        lead={{ id: lead.id, version: lead.version, title: lead.title, summary: lead.summary }}
      />
    );
  }
  return <ProjectEditorScreen />;
}
