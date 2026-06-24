import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { useStudioStream } from '../lib/useStudioStream';
import { Message } from './Message';
import { Composer } from './Composer';
import { ContentPanel } from './ContentPanel';
import { RecipePanel } from './RecipePanel';

export function Studio({ sessionId }: { sessionId: string | null }) {
  const { t } = useI18n();
  const { messages, streaming, error, send } = useStudioStream(sessionId);
  const streamRef = useRef<HTMLDivElement>(null);
  const [showContent, setShowContent] = useState(false);
  const [showRecipe, setShowRecipe] = useState(false);

  // Auto-scroll to the newest content as it streams in.
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const suggestions = ['s1', 's2', 's3', 's4'];

  return (
    <div className="studio">
      <div className="studio-bar">
        <button
          type="button"
          className={`cp-toggle${showContent ? ' on' : ''}`}
          onClick={() => { setShowContent((v) => !v); setShowRecipe(false); }}
        >
          ✨ {t('contentOpen')}
        </button>
        <button
          type="button"
          className={`cp-toggle${showRecipe ? ' on' : ''}`}
          onClick={() => { setShowRecipe((v) => !v); setShowContent(false); }}
        >
          🍳 {t('recipeOpen')}
        </button>
      </div>
      {showContent ? <ContentPanel sessionId={sessionId} onClose={() => setShowContent(false)} /> : null}
      {showRecipe ? <RecipePanel sessionId={sessionId} onClose={() => setShowRecipe(false)} /> : null}
      <div className="stream" ref={streamRef}>
        <div className="stream-inner">
          {messages.length === 0 ? (
            <div className="empty">
              <h1>
                {t('greeting')} <em>?</em>
              </h1>
              <p>{t('greetingSub')}</p>
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button key={s} className="chip" onClick={() => send(t(s), 'guidance')}>
                    {t(s)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <Message key={m.id} msg={m} streaming={streaming && i === messages.length - 1} />
            ))
          )}
          {error ? <div className="err">{error}</div> : null}
        </div>
      </div>
      <Composer onSend={send} streaming={streaming} sessionId={sessionId} />
    </div>
  );
}
