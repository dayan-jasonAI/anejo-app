import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '../lib/useStudioStream';
import { useI18n } from '../lib/i18n';

export function Message({ msg, streaming }: { msg: ChatMessage; streaming: boolean }) {
  const { t } = useI18n();
  const isMe = msg.role === 'user';
  return (
    <div className={`msg ${isMe ? 'me' : 'ai'}`}>
      <div className={`avatar ${isMe ? 'me' : 'ai'}`}>{isMe ? '🙂' : 'A'}</div>
      <div className="bubble">
        <div className="role">
          {isMe ? t('you') : t('souschef')}
          {msg.assistType && !isMe ? <span className="assist-tag"> · {t(msg.assistType)}</span> : null}
        </div>
        <div className="content">
          {isMe ? (
            <p>{msg.text}</p>
          ) : msg.text ? (
            <>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
              {streaming ? <span className="cursor" /> : null}
            </>
          ) : (
            <span className="spinner" aria-label={t('thinking')} />
          )}
        </div>
      </div>
    </div>
  );
}
