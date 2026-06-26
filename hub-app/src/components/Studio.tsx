import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { useStudioStream, type ChatMessage } from '../lib/useStudioStream';
import { Message } from './Message';
import { Composer } from './Composer';
import { ContentPanel } from './ContentPanel';
import { RecipePanel } from './RecipePanel';
import { BriefPanel } from './BriefPanel';

export function Studio({ sessionId, initialMessages }: { sessionId: string | null; initialMessages?: ChatMessage[] }) {
  const { t } = useI18n();
  const { messages, streaming, error, send, seed } = useStudioStream(sessionId);
  const streamRef = useRef<HTMLDivElement>(null);
  const [showContent, setShowContent] = useState(false);
  const [showRecipe, setShowRecipe] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const closeAll = () => { setShowContent(false); setShowRecipe(false); setShowBrief(false); };

  // On session switch (resume a past conversation or start a new one), load its transcript.
  useEffect(() => {
    seed(initialMessages || []);
    closeAll();
    // initialMessages is set together with sessionId, so keying on sessionId is sufficient.

  }, [sessionId]);

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
          onClick={() => { const v = !showRecipe; closeAll(); setShowRecipe(v); }}
        >
          🍳 {t('recipeOpen')}
        </button>
        <button
          type="button"
          className={`cp-toggle${showBrief ? ' on' : ''}`}
          onClick={() => { const v = !showBrief; closeAll(); setShowBrief(v); }}
        >
          🧭 {t('briefOpen')}
        </button>
      </div>
      {showContent ? <ContentPanel sessionId={sessionId} onClose={() => setShowContent(false)} /> : null}
      {showRecipe ? <RecipePanel sessionId={sessionId} onClose={() => setShowRecipe(false)} /> : null}
      {showBrief ? <BriefPanel sessionId={sessionId} onClose={() => setShowBrief(false)} /> : null}
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
