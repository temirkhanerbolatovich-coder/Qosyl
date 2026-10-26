import { ProjectDetailScreen } from '@/components/project-detail';
export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDetailScreen id={id} />;
}
