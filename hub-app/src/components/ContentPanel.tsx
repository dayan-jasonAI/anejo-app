import { useState } from 'react';
import { useI18n } from '../lib/i18n';
import { generateContent, type StudioContent, type StudioMacros } from '../lib/api';
import '../content-panel.css';

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="cp-copybtn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
    >
      {done ? t('copied') : t('copy')}
    </button>
  );
}

function MacroCard({ m }: { m: StudioMacros }) {
  const items: Array<[string, number, string]> = [
    ['kcal', m.kcal, ''],
    ['Protein', m.protein_g, 'g'],
    ['Carbs', m.carbs_g, 'g'],
    ['Fat', m.fat_g, 'g'],
  ];
  return (
    <div className="cp-macros">
      <div className="cp-macros-name">{m.name}</div>
      <div className="cp-macros-grid">
        {items.map(([k, v, u]) => (
          <div key={k} className="cp-macro">
            <div className="cp-macro-v">
              {v}
              {u}
            </div>
            <div className="cp-macro-k">{k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContentPanel({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const { t, lang } = useI18n();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StudioContent | null>(null);
  const [err, setErr] = useState('');

  async function run() {
    if (!sessionId) {
      setErr(t('contentNeedSession'));
      return;
    }
    setLoading(true);
    setErr('');
    setData(null);
    const res = await generateContent(sessionId, name.trim());
    setLoading(false);
    if (!res) {
      setErr(t('contentError'));
      return;
    }
    setData(res);
  }

  const caption = data ? (lang === 'es' ? data.caption_es : data.caption_en) : '';
  const blurb = data ? (lang === 'es' ? data.blurb_es : data.blurb_en) : '';

  return (
    <div className="content-panel">
      <div className="cp-head">
        <div>
          <h2>
            ✨ {t('contentTitle')}
            {data?.demo ? <span className="cp-demo">demo</span> : null}
          </h2>
          <p>{t('contentSub')}</p>
        </div>
        <button type="button" className="cp-close" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>

      <div className="cp-form">
        <input
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder={t('contentNamePh')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run();
          }}
        />
        <button type="button" className="cp-go" disabled={loading || !sessionId} onClick={run}>
          {loading ? t('contentGenerating') : t('contentGenerate')}
        </button>
      </div>

      {err ? <div className="cp-err">{err}</div> : null}

      {loading ? (
        <div className="cp-skeleton">
          <div className="cp-sk-img" />
          <div className="cp-sk-lines">
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : null}

      {data ? (
        <div className="cp-result">
          <div className="cp-visual">
            {data.image_url ? (
              <img src={data.image_url} alt={name || 'Generated bowl'} />
            ) : (
              <div className="cp-noimg">{t('contentNoImage')}</div>
            )}
            {data.macros ? <MacroCard m={data.macros} /> : null}
          </div>
          <div className="cp-fields">
            <label>{t('contentCaption')}</label>
            <div className="cp-field">
              <p>{caption}</p>
              <CopyButton text={caption} />
            </div>
            <label>{t('contentBlurb')}</label>
            <div className="cp-field">
              <p>{blurb}</p>
              <CopyButton text={blurb} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
