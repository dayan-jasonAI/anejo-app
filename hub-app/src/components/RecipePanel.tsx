import { useState } from 'react';
import { useI18n } from '../lib/i18n';
import { draftRecipe, type RecipeDraft } from '../lib/api';
import { publishRecipeDraft } from '../lib/publishRecipeDraft';
import '../content-panel.css';

export function RecipePanel({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [name, setName] = useState('');
  const [demo, setDemo] = useState(false);
  const [reason, setReason] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [err, setErr] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  function reasonText() {
    if (reason === 'empty_session') return t('recipeReasonEmpty');
    if (reason === 'ai_truncated') return t('recipeReasonTruncated');
    if (reason === 'no_key') return t('recipeReasonKey');
    return t('recipeReasonAI'); // ai_http_*, ai_unparseable, ai_exception, unknown
  }

  async function runDraft() {
    if (!sessionId) {
      setErr(t('contentNeedSession'));
      return;
    }
    setDrafting(true);
    setErr('');
    setPublished(false);
    const res = await draftRecipe(sessionId);
    setDrafting(false);
    if (!res || !res.draft) {
      setErr(t('recipeError'));
      return;
    }
    setDraft(res.draft);
    setSavedId(null);
    setName(res.draft.name || '');
    setDemo(!!res.demo);
    setReason(res.reason || '');
  }

  async function publish() {
    if (!sessionId || !draft || demo || drafting || publishing) return;
    setPublishing(true);
    setErr('');
    const result = await publishRecipeDraft(sessionId, { ...draft, name: name.trim() || draft.name }, savedId);
    setSavedId(result.recipeId);
    setPublishing(false);
    if (!result.ok) {
      setErr(t('recipeError'));
      return;
    }
    setPublished(true);
  }

  return (
    <div className="content-panel">
      <div className="cp-head">
        <div>
          <h2>
            🍳 {t('recipeTitle')}
            {demo ? <span className="cp-demo">demo</span> : null}
          </h2>
          <p>{t('recipeSub')}</p>
        </div>
        <button type="button" className="cp-close" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>

      {published ? (
        <div className="rp-done">
          ✅ {t('recipePublished')}
          <a className="cp-go rp-lib" href="/hub/kitchen/library.html">
            {t('openLibrary')}
          </a>
        </div>
      ) : (
        <>
          {!draft ? (
            <div className="cp-form">
              <button type="button" className="cp-go" disabled={drafting || !sessionId} onClick={runDraft}>
                {drafting ? t('recipeDrafting') : t('recipeDraft')}
              </button>
            </div>
          ) : (
            <div className="rp-draft">
              {demo ? (
                <div className="cp-err rp-warn">
                  <strong>⚠ {t('recipeDemoTitle')}</strong>
                  <div>{reasonText()}</div>
                  <div className="rp-warn-block">{t('recipeDemoBlock')}</div>
                </div>
              ) : null}
              <label>{t('recipeName')}</label>
              <input className="rp-name" value={name} disabled={publishing || !!savedId} onChange={(e) => setName(e.currentTarget.value)} />
              {draft.summary && !demo ? <p className="rp-summary">{draft.summary}</p> : null}
              {draft.ingredients && draft.ingredients.length ? (
                <>
                  <label>{t('recipeIngredients')}</label>
                  <ul className="rp-list">
                    {draft.ingredients.map((it, i) => (
                      <li key={i}>{it}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {draft.steps && draft.steps.length ? (
                <>
                  <label>{t('recipeSteps')}</label>
                  <ol className="rp-list rp-steps">
                    {draft.steps.map((st, i) => (
                      <li key={i}>{st}</li>
                    ))}
                  </ol>
                </>
              ) : null}
              <div className="rp-actions">
                <button type="button" className="cp-copybtn" disabled={publishing || drafting} onClick={runDraft}>
                  {t('recipeDraft')}
                </button>
                <button type="button" className="cp-go" disabled={publishing || drafting || demo} onClick={publish}>
                  {publishing ? t('recipePublishing') : t('recipePublish')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {err ? <div className="cp-err">{err}</div> : null}
    </div>
  );
}
