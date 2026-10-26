import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
export default function ForbiddenPage() {
  return (
    <div className="page-shell narrow">
      <div className="panel empty-state">
        <ShieldAlert size={38} className="muted" />
        <p className="eyebrow">403 · Нет доступа</p>
        <h1>Для этого действия нужна другая роль</h1>
        <p className="muted">
          Проверьте, что вошли в нужный аккаунт. Рабочую роль исполнителя или заказчика можно
          добавить в профиле; административные права выдаёт владелец сервиса.
        </p>
        <div className="button-row">
          <Link className="button" href="/dashboard">
            В личный кабинет
          </Link>
          <Link className="button secondary" href="/onboarding">
            Настроить роли
          </Link>
        </div>
      </div>
    </div>
  );
}
