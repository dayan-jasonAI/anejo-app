import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ values: [] as any[] }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = state.values.push(initial) - 1;
    return [initial, (value: any) => {
      state.values[index] = typeof value === 'function' ? value(state.values[index]) : value;
    }];
  },
  useRef: (current: unknown) => ({ current }),
  useCallback: (fn: unknown) => fn,
}));
import { useStudioStream } from '../../src/lib/useStudioStream';

beforeEach(() => { state.values = []; });
afterEach(() => { vi.unstubAllGlobals(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

it('does not send without a saved session', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await useStudioStream(null).send('recipe', 'guidance');
  expect(fetcher).not.toHaveBeenCalled();
});

it('blocks double sends before React has rerendered', async () => {
  const pending = deferred<Response>();
  const fetcher = vi.fn(() => pending.promise); vi.stubGlobal('fetch', fetcher);
  const hook = useStudioStream('s1');
  const first = hook.send('first', 'guidance');
  await hook.send('second', 'guidance');
  expect(fetcher).toHaveBeenCalledTimes(1);
  pending.resolve(new Response('recipe')); await first;
});

it('an old response cannot overwrite a resumed session or clear a new request', async () => {
  const old = deferred<Response>(), current = deferred<Response>();
  const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  vi.stubGlobal('fetch', fetcher);
  const hook = useStudioStream('s1');
  const first = hook.send('old prompt', 'guidance');
  hook.seed([{ id: 'saved', role: 'assistant', text: 'saved recipe' }]);
  const second = hook.send('new prompt', 'guidance');
  old.resolve(new Response(JSON.stringify({ error: 'old error' }), { status: 503 }));
  await first;
  expect(state.values[1]).toBe(true);
  expect(state.values[2]).toBeNull();
  expect(state.values[0][0].text).toBe('saved recipe');
  await hook.send('duplicate', 'guidance');
  expect(fetcher).toHaveBeenCalledTimes(2);
  current.resolve(new Response('new recipe')); await second;
  expect(state.values[0].at(-1).text).toBe('new recipe');
  expect(state.values[1]).toBe(false);
});

it('late chunks from an aborted stream cannot append to the next transcript', async () => {
  const chunk = deferred<ReadableStreamReadResult<Uint8Array>>();
  const read = vi.fn(() => chunk.promise), cancel = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, body: { getReader: () => ({ read, cancel }) } })));
  const hook = useStudioStream('s1');
  const pending = hook.send('old', 'guidance');
  await Promise.resolve();
  hook.seed([{ id: 'new', role: 'assistant', text: 'new session' }]);
  chunk.resolve({ done: false, value: new TextEncoder().encode(' old recipe') });
  await pending;
  expect(state.values[0][0].text).toBe('new session');
  expect(cancel).toHaveBeenCalledOnce();
});
