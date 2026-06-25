import { useState } from 'react';
import { useI18n } from '../lib/i18n';
import { draftRecipe, createRecipe, publishRecipe, type RecipeDraft } from '../lib/api';
import '../content-panel.css';

export function RecipePanel({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [name, setName] = useState('');
  const [demo, setDemo] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [err, setErr] = useState('');

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
    setName(res.draft.name || '');
    setDemo(!!res.demo);
  }

  async function publish() {
    if (!sessionId || !draft) return;
    setPublishing(true);
    setErr('');
    const created = await createRecipe(sessionId, { ...draft, name: name.trim() || draft.name });
    if (!created || !created.recipe) {
      setPublishing(false);
      setErr(t('recipeError'));
      return;
    }
    const ok = await publishRecipe(created.recipe.id);
    setPublishing(false);
    if (!ok) {
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
              <label>{t('recipeName')}</label>
              <input className="rp-name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
              {draft.summary ? <p className="rp-summary">{draft.summary}</p> : null}
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
                <button type="button" className="cp-copybtn" disabled={publishing} onClick={runDraft}>
                  {t('recipeDraft')}
                </button>
                <button type="button" className="cp-go" disabled={publishing} onClick={publish}>
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
