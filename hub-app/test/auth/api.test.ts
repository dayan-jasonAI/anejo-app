import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMe, createSession } from '../../src/lib/api';

// Minimal Response-like stub — api.ts only reads `.ok` and `.json()`.
function res(ok: boolean, data: unknown): Response {
  return { ok, json: async () => data } as unknown as Response;
}

describe('getMe — HUB session auth', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('authed when a staff role is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(true, { role: 'kitchen', name: 'Chef Marco' })));
    const me = await getMe();
    expect(me.authed).toBe(true);
    expect(me.role).toBe('kitchen');
    expect(me.name).toBe('Chef Marco');
  });

  it('falls back to user_type when role is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(true, { user_type: 'staff', first_name: 'Luis' })));
    const me = await getMe();
    expect(me.authed).toBe(true);
    expect(me.role).toBe('staff');
    expect(me.name).toBe('Luis');
  });

  it('unauthed when there is no role/user_type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(true, {})));
    expect((await getMe()).authed).toBe(false);
  });

  it('unauthed on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(false, { error: 'unauthorized' })));
    expect((await getMe()).authed).toBe(false);
  });

  it('unauthed (never throws) when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect((await getMe()).authed).toBe(false);
  });

  it('sends the session cookie (credentials: include)', async () => {
    const f = vi.fn().mockResolvedValue(res(true, { role: 'owner' }));
    vi.stubGlobal('fetch', f);
    await getMe();
    expect(f).toHaveBeenCalledWith('/api/me', { credentials: 'include' });
  });
});

describe('createSession — Studio session bootstrap', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns the created session id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(true, { id: 'rsess_abc123' })));
    expect(await createSession('Studio — 2026-06-23')).toEqual({ id: 'rsess_abc123' });
  });

  it('returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(false, {})));
    expect(await createSession('t')).toBeNull();
  });

  it('returns null (never throws) when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    expect(await createSession('t')).toBeNull();
  });

  it('POSTs mixed-mode with credentials', async () => {
    const f = vi.fn().mockResolvedValue(res(true, { id: 'rsess_x' }));
    vi.stubGlobal('fetch', f);
    await createSession('My title');
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('/api/hub/kitchen/studio/session');
    expect(opts.method).toBe('POST');
    expect(opts.credentials).toBe('include');
    expect(JSON.parse(opts.body)).toEqual({ mode: 'mixed', title: 'My title' });
  });
});
