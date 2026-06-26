import { useState, useRef, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  assistType?: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

// A realistic, on-brand markdown reply used when the live API isn't reachable (pure `vite dev`
// with no `wrangler pages dev` behind it, or not signed in). Lets the streaming UX be proven
// end-to-end without the backend — and showcases the rich markdown/table rendering.
function demoReplyFor(text: string, assist: string): string {
  const lead: Record<string, string> = {
    guidance: "Here's how I'd build it",
    research: 'A quick read on what works for this style',
    substitution: 'A substitution that holds the house style',
    scaling: 'Scaling it cleanly',
    critique: 'My honest read',
  };
  return `**${lead[assist] || 'Here’s a thought'}.** Anchored to the Añejo Golden Rule — **40% protein / 30% carbs / 30% fat** on the 16 oz bowl.

### Build
- **Base:** quinoa (swap to brown rice on request)
- **Hero protein** at 5–7 o'clock, microgreens as the signature finish
- Bright acid + a smoke-infused EVOO drizzle; no added sugars or seed oils

### Approx. macros (per 16 oz)
| Macro | Target | This build |
| --- | --- | --- |
| Protein | 40% | ~42 g |
| Carbs | 30% | ~36 g |
| Fat | 30% | ~22 g |

> Tell me your protein and any allergens and I'll lock exact quantities, scale it, and draft the menu card + caption.

*(Demo mode — connect the HUB to stream live AI grounded in your real brand brief & SOPs.)*

You said: "${text.slice(0, 120)}"`;
}

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

  const demoStream = useCallback(
    async (text: string, assist: string) => {
      const tokens = demoReplyFor(text, assist).split(/(\s+)/);
      for (const tok of tokens) {
        await new Promise((r) => setTimeout(r, 16));
        appendToLast(tok);
      }
    },
    [appendToLast],
  );

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
          await demoStream(text, assistType); // backend unavailable → still prove the UX
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
          await demoStream(text, assistType);
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [sessionId, streaming, demoStream, appendToLast],
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
