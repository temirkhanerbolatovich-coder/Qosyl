import { Suspense } from 'react';
import { CatalogScreen } from '@/components/catalog';
export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="page-shell">Загрузка каталога…</div>}>
      <CatalogScreen />
    </Suspense>
  );
}
