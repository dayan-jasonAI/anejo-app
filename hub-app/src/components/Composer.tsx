import { useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { uploadPhoto, transcribeVoice } from '../lib/api';

const ASSIST = ['guidance', 'research', 'substitution', 'scaling', 'critique'] as const;
type Assist = (typeof ASSIST)[number];

export function Composer({
  onSend,
  streaming,
  sessionId,
}: {
  onSend: (text: string, assist: Assist) => void;
  streaming: boolean;
  sessionId: string | null;
}) {
  const { t, lang } = useI18n();
  const [text, setText] = useState('');
  const [assist, setAssist] = useState<Assist>('guidance');
  const [notice, setNotice] = useState('');
  const [recording, setRecording] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3500);
  };

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

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !sessionId) return;
    const ok = await uploadPhoto(sessionId, file);
    flash(ok ? t('photoAdded') : t('photoError'));
  }

  async function toggleRecord() {
    if (!sessionId) return;
    if (recording) {
      recRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices || typeof window.MediaRecorder === 'undefined') {
      flash(t('voiceUnavailable'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      recRef.current = mr;
      mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        flash(t('voiceTranscribing'));
        const res = await transcribeVoice(sessionId, blob, lang);
        if (res.text) {
          setText((prev) => (prev ? prev + ' ' : '') + res.text);
          setNotice('');
          ref.current?.focus();
        } else {
          flash(t('voiceUnavailable'));
        }
      };
      mr.start();
      setRecording(true);
      flash(t('voiceRecording'));
    } catch {
      flash(t('voiceDenied'));
    }
  }

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
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
          <button
            className="icon-btn"
            title={t('photo')}
            aria-label={t('photo')}
            type="button"
            disabled={!sessionId}
            onClick={() => fileRef.current?.click()}
          >
            📷
          </button>
          <button
            className={`icon-btn ${recording ? 'rec' : ''}`}
            title={t('voice')}
            aria-label={t('voice')}
            type="button"
            disabled={!sessionId}
            onClick={toggleRecord}
          >
            {recording ? '⏹' : '🎙️'}
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
        <div className="hint">{notice || t('hint')}</div>
      </div>
    </div>
  );
}
