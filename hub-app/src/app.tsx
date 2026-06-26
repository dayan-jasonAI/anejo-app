import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from './lib/i18n';
import { getMe, createSession, listSessions, loadSession } from './lib/api';
import type { ChatMessage } from './lib/useStudioStream';
import { Studio } from './components/Studio';
import { SessionsPanel } from './components/SessionsPanel';

export function App() {
  const { t, lang, toggle } = useI18n();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [booted, setBooted] = useState(false);

  // Start a fresh conversation (a new persisted session).
  const startNew = useCallback(async () => {
    const s = await createSession('Studio — ' + new Date().toISOString().slice(0, 10));
    if (s?.id) { setInitialMessages([]); setSessionId(s.id); }
    setShowSessions(false);
  }, []);

  // Reopen a past conversation and load its full transcript so work continues, not restarts.
  const resume = useCallback(async (id: string) => {
    const loaded = await loadSession(id);
    if (loaded) { setInitialMessages(loaded.messages); setSessionId(loaded.session.id); }
    setShowSessions(false);
  }, []);

  // On first authed load: pick up your most recent conversation; only start fresh if you have none.
  useEffect(() => {
    if (!me?.authed || booted) return;
    setBooted(true);
    listSessions().then((list) => {
      if (list && list.length) resume(list[0].id);
      else startNew();
    });
  }, [me?.authed, booted, resume, startNew]);

  const demo = me && !me.authed;

  return (
    <div className="app">
      <header className="topbar">
        <a className="hub-back" href="/hub/kitchen/">← HUB</a>
        <div className="brand">
          <span className="mark">AÑEJO</span>
          <span className="sub">{t('studio')}</span>
        </div>
        <span className="spacer" />
        {me?.authed ? (
          <button className="toggle sp-open" onClick={() => setShowSessions(true)} aria-label={t('conversations')}>
            🕘 <span className="sp-open-label">{t('conversations')}</span>
          </button>
        ) : null}
        {me?.authed ? <span className="who">{me.name || me.role}</span> : null}
        <button className="toggle" onClick={toggle} aria-label="Language">
          {lang === 'en' ? 'ES' : 'EN'}
        </button>
      </header>

      {demo ? <div className="demo-banner">{t('demoMode')}</div> : null}

      <Studio sessionId={sessionId} initialMessages={initialMessages} />

      {showSessions ? (
        <SessionsPanel currentId={sessionId} onResume={resume} onNew={startNew} onClose={() => setShowSessions(false)} />
      ) : null}
    </div>
  );
}
