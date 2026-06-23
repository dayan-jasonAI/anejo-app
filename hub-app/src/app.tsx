import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from './lib/i18n';
import { getMe, createSession } from './lib/api';
import { Studio } from './components/Studio';

export function App() {
  const { t, lang, toggle } = useI18n();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const [sessionId, setSessionId] = useState<string | null>(null);

  // When signed in to the HUB, open a real Studio session so turns persist + ground in brand/SOP.
  useEffect(() => {
    if (me?.authed && !sessionId) {
      createSession('Studio — ' + new Date().toISOString().slice(0, 10)).then((s) => {
        if (s?.id) setSessionId(s.id);
      });
    }
  }, [me?.authed, sessionId]);

  const demo = me && !me.authed;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">AÑEJO</span>
          <span className="sub">{t('studio')}</span>
        </div>
        <span className="spacer" />
        {me?.authed ? <span className="who">{me.name || me.role}</span> : null}
        <button className="toggle" onClick={toggle} aria-label="Language">
          {lang === 'en' ? 'ES' : 'EN'}
        </button>
      </header>

      {demo ? <div className="demo-banner">{t('demoMode')}</div> : null}

      <Studio sessionId={sessionId} />
    </div>
  );
}
