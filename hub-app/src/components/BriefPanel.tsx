import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { draftBriefChange, submitBriefProposal, listMyBriefProposals, type BriefDraft, type MyBriefProposal } from '../lib/api';
import '../content-panel.css';

export function BriefPanel({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const [instruction, setInstruction] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<BriefDraft | null>(null);
  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');
  const [demo, setDemo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState('');
  const [mine, setMine] = useState<MyBriefProposal[]>([]);

  const loadMine = () => listMyBriefProposals().then(setMine);
  useEffect(() => { loadMine(); }, []);

  async function runDraft() {
    if (!sessionId) { setErr(t('contentNeedSession')); return; }
    setDrafting(true); setErr(''); setSubmitted(false);
    const res = await draftBriefChange(sessionId, instruction.trim());
    setDrafting(false);
    if (!res || !res.draft) { setErr(t('briefError')); return; }
    setDraft(res.draft);
    setTitle(res.draft.title || '');
    setRationale(res.draft.rationale || '');
    setDemo(!!res.demo);
  }

  async function submit() {
    if (!sessionId || !draft) return;
    setSubmitting(true); setErr('');
    const ok = await submitBriefProposal(sessionId, { title: title.trim() || draft.title, rationale: rationale.trim(), proposed_body: draft.proposed_body });
    setSubmitting(false);
    if (!ok) { setErr(t('briefError')); return; }
    setSubmitted(true);
    loadMine();
  }

  return (
    <div className="content-panel">
      <div className="cp-head">
        <div>
          <h2>🧭 {t('briefTitle')}{demo ? <span className="cp-demo">demo</span> : null}</h2>
          <p>{t('briefSub')}</p>
        </div>
        <button type="button" className="cp-close" onClick={onClose} aria-label={t('close')}>×</button>
      </div>

      {submitted ? (
        <div className="rp-done">✅ {t('briefSubmitted')}</div>
      ) : (
        <>
          {!draft ? (
            <div className="rp-draft">
              <label>{t('briefInstruction')}</label>
              <textarea
                className="bp-instruction"
                rows={3}
                value={instruction}
                placeholder={t('briefPlaceholder')}
                onChange={(e) => setInstruction(e.currentTarget.value)}
              />
              <button type="button" className="cp-go" disabled={drafting || !sessionId} onClick={runDraft}>
                {drafting ? t('briefDrafting') : t('briefDraft')}
              </button>
            </div>
          ) : (
            <div className="rp-draft">
              <div className="bp-pending">{t('briefPendingNote')}</div>
              <label>{t('briefChangeTitle')}</label>
              <input className="rp-name" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
              <label>{t('briefRationale')}</label>
              <textarea className="bp-instruction" rows={2} value={rationale} onChange={(e) => setRationale(e.currentTarget.value)} />
              <label>{t('briefProposed')}</label>
              <pre className="bp-body">{draft.proposed_body}</pre>
              <div className="rp-actions">
                <button type="button" className="cp-copybtn" disabled={submitting} onClick={() => setDraft(null)}>{t('briefRedraft')}</button>
                <button type="button" className="cp-go" disabled={submitting} onClick={submit}>
                  {submitting ? t('briefSubmitting') : t('briefSubmit')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {err ? <div className="cp-err">{err}</div> : null}

      {mine.length ? (
        <div className="bp-mine">
          <h4>{t('briefYourRequests')}</h4>
          {mine.slice(0, 6).map((p) => (
            <div key={p.id} className="bp-mine-item">
              <div className="bp-mine-top">
                <span className="bp-mine-title">{p.title || '—'}</span>
                <span className={`bp-status st-${p.status}`}>{t('briefStatus_' + p.status)}</span>
              </div>
              {p.decision_note && (p.status === 'rejected' || p.status === 'needs_info') ? (
                <div className="bp-mine-note"><strong>{t('briefOwnerNote')}:</strong> {p.decision_note}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
