'use client';
import { useId, useState } from 'react';
import type { OpportunitySavedData } from '@/contracts/opportunity-saved';
import { date } from '@/lib/labels';
import type { OpportunitySavedState } from './opportunity-saved-state';
import { useI18n } from './locale-provider';

type SavedSearch = OpportunitySavedData['searches'][number];
type Frequency = SavedSearch['notificationFrequency'];

export function OpportunitySearchNotificationControls({
  search,
  saved,
}: {
  search: SavedSearch;
  saved: OpportunitySavedState;
}) {
  const { locale, t } = useI18n();
  const descriptionId = useId();
  // An unsaved selection belongs to the form; refreshing the private list must not discard it.
  const [draft, setDraft] = useState<Frequency | null>(null);
  const frequency = draft ?? search.notificationFrequency;
  const disabled = saved.loading || saved.busy || saved.accessExpired;
  return (
    <form
      lang={locale}
      className="stack"
      aria-label={`${t('Настройки уведомлений:', 'Хабарлама баптаулары:')} ${search.name}`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          await saved.mutate({
            action: 'setSearchNotifications',
            searchId: search.id,
            frequency,
          })
        )
          setDraft(null);
      }}
    >
      <label className="field">
        {t('Уведомления в Qosyl', 'Qosyl хабарламалары')}
        <select
          name="notificationFrequency"
          value={frequency}
          disabled={disabled}
          aria-describedby={descriptionId}
          onChange={(event) => setDraft(event.target.value as Frequency)}
        >
          <option value="off">{t('Выключены', 'Өшірулі')}</option>
          <option value="daily">{t('Раз в 24 часа', '24 сағатта бір рет')}</option>
          <option value="weekly">{t('Раз в 7 дней', '7 күнде бір рет')}</option>
        </select>
      </label>
      <p id={descriptionId} className="muted small-text">
        {t(
          'Новые совпадения появятся в уведомлениях Qosyl. Уже опубликованные материалы при включении не отправляются. Отсчёт начинается после сохранения частоты; проверка работает, пока Qosyl запущен локально.',
          'Жаңа сәйкестіктер Qosyl хабарламаларында пайда болады. Қосу сәтінде жарияланған материалдар жіберілмейді. Уақыт жиілік сақталғаннан кейін есептеледі; тексеру Qosyl жергілікті түрде іске қосылып тұрғанда жұмыс істейді.',
        )}
      </p>
      <p className="small-text">
        {search.notificationFrequency === 'off'
          ? t('Сейчас уведомления выключены.', 'Қазір хабарламалар өшірулі.')
          : search.nextNotificationAt
            ? t(
                `Следующая проверка не раньше ${date(search.nextNotificationAt, true, locale)}.`,
                `Келесі тексеру ${date(search.nextNotificationAt, true, locale)} уақытынан ерте болмайды.`,
              )
            : t(
                'Время следующей проверки пока недоступно.',
                'Келесі тексеру уақыты әзірше белгісіз.',
              )}
      </p>
      <div className="button-row">
        <button
          type="submit"
          className="button secondary"
          disabled={disabled || frequency === search.notificationFrequency}
        >
          {t('Сохранить уведомления', 'Хабарламаларды сақтау')}
        </button>
      </div>
    </form>
  );
}
