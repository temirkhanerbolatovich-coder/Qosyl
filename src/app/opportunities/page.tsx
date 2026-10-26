import { Opportunities } from '@/components/opportunities';
export default function OpportunitiesPage() {
  return (
    <div className="page-shell">
      <h1>Возможности для студентов всех специальностей</h1>
      <Opportunities catalogue />
    </div>
  );
}
