import { useState, useRef, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  assistType?: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function useStudioStream(sessionId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const appendToLast = useCallback((chunk: string) => {
    setMessages((m) => {
      if (!m.length) return m;
      const copy = m.slice();
      const last = copy[copy.length - 1];
      if (last.role === 'assistant') copy[copy.length - 1] = { ...last, text: last.text + chunk };
      return copy;
    });
  }, []);

  const replaceLastAssistant = useCallback((text: string) => {
    setMessages((m) => {
      if (!m.length) return m;
      const copy = m.slice();
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === 'assistant') {
          copy[i] = { ...copy[i], text };
          break;
        }
      }
      return copy;
    });
  }, []);

  const send = useCallback(
    async (text: string, assistType: string) => {
      if (!text.trim() || streaming) return;
      setError(null);
      setMessages((m) => [
        ...m,
        { id: uid(), role: 'user', text, assistType },
        { id: uid(), role: 'assistant', text: '', assistType },
      ]);
      setStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const r = await fetch('/api/hub/kitchen/studio/stream', {
          method: 'POST',
          credentials: 'include',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, text, assist_type: assistType }),
        });
        if (!r.ok || !r.body) {
          let msg = 'Creative Studio AI is unavailable. This turn was not drafted or saved as a recipe-ready AI response.';
          try {
            const d = await r.json();
            if (d && d.error) msg = d.error;
          } catch { /* response was not JSON */ }
          setError(msg);
          replaceLastAssistant(msg);
        } else {
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            appendToLast(dec.decode(value, { stream: true }));
          }
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          appendToLast(' …(stopped)');
        } else {
          const msg = 'Creative Studio AI could not be reached. Check the HUB connection before drafting a recipe or Brief proposal.';
          setError(msg);
          replaceLastAssistant(msg);
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [sessionId, streaming, appendToLast, replaceLastAssistant],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // Replace the transcript — used when resuming a past conversation or starting a fresh one.
  const seed = useCallback((msgs: ChatMessage[]) => {
    abortRef.current?.abort();
    setError(null);
    setStreaming(false);
    setMessages(msgs);
  }, []);

  return { messages, streaming, error, send, stop, seed };
}
