import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { listSessions, type StudioSession } from '../lib/api';
import '../content-panel.css';

function when(ts?: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function SessionsPanel({
  currentId,
  onResume,
  onNew,
  onClose,
}: {
  currentId: string | null;
  onResume: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<StudioSession[] | null>(null);

  useEffect(() => {
    let alive = true;
    listSessions().then((s) => { if (alive) setSessions(s); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="cz-overlay open sp-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="sp" role="dialog" aria-label={t('conversations')}>
        <div className="sp-head">
          <h3>{t('conversations')}</h3>
          <button type="button" className="cz-close" onClick={onClose} aria-label={t('close')}>×</button>
        </div>
        <button type="button" className="sp-new" onClick={onNew}>＋ {t('newConversation')}</button>
        <div className="sp-list">
          {sessions === null ? (
            <div className="sp-empty">…</div>
          ) : sessions.length === 0 ? (
            <div className="sp-empty">{t('noConversations')}</div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`sp-item${s.id === currentId ? ' on' : ''}`}
                onClick={() => onResume(s.id)}
              >
                <span className="sp-title">{s.title || t('untitled')}</span>
                <span className="sp-meta">
                  {when(s.created_at)}
                  {s.ai_assist_count ? ' · ' + s.ai_assist_count + ' ' + t('exchanges') : ''}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
