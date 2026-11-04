'use client';
import { useMarketplaceCopy } from '@/components/marketplace-copy';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
export default function NotFound() {
  const { locale, copy } = useMarketplaceCopy();
  return (
    <div lang={locale} className="page-shell narrow">
      <div className="panel empty-state">
        <SearchX size={38} className="muted" />
        <p className="eyebrow">{copy('404 · Страница не найдена')}</p>
        <h1>{copy('Эта страница недоступна')}</h1>
        <p className="muted">
          {copy('Ссылка могла измениться или материал доступен только участникам заказа.')}
        </p>
        <Link className="button" href="/projects">
          {copy('Вернуться к проектам')}
        </Link>
      </div>
    </div>
  );
}
