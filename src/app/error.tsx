'use client';
import { useMarketplaceCopy } from '@/components/marketplace-copy';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale, copy } = useMarketplaceCopy();
  return (
    <div lang={locale} className="page-shell narrow">
      <div className="panel empty-state">
        <AlertCircle size={36} className="muted" />
        <h1>{copy('Сервис временно недоступен')}</h1>
        <p className="muted">
          {copy(
            'Не удалось завершить загрузку. Проверьте соединение и повторите попытку. Если вы отправляли изменение, сначала проверьте его статус.',
          )}
        </p>
        <div className="button-row">
          <button className="button" onClick={reset}>
            {copy('Попробовать ещё раз')}
          </button>
          <Link className="button secondary" href="/">
            {copy('На главную')}
          </Link>
        </div>
      </div>
    </div>
  );
}
