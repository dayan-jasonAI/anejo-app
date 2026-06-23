import { useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';

const ASSIST = ['guidance', 'research', 'substitution', 'scaling', 'critique'] as const;
type Assist = (typeof ASSIST)[number];

export function Composer({
  onSend,
  streaming,
}: {
  onSend: (text: string, assist: Assist) => void;
  streaming: boolean;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [assist, setAssist] = useState<Assist>('guidance');
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const v = text.trim();
    if (!v || streaming) return;
    onSend(v, assist);
    setText('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  return (
    <div className="composer">
      <div className="composer-inner">
        <div className="assist-row" role="tablist" aria-label="Assist mode">
          {ASSIST.map((a) => (
            <button
              key={a}
              role="tab"
              aria-selected={assist === a}
              className={`seg ${assist === a ? 'active' : ''}`}
              onClick={() => setAssist(a)}
            >
              {t(a)}
            </button>
          ))}
        </div>
        <div className="input-wrap">
          <button className="icon-btn" title={t('photo')} aria-label={t('photo')} type="button">
            📷
          </button>
          <button className="icon-btn" title={t('voice')} aria-label={t('voice')} type="button">
            🎙️
          </button>
          <textarea
            ref={ref}
            rows={1}
            value={text}
            placeholder={t('placeholder')}
            onInput={(e) => {
              setText((e.target as HTMLTextAreaElement).value);
              grow(e.target as HTMLTextAreaElement);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button className="send" onClick={submit} disabled={!text.trim() || streaming} aria-label={t('send')}>
            {streaming ? <span className="spinner" /> : '↑'}
          </button>
        </div>
        <div className="hint">{t('hint')}</div>
      </div>
    </div>
  );
}
