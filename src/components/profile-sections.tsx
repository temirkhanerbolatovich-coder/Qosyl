'use client';
import { useState, type ReactNode } from 'react';
import { useI18n } from './locale-provider';
export function ProfileSections({
  profile,
  portfolio,
  resume,
}: {
  profile: ReactNode;
  portfolio: ReactNode;
  resume?: ReactNode;
}) {
  const [tab, setTab] = useState(0);
  const { t } = useI18n();
  return (
    <>
      <div
        role="tablist"
        aria-label={t('Разделы профиля', 'Профиль бөлімдері')}
        className="inline-actions"
      >
        {[
          t('Профиль', 'Профиль'),
          t('Портфолио', 'Портфолио'),
          ...(resume ? [t('Резюме', 'Түйіндеме')] : []),
        ].map((name, index, tabs) => (
          <button
            key={index}
            id={`profile-tab-${index}`}
            role="tab"
            aria-selected={tab === index}
            aria-controls={`profile-panel-${index}`}
            tabIndex={tab === index ? 0 : -1}
            className={tab === index ? 'button' : 'button secondary'}
            type="button"
            onClick={() => setTab(index)}
            onKeyDown={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : (tab + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                setTab(next);
                document.getElementById(`profile-tab-${next}`)?.focus();
              }
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div id="profile-panel-0" role="tabpanel" aria-labelledby="profile-tab-0" hidden={tab !== 0}>
        {profile}
      </div>
      <div id="profile-panel-1" role="tabpanel" aria-labelledby="profile-tab-1" hidden={tab !== 1}>
        {portfolio}
      </div>
      {resume && (
        <div
          id="profile-panel-2"
          role="tabpanel"
          aria-labelledby="profile-tab-2"
          hidden={tab !== 2}
        >
          {resume}
        </div>
      )}
    </>
  );
}
