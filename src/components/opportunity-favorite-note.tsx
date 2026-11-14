'use client';
import { useId, useState } from 'react';
import { opportunityNoteMax } from '@/lib/opportunity-saved';
import type { OpportunitySavedState } from './opportunity-saved-state';
import { useI18n } from './locale-provider';

/** A private note such as "prepare the portfolio"; only its owner ever receives it. */
export function OpportunityFavoriteNote({
  favoriteId,
  current,
  saved,
}: {
  favoriteId: string;
  current: string | null;
  saved: OpportunitySavedState;
}) {
  const { locale, t } = useI18n();
  const hintId = useId();
  // An unsaved draft belongs to this form; refreshing the private list must not discard it.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? current ?? '';
  const changed = text.trim() !== (current ?? '');
  const disabled = saved.loading || saved.busy || saved.accessExpired;
  return (
    <form
      lang={locale}
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await saved.mutate({ action: 'setFavoriteNote', favoriteId, note: text }))
          setDraft(null);
      }}
    >
      <label className="field">
        {t('Моя заметка', 'Менің жазбам')}
        <textarea
          rows={2}
          maxLength={opportunityNoteMax}
          value={text}
          disabled={disabled}
          aria-describedby={hintId}
          placeholder={t('Например: подготовить портфолио', 'Мысалы: портфолио дайындау')}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <p id={hintId} className="muted small-text">
        {t(
          `Видна только вам. До ${opportunityNoteMax} символов (${text.length}).`,
          `Тек өзіңізге көрінеді. ${opportunityNoteMax} таңбаға дейін (${text.length}).`,
        )}
      </p>
      <div className="button-row">
        <button type="submit" className="button secondary small" disabled={disabled || !changed}>
          {t('Сохранить заметку', 'Жазбаны сақтау')}
        </button>
      </div>
    </form>
  );
}
