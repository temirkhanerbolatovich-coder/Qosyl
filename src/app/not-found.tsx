import Link from 'next/link';
import { SearchX } from 'lucide-react';
export default function NotFound() {
  return (
    <div className="page-shell narrow">
      <div className="panel empty-state">
        <SearchX size={38} className="muted" />
        <p className="eyebrow">404 · Страница не найдена</p>
        <h1>Эта страница недоступна</h1>
        <p className="muted">
          Ссылка могла измениться или материал доступен только участникам заказа.
        </p>
        <Link className="button" href="/projects">
          Вернуться к проектам
        </Link>
      </div>
    </div>
  );
}
