'use client';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page-shell narrow">
      <div className="panel empty-state">
        <AlertCircle size={36} className="muted" />
        <h1>Сервис временно недоступен</h1>
        <p className="muted">
          Не удалось завершить загрузку. Проверьте соединение и повторите попытку. Если вы
          отправляли изменение, сначала проверьте его статус.
        </p>
        <div className="button-row">
          <button className="button" onClick={reset}>
            Попробовать ещё раз
          </button>
          <Link className="button secondary" href="/">
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
