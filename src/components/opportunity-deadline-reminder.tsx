'use client';
import { useId } from 'react';
import type { OpportunityReminderDays } from '@/lib/opportunity-saved';
import type { OpportunitySavedState } from './opportunity-saved-state';
import { useI18n } from './locale-provider';

/** Opt-in reminder before a confirmed deadline; it is only offered when a deadline is known. */
export function OpportunityDeadlineReminder({
  favoriteId,
  current,
  saved,
}: {
  favoriteId: string;
  current: OpportunityReminderDays | null;
  saved: OpportunitySavedState;
}) {
  const { locale, t } = useI18n();
  const descriptionId = useId();
  return (
    <div lang={locale} className="stack">
      <label className="field">
        {t('Напомнить о сроке подачи', 'Өтінім мерзімін еске салу')}
        <select
          value={current ?? ''}
          disabled={saved.loading || saved.busy || saved.accessExpired}
          aria-describedby={descriptionId}
          onChange={(event) =>
            void saved.mutate({
              action: 'setFavoriteReminder',
              favoriteId,
              daysBefore: event.target.value
                ? (Number(event.target.value) as OpportunityReminderDays)
                : null,
            })
          }
        >
          <option value="">{t('Не напоминать', 'Еске салмау')}</option>
          <option value="1">{t('За 1 день', '1 күн бұрын')}</option>
          <option value="3">{t('За 3 дня', '3 күн бұрын')}</option>
          <option value="7">{t('За 7 дней', '7 күн бұрын')}</option>
        </select>
      </label>
      <p id={descriptionId} className="muted small-text">
        {t(
          'Напоминание придёт в уведомления Qosyl один раз, пока запущена фоновая проверка. Срок на сайте организатора может измениться — проверяйте его.',
          'Еске салу Qosyl хабарламаларына бір рет келеді, фондық тексеру жұмыс істеп тұрғанда. Ұйымдастырушы сайтындағы мерзім өзгеруі мүмкін — оны тексеріңіз.',
        )}
      </p>
    </div>
  );
}
